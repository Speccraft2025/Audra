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

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initMultiToggle('#format-toggle', (vals) => selectedFormats = vals);
    initMultiToggle('#duration-toggle', (vals) => selectedDurations = vals);
    initPresetSelector();
    initUploadCards();
    
    document.getElementById('renderBtn').addEventListener('click', submitRender);
    
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

function initUploadCards() {
    const audioCard = document.getElementById('audio-upload');
    const imageCard = document.getElementById('image-upload');

    setupUpload(audioCard, 'audio', (file) => {
        audioFile = file;
        document.getElementById('audio-filename').textContent = truncate(file.name, 25);
        audioCard.classList.add('filled');
        updateRenderBtn();
    });

    setupUpload(imageCard, 'image', (file) => {
        imageFile = file;
        document.getElementById('image-filename').textContent = truncate(file.name, 25);
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

async function fetchMetrics() {
    try {
        const res = await fetch('/metrics');
        const data = await res.json();
        document.getElementById('cpu-metric').textContent = `${data.cpu_percent}%`;
        document.getElementById('mem-metric').textContent = `${data.memory_used_mb}MB`;
        document.getElementById('disk-metric').textContent = `${data.disk_free_gb}GB`;
        document.getElementById('queue-metric').textContent = `${data.queue_length} jobs`;
        
        const logsRes = await fetch('/logs');
        const logs = await logsRes.json();
        document.getElementById('log-content').innerHTML = logs.map(l => 
            `<div><span style="color: ${l.level==='ERROR'?'#ff4444':'#888'}">[${l.level}]</span> ${l.message}</div>`
        ).join('');
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
