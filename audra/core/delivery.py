import os
import hashlib
import re
from flask import send_file, make_response, jsonify
from audra import config

class DeliveryLayer:
    @staticmethod
    def calculate_sha256(file_path):
        """Standard integrity check for scale-ready delivery."""
        sha256_hash = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            return sha256_hash.hexdigest()
        except:
            return None

    @staticmethod
    def prepare_download(filename):
        """Hardened delivery with MIME enforcement and integrity headers."""
        filename = os.path.basename(filename)
        file_path = os.path.join(config.OUTPUT_DIR, filename)
        if not os.path.exists(file_path):
            return jsonify({"error": "File not found", "code": "DELIVERY_ERROR"}), 404

        # Strict sanitization
        safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
        is_zip = safe_name.lower().endswith('.zip')
        if not is_zip and not safe_name.lower().endswith('.mp4'):
            safe_name += '.mp4'

        # Calculate integrity hash
        file_hash = DeliveryLayer.calculate_sha256(file_path)

        response = make_response(send_file(
            file_path,
            mimetype='application/zip' if is_zip else 'video/mp4',
            as_attachment=True,
            download_name=safe_name
        ))

        # Delivery Hardening
        response.headers["Content-Disposition"] = f"attachment; filename=\"{safe_name}\""
        response.headers["Content-Type"] = "application/zip" if is_zip else "video/mp4"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Audra-Integrity"] = file_hash or "unavailable"
        response.headers["X-Audra-Engine-Version"] = config.ENGINE_VERSION
        
        # Add Content-Length for reliable transfer metrics
        response.headers["Content-Length"] = os.path.getsize(file_path)

        return response
