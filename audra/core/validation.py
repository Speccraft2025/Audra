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
                "-show_entries", "format=duration:stream=duration,width,height,codec_name",
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
