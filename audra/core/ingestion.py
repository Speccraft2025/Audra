import os
import re
from pathlib import Path
from audra import config

class IngestionLayer:
    @staticmethod
    def sanitize_filename(name: str) -> str:
        """Strictly removes characters that are problematic in filenames."""
        name = re.sub(r'[\\/:*?"<>|]', '_', name)
        name = re.sub(r'\s+', '_', name)
        return name[:120]

    @staticmethod
    def validate_file_size(file_storage) -> bool:
        """Ensure file does not exceed MAX_FILE_SIZE_MB."""
        file_storage.seek(0, os.SEEK_END)
        size_mb = file_storage.tell() / (1024 * 1024)
        file_storage.seek(0)
        return size_mb <= config.MAX_FILE_SIZE_MB

    @staticmethod
    def is_allowed_audio(filename: str) -> bool:
        return Path(filename).suffix.lower() in config.ALLOWED_EXTENSIONS_AUDIO

    @staticmethod
    def is_allowed_image(filename: str) -> bool:
        return Path(filename).suffix.lower() in config.ALLOWED_EXTENSIONS_IMAGE

    @staticmethod
    def is_allowed_video(filename: str) -> bool:
        return Path(filename).suffix.lower() in config.ALLOWED_EXTENSIONS_VIDEO

    @staticmethod
    def classify_visual(filename: str) -> str:
        """Returns 'video' or 'image' for a background source upload."""
        return "video" if IngestionLayer.is_allowed_video(filename) else "image"

    @staticmethod
    def save_upload(file_storage, prefix: str) -> str:
        """Safe save with UUID prefix and sanitized name."""
        ext = Path(file_storage.filename).suffix
        safe_name = IngestionLayer.sanitize_filename(Path(file_storage.filename).stem)
        final_filename = f"{prefix}_{safe_name}{ext}"
        path = os.path.join(config.INPUT_DIR, final_filename)
        file_storage.save(path)
        return path
