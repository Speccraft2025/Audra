import os
import uuid
import threading
import json
from flask import Flask, request, jsonify, send_file, g
from flask_cors import CORS

# Modular Audra Engine Imports
from audra import config
from audra.core.ingestion import IngestionLayer
from audra.core.validation import ValidationLayer
from audra.core.queue_manager import manager
from audra.core.engine import RenderingEngine
from audra.core.delivery import DeliveryLayer
from audra.utils.monitoring import MonitoringService

app = Flask(__name__, static_folder='static', static_url_path='/static')
CORS(app)
from audra.saas_auth import attach_tier
from audra import licensing
# ─── API Routes (Hardened & Modular) ────────────────────────────────────────

@app.route('/')
def index():
    return send_file(os.path.join(config.BASE_DIR, 'index.html'))

@app.route('/workspace')
def workspace():
    return send_file(os.path.join(config.BASE_DIR, 'workspace.html'))

@app.route('/process', methods=['POST'])
@attach_tier
def process():
    """
    INGESTION LAYER triggered.
    Performs sanitization, validation, and normalization before queueing.
    """
    created_jobs = []
    tier_blocked = []
    i = 0
    
    while f'audio_{i}' in request.files:
        audio_file = request.files[f'audio_{i}']
        image_file = request.files[f'image_{i}']
        wm_file = request.files.get(f'watermark_image_{i}')
        
        settings_raw = request.form.get(f'settings_{i}', '{}')
        try: settings = json.loads(settings_raw)
        except: settings = {}
        
        platforms_raw = request.form.get(f'platforms_{i}', 'youtube')
        platforms = [p.strip() for p in platforms_raw.split(',') if p.strip()]

        pair_uuid = str(uuid.uuid4())
        
        # 1. Ingestion & Validation
        master_audio_tmp = IngestionLayer.save_upload(audio_file, f"{pair_uuid}_a")
        master_image_path = IngestionLayer.save_upload(image_file, f"{pair_uuid}_i")
        master_wm_path = None
        if wm_file:
            master_wm_path = IngestionLayer.save_upload(wm_file, f"{pair_uuid}_w")

        # 2. Deep Validation & Auto-Repair (Normalization)
        repaired_audio, audio_meta = ValidationLayer.validate_and_repair(master_audio_tmp, is_audio=True)
        if not repaired_audio:
            # Cleanup and fail
            return jsonify({"error": audio_meta, "file": audio_file.filename}), 400

        # 3. Create Jobs for each platform/duration combination
        platforms_raw = request.form.get(f'platforms_{i}', 'youtube')
        platforms = [p.strip() for p in platforms_raw.split(',') if p.strip()]
        
        durations_raw = request.form.get(f'durations_{i}', 'full')
        durations = [d.strip() for d in durations_raw.split(',') if d.strip()]

        for platform in platforms:
            for duration_mode in durations:
                if g.audra_tier == config.TIER_FREE and not manager.can_render_free_tier():
                    tier_blocked.append({
                        "file": audio_file.filename, "platform": platform, "duration_mode": duration_mode
                    })
                    continue

                job_id = str(uuid.uuid4())

                # Create a job-specific settings copy to override duration_mode
                job_settings = settings.copy()
                job_settings['duration_mode'] = duration_mode
                job_settings['tier'] = g.audra_tier

                job_data = {
                    'id': job_id,
                    'name': audio_file.filename,
                    'platform': platform,
                    'duration_mode': duration_mode,
                    'status': 'queued',
                    'progress': 0,
                    'duration': audio_meta['duration'],
                    'pair_id': pair_uuid,
                    'engine_version': config.ENGINE_VERSION,
                    'tier': g.audra_tier
                }

                manager.add_job(job_data)
                if g.audra_tier == config.TIER_FREE:
                    manager.record_free_tier_render()

                # Start rendering thread
                t = threading.Thread(
                    target=RenderingEngine.render_job,
                    args=(job_id, repaired_audio, master_image_path, platform,
                          os.path.join(config.OUTPUT_DIR, f"{job_id}.mp4"),
                          job_settings, master_wm_path),
                    daemon=True
                )
                t.start()
                created_jobs.append(job_id)

        i += 1

    response = {"jobs": created_jobs}
    if tier_blocked:
        response["tier_limit_reached"] = tier_blocked
        response["message"] = "Free tier render cap reached. Upgrade to Pro for unlimited renders."
    return jsonify(response)

@app.route('/license/status', methods=['GET'])
def license_status():
    return jsonify(licensing.status())

@app.route('/license/activate', methods=['POST'])
def license_activate():
    payload = request.get_json(silent=True) or {}
    ok, message = licensing.activate(payload.get('license_key', ''))
    status_code = 200 if ok else 400
    body = licensing.status()
    body['message'] = message
    return jsonify(body), status_code

@app.route('/license/deactivate', methods=['POST'])
def license_deactivate():
    ok, message = licensing.deactivate()
    body = licensing.status()
    body['message'] = message
    return jsonify(body), (200 if ok else 400)

@app.route('/jobs', methods=['GET'])
def get_jobs():
    return jsonify(manager.get_all_jobs())

@app.route('/metrics', methods=['GET'])
def get_metrics():
    metrics = MonitoringService.get_system_metrics()
    metrics['queue_length'] = len([j for j in manager.get_all_jobs() if j['status'] == 'queued'])
    return jsonify(metrics)

@app.route('/logs', methods=['GET'])
def get_logs():
    return jsonify(MonitoringService.get_recent_logs(30))

@app.route('/download/<path:filename>', methods=['GET'])
def download(filename):
    """Bypasses direct access, uses Hardened Delivery Layer."""
    return DeliveryLayer.prepare_download(filename)

@app.route('/clear_jobs', methods=['POST'])
def clear_jobs():
    manager.clear_all()
    return jsonify({'status': 'cleared'})

# ─── Main Execution ─────────────────────────────────────────────────────────

if __name__ == '__main__':
    MonitoringService.log_event(f"🚀 Audra Engine {config.ENGINE_VERSION} launched.")
    app.run(host='0.0.0.0', port=5050, debug=False)
