import subprocess
import os
import re
import json
from audra import config

class ValidationLayer:
    @staticmethod
    def probe_media(file_path):
        """Use ffprobe to validate the file existence and extract metadata."""
        try:
            cmd = [
                config.FFPROBE_BINARY, "-v", "error", "-i", file_path,
                "-show_entries", "format=duration:stream=duration,width,height,codec_name,codec_type",
                "-of", "json"
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return json.loads(result.stdout)
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    def get_true_duration(file_path):
        """Deep decode scan to find true duration of potentially corrupt files."""
        try:
            # Force full scan
            cmd = [config.FFMPEG_BINARY, "-i", file_path, "-f", "null", "-"]
            result = subprocess.run(cmd, capture_output=True, text=True)
            match = re.search(r"time=(\d+):(\d+):(\d+\.\d+)", result.stderr)
            if match:
                h, m, s = match.groups()
                return int(h)*3600 + int(m)*60 + float(s)
            return 0
        except:
            return 0

    @staticmethod
    def normalize_audio(file_path):
        """Forced normalization to high-quality WAV to eliminate container issues."""
        target = file_path + ".normalized.wav"
        try:
            cmd = [
                config.FFMPEG_BINARY, "-y", "-i", file_path,
                "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2",
                target
            ]
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return target
        except Exception:
            return None

    @staticmethod
    def validate_and_repair(file_path, is_audio=True):
        """
        Main entry point for validation layer.
        Performs check -> normalization -> final probe.
        """
        metadata = ValidationLayer.probe_media(file_path)
        if "error" in metadata:
            return None, "Corrupt or unsupported media file."

        if is_audio:
            repaired = ValidationLayer.normalize_audio(file_path)
            if not repaired:
                return None, "Failed to normalize audio stream."
            
            # Final verification of duration on repaired file
            true_dur = ValidationLayer.get_true_duration(repaired)
            return repaired, {"duration": true_dur, "format": "wav"}
        else:
            # For images, we just verify they can be read
            # Optional: normalize to a standard PNG/JPG if needed
            return file_path, metadata.get("format", {})

    @staticmethod
    def validate_visual(file_path, kind="image"):
        """
        Validate a background source (still image or video clip).
        Returns (path, metadata) on success or (None, error_string) on failure.
        """
        metadata = ValidationLayer.probe_media(file_path)
        if "error" in metadata:
            return None, "Corrupt or unsupported media file."

        # ffprobe reports codec_type 'video' for stills too (mjpeg/png/webp),
        # so this one check covers both kinds: it rejects an .mp4 that carries
        # only an audio stream just as it rejects a mislabelled non-media file.
        video_streams = [
            s for s in metadata.get("streams", [])
            if s.get("codec_type") == "video"
        ]
        if not video_streams:
            label = "video" if kind == "video" else "image"
            return None, f"No usable {label} stream found in the uploaded file."

        stream = video_streams[0]
        return file_path, {
            "kind": kind,
            "width": stream.get("width"),
            "height": stream.get("height"),
            "codec": stream.get("codec_name"),
            "duration": float(metadata.get("format", {}).get("duration") or 0),
        }
