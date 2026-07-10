/* ── app.js — Audra v2 Logic ──────────────────────────────────── */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let selectedFormats = ['youtube']; 
let selectedDurations = ['full'];
let selectedPreset = 'ambient_drift';
let audioFile = null;
let imageFile = null;
let activeJobIds = [];
let pollTimer = null;

const BRANDING_TAG_STORAGE_KEY = 'audra_branding_tag';

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initMultiToggle('#format-toggle', (vals) => selectedFormats = vals);
    initMultiToggle('#duration-toggle', (vals) => selectedDurations = vals);
    initPresetSelector();
    initUploadCards();
    initBrandingTag();
    
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
    const cards = document.querySelectorAll('.preset-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            cards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedPreset = card.dataset.preset;
        });
    });
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
        imageFile = file;
        const filenameEl = document.getElementById('image-filename');
        if (filenameEl) filenameEl.textContent = truncate(file.name, 25);
        imageCard.classList.add('filled');
        updateRenderBtn();
    });
}

function setupUpload(el, type, callback) {
    el.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = type === 'audio' ? '.mp3,.wav,.aiff,.m4a' : '.jpg,.jpeg,.png,.gif,.webp';
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
    if (audioFile && imageFile && selectedFormats.length > 0 && selectedDurations.length > 0) {
        btn.disabled = false;
        hint.textContent = `Ready: ${selectedFormats.length * selectedDurations.length} versions will be rendered`;
    } else {
        btn.disabled = true;
        hint.textContent = 'Complete Step 01 and select at least one format/duration';
    }
}

// ── Core Logic ─────────────────────────────────────────────────────────────

async function submitRender() {
    if (!audioFile || !imageFile) return;

    const btn = document.getElementById('renderBtn');
    btn.disabled = true;
    btn.textContent = 'Initializing...';

    const formData = new FormData();
    formData.append('audio_0', audioFile);
    formData.append('image_0', imageFile);
    
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
