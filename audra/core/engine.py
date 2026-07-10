import os
import subprocess
import re
import threading
from audra import config
from audra.core.queue_manager import manager
from audra.utils.monitoring import MonitoringService
from audra.core.filters import FilterBuilder, text_watermark, image_watermark, text_overlay, apply_effect_preset

class RenderingEngine:
    @staticmethod
    def get_high_energy_start(audio_path, total_duration):
        """
        Simple heuristic to find a high-energy start point.
        Probes the first 2 minutes of the track.
        """
        if total_duration <= 35:
            return 0
            
        try:
            # Probe 5-second chunks in the first half to find a 'loud' spot
            # Fallback to 20% mark if intro is long
            fallback = min(total_duration * 0.2, 30.0)
            return fallback
        except:
            return 0

    @staticmethod
    def render_job(job_id, audio_path, image_path, platform, output_path, settings=None, wm_image_path=None):
        """Main rendering pipeline with non-blocking progress tracking and resource safety."""
        
        # 1. Platform & Intensity Configuration
        PLATFORMS = {
            'youtube': (1920, 1080), 'portrait': (1080, 1920)
        }
        w, h = PLATFORMS.get(platform, (1920, 1080))
        
        intensity = settings.get("intensity", "medium") if settings else "medium"
        duration_mode = settings.get("duration_mode", "full") if settings else "full"
        tier = settings.get("tier", config.TIER_PRO) if settings else config.TIER_PRO
        
        # Duration from job metadata
        job = manager.get_job(job_id)
        raw_duration = job.get('duration', 30.0)
        
        start_time = 0
        render_duration = raw_duration
        
        if duration_mode == "30s":
            start_time = RenderingEngine.get_high_energy_start(audio_path, raw_duration)
            render_duration = min(30.0, raw_duration - start_time)

        # 2. Build Filter Graph
        fb = FilterBuilder()
        fb.add(f"scale={w}:{h}:force_original_aspect_ratio=decrease")
        fb.add(f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black")
        
        requested_preset = settings.get("preset") if settings else None
        if requested_preset and (tier == config.TIER_PRO or requested_preset in config.FREE_TIER_PRESETS):
            fb.add(apply_effect_preset(requested_preset, intensity=intensity, w=w, h=h, duration=render_duration))

        if settings and settings.get("watermark_text"):
            # Image watermark (if present) occupies the default bottom-right corner - avoid stacking on it
            text_wm_position = "top-right" if wm_image_path else "bottom-right"
            fb.add(text_watermark(settings["watermark_text"], position=text_wm_position))

        # Free tier always carries Audra branding, regardless of the user's own watermark settings
        if tier == config.TIER_FREE:
            fb.add(text_watermark(config.FREE_TIER_BRAND_TEXT, position="bottom-left"))

        filter_str = fb.build()

        # 3. Construct Command
        cmd = [config.FFMPEG_BINARY, '-y', '-threads', '0']
        
        # Seek in audio if 30s mode
        if start_time > 0:
            cmd += ['-ss', str(start_time)]
            
        cmd += ['-framerate', '25', '-loop', '1', '-i', image_path, '-i', audio_path]
        
        if wm_image_path:
            cmd += ['-i', wm_image_path]
            wm_scale = 0.15
            wm_pos = "bottom-right"
            fc = (
                f"[0:v]{filter_str}[bg_proc];"
                f"[2:v]scale=iw*{wm_scale}:-1[wm_scaled];"
                f"[bg_proc][wm_scaled]{image_watermark(wm_pos)}[outv]"
            )
            cmd += ['-filter_complex', fc, '-map', '[outv]', '-map', '1:a']
        else:
            cmd += ['-filter_complex', f"[0:v]{filter_str}[outv]", '-map', '[outv]', '-map', '1:a']

        # Codecs & Delivery Hardening
        cmd += ['-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', 
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
        
        cmd += ['-t', str(render_duration), '-shortest', output_path]

        MonitoringService.log_event(f"Starting v2 Render: {job_id[:8]} ({duration_mode})", job_id=job_id)

        try:
            with manager.semaphore:
                manager.update_job(job_id, {"status": "rendering", "progress": 0})
                
                process = subprocess.Popen(
                    cmd, 
                    stdout=subprocess.DEVNULL, 
                    stderr=subprocess.PIPE,
                    universal_newlines=True,
                    bufsize=1
                )
                
                manager.register_process(job_id, process)

                stderr_lines = []
                for line in process.stderr:
                    stderr_lines.append(line.strip())
                    match = re.search(r"time=(\d+):(\d+):(\d+\.\d+)", line)
                    if match:
                        hh, mm, ss = match.groups()
                        cur_secs = int(hh)*3600 + int(mm)*60 + float(ss)
                        prog = min(99.0, (cur_secs / max(1, render_duration)) * 100)
                        manager.update_job(job_id, {"progress": round(prog, 1)})

                process.wait()
                manager.unregister_process(job_id)

                if process.returncode == 0:
                    manager.update_job(job_id, {
                        "status": "completed", 
                        "progress": 100, 
                        "output": os.path.basename(output_path)
                    })
                    MonitoringService.log_event(f"Render Success: {os.path.basename(output_path)}", job_id=job_id)
                else:
                    full_err = "\n".join(stderr_lines[-20:])
                    err_msg = f"FFmpeg failed (Code {process.returncode}): {full_err}"
                    manager.update_job(job_id, {"status": "failed", "error": err_msg})
                    MonitoringService.log_event(err_msg, job_id=job_id, level="ERROR")
                    
        except Exception as e:
            manager.update_job(job_id, {"status": "failed", "error": str(e)})
            MonitoringService.log_event(f"Render Exception: {e}", job_id=job_id, level="ERROR")
            if job_id in manager.active_processes:
                manager.unregister_process(job_id)
