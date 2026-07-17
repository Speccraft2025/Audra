/* ── app.js — Audra v2 Logic ──────────────────────────────────── */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let selectedFormats = ['youtube']; 
let selectedDurations = ['full'];
let selectedPreset = 'ambient_drift';
let audioFile = null;
let visualFile = null;
let activeJobIds = [];
let pollTimer = null;
let licenseState = null;

const BRANDING_TAG_STORAGE_KEY = 'audra_branding_tag';

// Fallbacks used until /license/status answers (and if it never does).
const DEFAULT_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const DEFAULT_VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.m4v'];

// ── Visual source helpers ──────────────────────────────────────────────────

function imageExts() { return (licenseState && licenseState.image_extensions) || DEFAULT_IMAGE_EXTS; }
function videoExts() { return (licenseState && licenseState.video_extensions) || DEFAULT_VIDEO_EXTS; }

function isVideoFile(file) {
    const name = file.name.toLowerCase();
    return videoExts().some(ext => name.endsWith(ext));
}

/** Video is a Pro entitlement. Unknown or unenforced license state means Pro. */
function videoAllowed() {
    if (!licenseState || !licenseState.enforced) return true;
    if (!licenseState.video_requires_pro) return true;
    return licenseState.tier === 'pro';
}

function visualAccept() {
    const exts = videoAllowed() ? imageExts().concat(videoExts()) : imageExts();
    return exts.join(',');
}

/** Reflect the current entitlement on the artwork card, and drop a now-blocked video pick. */
function updateVisualUploadHint() {
    const hint = document.getElementById('image-hint');
    const allowed = videoAllowed();
    if (hint) {
        hint.textContent = allowed ? 'Image or video loop' : 'Image — video loops need Pro';
        hint.classList.toggle('locked', !allowed);
    }

    if (!allowed && visualFile && isVideoFile(visualFile)) {
        visualFile = null;
        const card = document.getElementById('image-upload');
        if (card) {
            card.classList.remove('filled');
            const icon = card.querySelector('.upload-icon');
            if (icon) icon.textContent = '🖼️';
        }
        const filenameEl = document.getElementById('image-filename');
        if (filenameEl) filenameEl.textContent = 'No file selected';
        updateRenderBtn();
    }
}

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initMultiToggle('#format-toggle', (vals) => selectedFormats = vals);
    initMultiToggle('#duration-toggle', (vals) => selectedDurations = vals);
    initPresetSelector();
    initUploadCards();
    initBrandingTag();
    initLicensePanel();
    
    const renderBtn = document.getElementById('renderBtn');
    if (renderBtn) {
        renderBtn.addEventListener('click', submitRender);
    }
    
    // Hide home backlink if running in native desktop app wrapper
    const hideHomeLink = () => {
        const homeLink = document.getElementById('home-link');
        if (homeLink) homeLink.style.display = 'none';
    };
    if (window.pywebview) {
        hideHomeLink();
    } else {
        window.addEventListener('pywebviewready', hideHomeLink);
    }
    
    // System metrics pulse
    setInterval(fetchMetrics, 3000);
    fetchMetrics();
});

// ── UI Handlers ────────────────────────────────────────────────────────────

function initMultiToggle(selector, callback) {
    const btns = document.querySelectorAll(`${selector} .toggle-btn`);
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            const activeValues = Array.from(document.querySelectorAll(`${selector} .toggle-btn.active`))
                                     .map(b => b.dataset.value);
            
            // Enforce at least one selection
            if (activeValues.length === 0) {
                btn.classList.add('active');
                return;
            }
            callback(activeValues);
            updateRenderBtn();
        });
    });
}

function initPresetSelector() {
    document.querySelectorAll('.preset-card').forEach(card => {
        card.addEventListener('click', () => selectPreset(card.dataset.preset));
    });
}

function selectPreset(name) {
    const cards = document.querySelectorAll('.preset-card');
    let matched = false;
    cards.forEach(c => {
        const isMatch = c.dataset.preset === name;
        c.classList.toggle('active', isMatch);
        if (isMatch) matched = true;
    });
    if (matched) selectedPreset = name;
}

function initBrandingTag() {
    const input = document.getElementById('branding-tag-input');
    if (!input) return;

    const saved = localStorage.getItem(BRANDING_TAG_STORAGE_KEY);
    if (saved) input.value = saved;

    input.addEventListener('input', () => {
        localStorage.setItem(BRANDING_TAG_STORAGE_KEY, input.value.trim());
    });
}

// ── Licensing ──────────────────────────────────────────────────────────────

async function initLicensePanel() {
    const panel = document.getElementById('license-panel');
    if (!panel) return;

    const activateBtn = document.getElementById('license-activate-btn');
    const deactivateBtn = document.getElementById('license-deactivate-btn');
    const keyInput = document.getElementById('license-key-input');

    if (activateBtn && keyInput) {
        activateBtn.addEventListener('click', async () => {
            activateBtn.disabled = true;
            try {
                const res = await fetch('/license/activate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ license_key: keyInput.value.trim() })
                });
                const data = await res.json();
                const msgEl = document.getElementById('license-message');
                if (msgEl) msgEl.textContent = data.message || '';
                showToast(data.message || (res.ok ? 'Activated' : 'Activation failed'), res.ok ? 'success' : 'error');
                renderLicenseState(data);
            } catch (e) {
                showToast('Could not reach the engine.', 'error');
            } finally {
                activateBtn.disabled = false;
            }
        });
        keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') activateBtn.click(); });
    }

    if (deactivateBtn) {
        deactivateBtn.addEventListener('click', async () => {
            const res = await fetch('/license/deactivate', { method: 'POST' });
            const data = await res.json();
            showToast(data.message || 'Deactivated', 'info');
            renderLicenseState(data);
        });
    }

    try {
        const res = await fetch('/license/status');
        renderLicenseState(await res.json());
    } catch (e) { /* engine unreachable; panel stays hidden */ }
}

function renderLicenseState(status) {
    licenseState = status;
    updateVisualUploadHint();

    const panel = document.getElementById('license-panel');
    if (!panel || !status || !status.enforced) return;

    panel.style.display = '';
    const isPro = status.tier === 'pro';
    const freeView = document.getElementById('license-free-view');
    const proView = document.getElementById('license-pro-view');
    if (freeView) freeView.style.display = isPro ? 'none' : '';
    if (proView) proView.style.display = isPro ? '' : 'none';

    const keyHint = document.getElementById('license-key-hint');
    if (keyHint) keyHint.textContent = status.key_hint || '';

    const freeSummary = document.getElementById('license-free-summary');
    if (freeSummary) {
        const presetCount = (status.free_presets || []).length;
        freeSummary.textContent = `${presetCount} presets, ${status.free_render_cap} renders per session`;
    }

    const buyLink = document.getElementById('license-buy-link');
    if (buyLink && status.checkout_url) {
        buyLink.href = status.checkout_url;
        buyLink.style.display = '';
    }

    // Badge Pro-only presets so Free users see what a key unlocks.
    const freeSet = new Set(status.free_presets || []);
    document.querySelectorAll('.preset-card').forEach(card => {
        const existing = card.querySelector('.pro-chip');
        if (isPro || freeSet.has(card.dataset.preset)) {
            if (existing) existing.remove();
        } else if (!existing) {
            const chip = document.createElement('span');
            chip.className = 'pro-chip';
            chip.textContent = 'PRO';
            card.appendChild(chip);
        }
    });
}

function initUploadCards() {
    const audioCard = document.getElementById('audio-upload');
    const imageCard = document.getElementById('image-upload');
    if (!audioCard || !imageCard) return;

    setupUpload(audioCard, 'audio', (file) => {
        audioFile = file;
        const filenameEl = document.getElementById('audio-filename');
        if (filenameEl) filenameEl.textContent = truncate(file.name, 25);
        audioCard.classList.add('filled');
        updateRenderBtn();
    });

    setupUpload(imageCard, 'image', (file) => {
        const isVideo = isVideoFile(file);
        if (isVideo && !videoAllowed()) {
            showToast('Video backgrounds require Audra Pro. Activate a license to unlock.', 'error');
            return;
        }
        visualFile = file;
        const filenameEl = document.getElementById('image-filename');
        if (filenameEl) filenameEl.textContent = truncate(file.name, 25);
        imageCard.classList.add('filled');
        const iconEl = imageCard.querySelector('.upload-icon');
        if (iconEl) iconEl.textContent = isVideo ? '🎬' : '🖼️';
        // Motion presets fight footage that already moves — start clean and let
        // the user opt back into motion if they want it.
        if (isVideo && selectedPreset !== 'clean') {
            selectPreset('clean');
            showToast('Video loop detected — switched to the Clean preset.', 'info');
        }
        updateRenderBtn();
    });
}

function setupUpload(el, type, callback) {
    el.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = type === 'audio' ? '.mp3,.wav,.aiff,.m4a' : visualAccept();
        input.onchange = () => { if (input.files[0]) callback(input.files[0]); };
        input.click();
    });

    el.addEventListener('dragover', e => { e.preventDefault(); el.style.borderColor = 'var(--text)'; });
    el.addEventListener('dragleave', () => { el.style.borderColor = ''; });
    el.addEventListener('drop', e => {
        e.preventDefault();
        el.style.borderColor = '';
        if (e.dataTransfer.files[0]) callback(e.dataTransfer.files[0]);
    });
}

function updateRenderBtn() {
    const btn = document.getElementById('renderBtn');
    const hint = document.getElementById('renderHint');
    if (audioFile && visualFile && selectedFormats.length > 0 && selectedDurations.length > 0) {
        btn.disabled = false;
        hint.textContent = `Ready: ${selectedFormats.length * selectedDurations.length} versions will be rendered`;
    } else {
        btn.disabled = true;
        hint.textContent = 'Complete Step 01 and select at least one format/duration';
    }
}

// ── Core Logic ─────────────────────────────────────────────────────────────

async function submitRender() {
    if (!audioFile || !visualFile) return;

    const btn = document.getElementById('renderBtn');
    btn.disabled = true;
    btn.textContent = 'Initializing...';

    const formData = new FormData();
    formData.append('audio_0', audioFile);
    formData.append('image_0', visualFile);
    
    // Send comma-separated values for multi-processing
    formData.append('platforms_0', selectedFormats.join(','));
    formData.append('durations_0', selectedDurations.join(','));
    
    const settings = {
        preset: selectedPreset,
        intensity: document.getElementById('intensity-select').value
    };

    const brandingTag = document.getElementById('branding-tag-input')?.value.trim();
    if (brandingTag) settings.watermark_text = brandingTag;

    formData.append('settings_0', JSON.stringify(settings));

    try {
        const res = await fetch('/process', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.jobs && data.jobs.length) {
            activeJobIds = data.jobs;
            startPolling();
            showToast(`🚀 ${data.jobs.length} renders started...`, 'success');

            document.getElementById('render-progress-container').style.display = 'block';
            document.getElementById('renderHint').textContent = 'Rendering v2 Variants...';
            btn.textContent = 'Processing...';
        } else {
            // Rejected before any job was queued (tier gate, unreadable media).
            showToast(data.error || data.message || 'Render request was rejected.', 'error');
            btn.disabled = false;
            btn.textContent = 'Initialize v2 Render';
        }
    } catch (err) {
        showToast('❌ Server error', 'error');
        btn.disabled = false;
        btn.textContent = 'Initialize v2 Render';
    }
}

function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
        try {
            const res = await fetch('/jobs');
            const jobs = await res.json();
            const relevantJobs = jobs.filter(j => activeJobIds.includes(j.id));

            if (relevantJobs.length === 0) return;

            const totalProgress = relevantJobs.reduce((acc, j) => acc + (j.progress || 0), 0);
            const avgProgress = totalProgress / relevantJobs.length;
            document.getElementById('render-progress-fill').style.width = `${avgProgress}%`;

            const allDone = relevantJobs.every(j => j.status === 'completed' || j.status === 'failed');

            if (allDone) {
                clearInterval(pollTimer);
                finishRender(relevantJobs);
            }
        } catch (e) {}
    }, 1000);
}

function finishRender(jobs) {
    showToast('🏆 All variants ready!', 'success');
    document.getElementById('renderHint').textContent = 'Batch Generation Complete';
    
    const btn = document.getElementById('renderBtn');
    btn.textContent = 'Render Finished';
    
    const list = document.getElementById('outputList');
    list.innerHTML = `<div class="output-header">${audioFile.name} [v2 Variants]</div>`;
    
    const actionGrid = document.createElement('div');
    actionGrid.className = 'output-actions';
    
    jobs.forEach(j => {
        if (j.status === 'completed') {
            const label = `${j.platform.toUpperCase()} - ${j.duration_mode === '30s' ? '30s Clip' : 'Full'}`;
            const dl = document.createElement('a');
            dl.href = `/download/${encodeURIComponent(j.output)}`;
            dl.className = 'dl-btn primary';
            dl.innerHTML = `Download ${label}`;
            
            // Hardened WKWebView / Browser binary transfer override
            dl.addEventListener('click', (e) => {
                e.preventDefault();
                downloadFile(dl.href, j.output, dl);
            });
            
            actionGrid.appendChild(dl);
        }
    });

    const resetBtn = document.createElement('button');
    resetBtn.className = 'dl-btn';
    resetBtn.textContent = 'Start New Batch';
    resetBtn.onclick = () => location.reload();
    actionGrid.appendChild(resetBtn);

    list.appendChild(actionGrid);
    document.getElementById('step-gallery').style.display = 'block';
    list.scrollIntoView({ behavior: 'smooth' });
}

function downloadFile(url, filename, btn) {
    if (btn.classList.contains('downloading')) {
        return; // Prevent duplicate clicks
    }

    const originalHTML = btn.innerHTML;
    btn.classList.add('downloading');
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.7';

    // ── NATIVE DESKTOP wrapper (pywebview) mode ───────────────────────────
    if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.download_file === 'function') {
        btn.innerHTML = `<span class="dl-spinner"></span> Saving File...`;
        showToast('📂 Opening native macOS save dialog...', 'info');

        window.pywebview.api.download_file(filename).then((result) => {
            if (result && result.success) {
                showToast(`🏆 Video saved: ${truncate(result.save_path, 35)}`, 'success');
            } else if (result && result.cancelled) {
                showToast('ℹ️ Download cancelled', 'info');
            } else {
                showToast(`❌ Save failed: ${result ? result.error : 'Unknown error'}`, 'error');
            }
            btn.innerHTML = originalHTML;
            btn.classList.remove('downloading');
            btn.style.pointerEvents = '';
            btn.style.opacity = '';
        }).catch((err) => {
            showToast(`❌ Desktop bridge error: ${err}`, 'error');
            btn.innerHTML = originalHTML;
            btn.classList.remove('downloading');
            btn.style.pointerEvents = '';
            btn.style.opacity = '';
        });
        return;
    }

    // ── SAAS / STANDARD BROWSER mode (binary progress stream) ───────────────
    showToast(`⬇️ Starting download...`, 'info');

    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';

    xhr.onprogress = function(event) {
        if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            btn.innerHTML = `<span class="dl-spinner"></span> Downloading ${percent}%`;
        } else {
            btn.innerHTML = `<span class="dl-spinner"></span> Downloading...`;
        }
    };

    xhr.onload = function() {
        if (xhr.status === 200) {
            const blob = xhr.response;
            const blobUrl = window.URL.createObjectURL(blob);
            
            const tempLink = document.createElement('a');
            tempLink.style.display = 'none';
            tempLink.href = blobUrl;
            tempLink.download = filename;
            document.body.appendChild(tempLink);
            tempLink.click();
            
            // Let the browser/OS process the download before clean up
            setTimeout(() => {
                window.URL.revokeObjectURL(blobUrl);
                tempLink.remove();
            }, 150);

            showToast('🏆 Download completed!', 'success');
        } else {
            showToast('❌ Download failed. Server error.', 'error');
        }

        btn.innerHTML = originalHTML;
        btn.classList.remove('downloading');
        btn.style.pointerEvents = '';
        btn.style.opacity = '';
    };

    xhr.onerror = function() {
        showToast('❌ Download failed (network error)', 'error');
        btn.innerHTML = originalHTML;
        btn.classList.remove('downloading');
        btn.style.pointerEvents = '';
        btn.style.opacity = '';
    };

    xhr.send();
}

async function fetchMetrics() {
    try {
        const res = await fetch('/metrics');
        const data = await res.json();
        
        const cpuMetric = document.getElementById('cpu-metric');
        const memMetric = document.getElementById('mem-metric');
        const diskMetric = document.getElementById('disk-metric');
        const queueMetric = document.getElementById('queue-metric');
        
        if (cpuMetric) cpuMetric.textContent = `${data.cpu_percent}%`;
        if (memMetric) memMetric.textContent = `${data.memory_used_mb}MB`;
        if (diskMetric) diskMetric.textContent = `${data.disk_free_gb}GB`;
        if (queueMetric) queueMetric.textContent = `${data.queue_length} jobs`;
        
        // Bind to landing page health banner elements if they exist
        const cpuHealthVal = document.getElementById('cpu-health-val');
        if (cpuHealthVal) {
            cpuHealthVal.textContent = `${data.cpu_percent}%`;
        }
        const queueHealthVal = document.getElementById('queue-health-val');
        if (queueHealthVal) {
            queueHealthVal.textContent = `${data.queue_length} job${data.queue_length !== 1 ? 's' : ''}`;
        }
        
        const logsRes = await fetch('/logs');
        const logs = await logsRes.json();
        
        const logContent = document.getElementById('log-content');
        if (logContent) {
            logContent.innerHTML = logs.map(l => 
                `<div><span style="color: ${l.level==='ERROR'?'#ff4444':'#888'}">[${l.level}]</span> ${l.message}</div>`
            ).join('');
        }
    } catch(e) {}
}

// ── Helpers ────────────────────────────────────────────────────────────────

function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3000);
}

function truncate(str, max) {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
