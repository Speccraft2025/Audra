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
    def render_job(job_id, audio_path, image_path, platform, output_path, settings=None, wm_image_path=None):
        """Main rendering pipeline with non-blocking progress tracking and resource safety."""
        
        # 1. Platform & Duration Configuration
        PLATFORMS = {
            'youtube': (1920, 1080), 'instagram_square': (1080, 1080),
            'portrait': (1080, 1920), 'landscape': (1920, 1080)
        }
        w, h = PLATFORMS.get(platform, (1920, 1080))
        is_social = (platform == 'portrait')
        is_gif = image_path.lower().endswith('.gif')
        
        # Duration from job metadata (assuming it was probed in validation)
        job = manager.get_job(job_id)
        raw_duration = job.get('duration', 30.0)
        render_duration = 30.0 if is_social else raw_duration

        # 2. Build Filter Graph
        fb = FilterBuilder()
        fb.add(f"scale={w}:{h}:force_original_aspect_ratio=decrease")
        fb.add(f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black")
        
        if settings and settings.get("effect"):
            fb.add(apply_effect_preset(settings["effect"], w, h, duration=render_duration))
        if settings and settings.get("text_overlays"):
            for ov in settings["text_overlays"]:
                fb.add(text_overlay(ov['text'], ov['start'], ov['end']))
        if settings and settings.get("watermark_text"):
            fb.add(text_watermark(settings["watermark_text"]))
            
        filter_str = fb.build()

        # 3. Construct Command
        cmd = ['ffmpeg', '-y', '-threads', '0']
        
        # Inputs
        if is_gif:
            cmd += ['-stream_loop', '-1', '-i', image_path]
        else:
            cmd += ['-framerate', '25', '-loop', '1', '-i', image_path]
            
        cmd += ['-i', audio_path]
        
        if wm_image_path:
            cmd += ['-i', wm_image_path]
            wm_scale = settings.get("watermark_scale", 0.15) if settings else 0.15
            wm_pos = settings.get("watermark_position", "bottom-right") if settings else "bottom-right"
            fc = (
                f"[0:v]{filter_str}[bg_proc];"
                f"[2:v]scale=iw*{wm_scale}:-1[wm_scaled];"
                f"[bg_proc][wm_scaled]{image_watermark(wm_pos)}[outv]"
            )
            cmd += ['-filter_complex', fc, '-map', '[outv]', '-map', '1:a']
        else:
            cmd += ['-vf', filter_str, '-map', '0:v', '-map', '1:a']

        # Codecs & Delivery Hardening
        cmd += ['-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', 
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
        
        if is_social: cmd += ['-t', '30']
        cmd += ['-shortest', output_path]

        MonitoringService.log_event(f"Starting Render: {job_id[:8]}", job_id=job_id)

        try:
            # Managed slot (Semaphore)
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

                for line in process.stderr:
                    match = re.search(r"time=(\d+):(\d+):(\d+\.\d+)", line)
                    if match:
                        h, m, s = match.groups()
                        cur_secs = int(h)*3600 + int(m)*60 + float(s)
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
                    err = f"FFmpeg failed with code {process.returncode}"
                    manager.update_job(job_id, {"status": "failed", "error": err})
                    MonitoringService.log_event(err, job_id=job_id, level="ERROR")
                    
        except Exception as e:
            manager.update_job(job_id, {"status": "failed", "error": str(e)})
            MonitoringService.log_event(f"Render Exception: {e}", job_id=job_id, level="ERROR")
            if job_id in manager.active_processes:
                manager.unregister_process(job_id)
