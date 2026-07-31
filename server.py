import os
import uuid
import threading
import json
import zipfile
import re
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

PROJECTS_DIR = os.path.join(config.DATA_DIR, 'projects')
os.makedirs(PROJECTS_DIR, exist_ok=True)
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
    repaired_audio = None
    audio_meta = None
    shared_audio_file = request.files.get('audio_0')
    i = 0
    
    while f'image_{i}' in request.files:
        audio_file = request.files.get(f'audio_{i}') or shared_audio_file
        if audio_file is None:
            return jsonify({"error": "An audio file is required."}), 400
        image_file = request.files[f'image_{i}']
        wm_file = request.files.get(f'watermark_image_{i}')
        
        settings_raw = request.form.get(f'settings_{i}', '{}')
        try: settings = json.loads(settings_raw)
        except: settings = {}
        # Captions and synced lyrics can visually compete. Enforce their mutual
        # exclusion server-side as well as in JavaScript.
        if settings.get('timed_lyrics'):
            settings.pop('watermark_text', None)
        
        platforms_raw = request.form.get(f'platforms_{i}', 'youtube')
        platforms = [p.strip() for p in platforms_raw.split(',') if p.strip()]

        pair_uuid = str(uuid.uuid4())

        # The background may be a still or a video clip. Gate video on Pro
        # before spending disk on the upload.
        visual_kind = IngestionLayer.classify_visual(image_file.filename)
        if (IngestionLayer.is_allowed_video(image_file.filename) and config.VIDEO_SOURCE_REQUIRES_PRO
                and g.audra_tier != config.TIER_PRO):
            return jsonify({
                "error": "Video backgrounds require Audra Pro. Upload a still image, or activate a license.",
                "file": image_file.filename,
                "requires_pro": True
            }), 403

        # 1. Ingestion & Validation
        master_visual_path = IngestionLayer.save_upload(image_file, f"{pair_uuid}_i")
        master_wm_path = None
        if wm_file:
            master_wm_path = IngestionLayer.save_upload(wm_file, f"{pair_uuid}_w")

        # 2. Deep Validation & Auto-Repair (Normalization)
        if repaired_audio is None:
            master_audio_tmp = IngestionLayer.save_upload(audio_file, f"{pair_uuid}_a")
            repaired_audio, audio_meta = ValidationLayer.validate_and_repair(master_audio_tmp, is_audio=True)
            if not repaired_audio:
                return jsonify({"error": audio_meta, "file": audio_file.filename}), 400

        visual_ok, visual_meta = ValidationLayer.validate_visual(master_visual_path, kind=visual_kind)
        if not visual_ok:
            return jsonify({"error": visual_meta, "file": image_file.filename}), 400

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
                    'tier': g.audra_tier,
                    'visual_kind': visual_kind
                }

                job_data['content_index'] = i
                job_data['caption'] = job_settings.get('watermark_text', '')

                manager.add_job(job_data)
                if g.audra_tier == config.TIER_FREE:
                    manager.record_free_tier_render()

                # Start rendering thread
                t = threading.Thread(
                    target=RenderingEngine.render_job,
                    args=(job_id, repaired_audio, master_visual_path, platform,
                          os.path.join(config.OUTPUT_DIR, f"{job_id}.mp4"),
                          job_settings, master_wm_path),
                    kwargs={'visual_kind': visual_kind},
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

@app.route('/download_batch', methods=['POST'])
def download_batch():
    """Package completed outputs into one local ZIP for a single download."""
    payload = request.get_json(silent=True) or {}
    requested = payload.get('filenames') or []
    files = []
    for name in requested:
        safe_name = os.path.basename(str(name))
        path = os.path.join(config.OUTPUT_DIR, safe_name)
        if safe_name.lower().endswith('.mp4') and os.path.isfile(path):
            files.append((safe_name, path))

    if not files:
        return jsonify({"error": "No completed render files were found."}), 400

    archive_name = f"audra-batch-{uuid.uuid4().hex[:8]}.zip"
    archive_path = os.path.join(config.OUTPUT_DIR, archive_name)
    with zipfile.ZipFile(archive_path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for safe_name, path in files:
            archive.write(path, arcname=safe_name)
    return jsonify({"filename": archive_name, "count": len(files)})

@app.route('/projects', methods=['GET'])
def list_projects():
    projects = []
    for project_id in os.listdir(PROJECTS_DIR):
        manifest_path = os.path.join(PROJECTS_DIR, project_id, 'project.json')
        if not os.path.isfile(manifest_path):
            continue
        try:
            with open(manifest_path, 'r', encoding='utf-8') as handle:
                manifest = json.load(handle)
            projects.append({
                'id': project_id,
                'name': manifest.get('name', 'Untitled Project'),
                'updated_at': os.path.getmtime(manifest_path),
                'visual_count': len(manifest.get('visuals', []))
            })
        except (OSError, ValueError):
            continue
    projects.sort(key=lambda item: item['updated_at'], reverse=True)
    return jsonify(projects)

@app.route('/projects', methods=['POST'])
def save_project():
    try:
        manifest = json.loads(request.form.get('project', '{}'))
    except ValueError:
        return jsonify({'error': 'Invalid project data.'}), 400

    project_id = str(manifest.get('id', ''))
    if not re.fullmatch(r'[a-f0-9-]{8,36}', project_id):
        project_id = str(uuid.uuid4())
    project_dir = os.path.join(PROJECTS_DIR, project_id)
    os.makedirs(project_dir, exist_ok=True)

    audio = request.files.get('audio')
    if audio:
        audio_ext = os.path.splitext(audio.filename)[1].lower()
        audio_name = f'audio{audio_ext}'
        audio.save(os.path.join(project_dir, audio_name))
        manifest['audio_asset'] = audio_name
        manifest['audio_name'] = audio.filename
    elif not manifest.get('audio_asset'):
        return jsonify({'error': 'An audio file is required to save a project.'}), 400

    visuals = manifest.get('visuals') or []
    for index, visual in enumerate(visuals):
        upload = request.files.get(f'visual_{index}')
        if upload:
            visual_ext = os.path.splitext(upload.filename)[1].lower()
            asset_name = f'visual-{index}{visual_ext}'
            upload.save(os.path.join(project_dir, asset_name))
            visual['asset'] = asset_name
            visual['filename'] = upload.filename

    manifest['id'] = project_id
    manifest['name'] = str(manifest.get('name') or 'Untitled Project')[:80]
    manifest_path = os.path.join(project_dir, 'project.json')
    with open(manifest_path, 'w', encoding='utf-8') as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
    return jsonify({'id': project_id, 'name': manifest['name']})

@app.route('/projects/<project_id>', methods=['GET'])
def get_project(project_id):
    if not re.fullmatch(r'[a-f0-9-]{8,36}', project_id):
        return jsonify({'error': 'Invalid project.'}), 404
    manifest_path = os.path.join(PROJECTS_DIR, project_id, 'project.json')
    if not os.path.isfile(manifest_path):
        return jsonify({'error': 'Project not found.'}), 404
    with open(manifest_path, 'r', encoding='utf-8') as handle:
        return jsonify(json.load(handle))

@app.route('/projects/<project_id>/assets/<path:filename>', methods=['GET'])
def get_project_asset(project_id, filename):
    if not re.fullmatch(r'[a-f0-9-]{8,36}', project_id):
        return jsonify({'error': 'Invalid project.'}), 404
    safe_name = os.path.basename(filename)
    path = os.path.join(PROJECTS_DIR, project_id, safe_name)
    if not os.path.isfile(path):
        return jsonify({'error': 'Project asset not found.'}), 404
    return send_file(path)

@app.route('/clear_jobs', methods=['POST'])
def clear_jobs():
    manager.clear_all()
    return jsonify({'status': 'cleared'})

# ─── Main Execution ─────────────────────────────────────────────────────────

if __name__ == '__main__':
    MonitoringService.log_event(f"🚀 Audra Engine {config.ENGINE_VERSION} launched.")
    host = os.environ.get('AUDRA_HOST', '127.0.0.1')
    port = int(os.environ.get('AUDRA_PORT', '5050'))
    app.run(host=host, port=port, debug=False)
