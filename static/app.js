/* ── app.js — Audra v2 Logic ──────────────────────────────────── */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let selectedFormats = ['youtube']; 
let selectedDurations = ['full'];
let audioFile = null;
let audioDuration = 0;
let clipStart = 0;
let visualItems = [];
let nextVisualId = 1;
let activeJobIds = [];
let pollTimer = null;
let licenseState = null;
let audioPreviewUrl = null;
let lyricsPlayer = null;
let lyricsTargetId = null;
let lyricsLines = [];
let lyricsTimestamps = [];
let lyricsSyncing = false;
let sharedTimedLyrics = [];
let currentProjectId = null;
let currentProjectName = '';

const PRESET_OPTIONS = [
    ['clean', 'Clean'],
    ['ambient_drift', 'Ambient Drift'],
    ['trap_pulse', 'Trap Pulse'],
    ['cinematic_fade', 'Cinematic Fade'],
    ['afro_glow', 'Afro Glow'],
    ['hard_cut_energy', 'Hard Cut Energy']
];

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

function isMovingVisual(file) {
    return isVideoFile(file) || file.name.toLowerCase().endsWith('.gif');
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

    if (!allowed && visualItems.some(item => isVideoFile(item.file))) {
        visualItems = visualItems.filter(item => !isVideoFile(item.file));
        const card = document.getElementById('image-upload');
        if (card) {
            card.classList.remove('filled');
            const icon = card.querySelector('.upload-icon');
            if (icon) icon.textContent = '🖼️';
        }
        renderContentEditors();
        updateArtworkSummary();
        updateRenderBtn();
    }
}

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initMultiToggle('#format-toggle', (vals) => selectedFormats = vals);
    initMultiToggle('#duration-toggle', (vals) => {
        selectedDurations = vals;
        updateClipRange();
    });
    initUploadCards();
    initClipRange();
    initLyricsModal();
    initProjectControls();
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
    renderContentEditors();

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
    const addBtn = document.getElementById('add-content-btn');
    if (!audioCard || !imageCard) return;

    setupUpload(audioCard, 'audio', (file) => {
        if (audioFile && (audioFile.name !== file.name || audioFile.size !== file.size)) {
            sharedTimedLyrics = [];
            visualItems.forEach(item => {
                item.timedLyrics = [];
                item.lyricsEnabled = false;
            });
            renderContentEditors();
        }
        audioFile = file;
        const filenameEl = document.getElementById('audio-filename');
        if (filenameEl) filenameEl.textContent = truncate(file.name, 25);
        audioCard.classList.add('filled');
        readAudioDuration(file);
        updateRenderBtn();
    });

    setupUpload(imageCard, 'image', addVisualFiles);

    if (addBtn) addBtn.addEventListener('click', () => openVisualPicker());
}

function setupUpload(el, type, callback) {
    // Use the persistent inputs declared in workspace.html. Native webviews can
    // lose dynamically-created file inputs as soon as the click handler exits,
    // which leaves the file picker unable to return the selected file.
    const inputId = type === 'audio' ? 'globalAudioInput' : 'globalImageInput';
    const input = document.getElementById(inputId);
    if (!input) return;

    input.accept = type === 'audio' ? '.mp3,.wav,.aiff,.m4a' : visualAccept();
    input.addEventListener('change', () => {
        if (!input.files || !input.files.length) return;
        callback(type === 'audio' ? input.files[0] : Array.from(input.files));
    });

    el.addEventListener('click', () => {
        input.accept = type === 'audio' ? '.mp3,.wav,.aiff,.m4a' : visualAccept();
        // Clearing the value lets users re-select the same file after changing
        // their mind or after a failed render.
        input.value = '';
        input.click();
    });

    el.addEventListener('dragover', e => { e.preventDefault(); el.style.borderColor = 'var(--text)'; });
    el.addEventListener('dragleave', () => { el.style.borderColor = ''; });
    el.addEventListener('drop', e => {
        e.preventDefault();
        el.style.borderColor = '';
        if (e.dataTransfer.files[0]) {
            callback(type === 'audio' ? e.dataTransfer.files[0] : Array.from(e.dataTransfer.files));
        }
    });
}

function openVisualPicker() {
    const input = document.getElementById('globalImageInput');
    if (!input) return;
    input.accept = visualAccept();
    input.value = '';
    input.click();
}

function addVisualFiles(files) {
    files.forEach(file => {
        const isVideo = isVideoFile(file);
        if (isVideo && !videoAllowed()) {
            showToast(`${file.name}: video backgrounds require Audra Pro.`, 'error');
            return;
        }
        visualItems.push({
            id: nextVisualId++,
            file,
            preset: isMovingVisual(file) ? 'clean' : 'ambient_drift',
            intensity: 'medium',
            caption: '',
            timedLyrics: sharedTimedLyrics.map(line => ({ ...line })),
            lyricsEnabled: false
        });
    });
    renderContentEditors();
    updateArtworkSummary();
    updateRenderBtn();
}

function updateArtworkSummary() {
    const card = document.getElementById('image-upload');
    const filenameEl = document.getElementById('image-filename');
    if (!card || !filenameEl) return;
    const count = visualItems.length;
    card.classList.toggle('filled', count > 0);
    filenameEl.textContent = count === 0
        ? 'No file selected'
        : `${count} visual${count === 1 ? '' : 's'} selected`;
}

function renderContentEditors() {
    const list = document.getElementById('content-editor-list');
    if (!list) return;
    list.innerHTML = '';

    visualItems.forEach((item, index) => {
        const editor = document.createElement('article');
        editor.className = 'content-editor-card';
        editor.innerHTML = `
            <div class="content-editor-head">
              <div><span class="content-number">${String(index + 1).padStart(2, '0')}</span>
                <strong>${escapeHtml(truncate(item.file.name, 38))}</strong></div>
              <button type="button" class="content-remove-btn" aria-label="Remove content">Remove</button>
            </div>
            <div class="content-editor-grid">
              <label>Caption / branding
                <input class="v2-input content-caption" maxlength="60" placeholder="e.g. New beat out now" value="${escapeHtml(item.caption)}"${item.lyricsEnabled ? ' disabled' : ''}>
                <button class="lyrics-open-btn" type="button">♪ Add / sync lyrics</button>
                <span class="lyrics-count">${item.timedLyrics.length ? `${item.timedLyrics.length} synced lines saved` : 'No synced lyrics'}</span>
                <span class="lyrics-enable-row"><input type="checkbox" class="lyrics-enable"${item.lyricsEnabled ? ' checked' : ''}${item.timedLyrics.length ? '' : ' disabled'}> Add synced lyrics to video</span>
              </label>
              <label>Animation / effects preset
                <select class="v2-select content-preset">${presetOptionsHtml(item.preset)}</select>
              </label>
              <label>Effect intensity
                <select class="v2-select content-intensity">
                  <option value="low"${item.intensity === 'low' ? ' selected' : ''}>Low</option>
                  <option value="medium"${item.intensity === 'medium' ? ' selected' : ''}>Medium</option>
                  <option value="high"${item.intensity === 'high' ? ' selected' : ''}>High</option>
                </select>
              </label>
            </div>`;

        editor.querySelector('.content-caption').addEventListener('input', e => item.caption = e.target.value);
        editor.querySelector('.content-preset').addEventListener('change', e => item.preset = e.target.value);
        editor.querySelector('.content-intensity').addEventListener('change', e => item.intensity = e.target.value);
        editor.querySelector('.lyrics-open-btn').addEventListener('click', () => openLyricsModal(item.id));
        editor.querySelector('.lyrics-enable').addEventListener('change', e => {
            item.lyricsEnabled = e.target.checked;
            if (item.lyricsEnabled) item.caption = '';
            renderContentEditors();
        });
        editor.querySelector('.content-remove-btn').addEventListener('click', () => {
            visualItems = visualItems.filter(candidate => candidate.id !== item.id);
            renderContentEditors();
            updateArtworkSummary();
            updateRenderBtn();
        });
        list.appendChild(editor);
    });
}

function presetOptionsHtml(selected) {
    const freePresets = new Set((licenseState && licenseState.free_presets) || []);
    const enforcedFree = licenseState && licenseState.enforced && licenseState.tier !== 'pro';
    return PRESET_OPTIONS.map(([value, label]) => {
        const proLabel = enforcedFree && !freePresets.has(value) ? ' — PRO' : '';
        return `<option value="${value}"${value === selected ? ' selected' : ''}>${label}${proLabel}</option>`;
    }).join('');
}

function initClipRange() {
    const range = document.getElementById('clip-start-range');
    if (!range) return;
    range.addEventListener('input', () => {
        clipStart = Number(range.value) || 0;
        updateClipRange();
    });
}

function readAudioDuration(file) {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    audioPreviewUrl = URL.createObjectURL(file);
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
        audioDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
        clipStart = Math.min(clipStart, Math.max(0, audioDuration - 30));
        URL.revokeObjectURL(url);
        updateClipRange();
    };
    audio.onerror = () => URL.revokeObjectURL(url);
    audio.src = url;
}

function updateClipRange() {
    const panel = document.getElementById('clip-range-panel');
    const range = document.getElementById('clip-start-range');
    const label = document.getElementById('clip-range-label');
    if (!panel || !range || !label) return;
    panel.hidden = !selectedDurations.includes('30s');
    range.max = String(Math.max(0, audioDuration - 30));
    range.value = String(Math.min(clipStart, Number(range.max)));
    range.disabled = audioDuration <= 30;
    label.textContent = `${formatTime(Number(range.value))} – ${formatTime(Math.min(audioDuration || 30, Number(range.value) + 30))}`;
}

function initLyricsModal() {
    document.querySelectorAll('[data-close-lyrics]').forEach(el => el.addEventListener('click', closeLyricsModal));
    document.getElementById('lyrics-start-btn')?.addEventListener('click', startLyricsSync);
    document.getElementById('lyrics-save-btn')?.addEventListener('click', saveLyricsSync);
    window.addEventListener('keydown', event => {
        if (!lyricsSyncing || event.code !== 'Space') return;
        event.preventDefault();
        captureLyricTimestamp();
    });
}

function openLyricsModal(itemId) {
    if (!audioFile || !audioPreviewUrl) {
        showToast('Select an audio file before syncing lyrics.', 'error');
        return;
    }
    const item = visualItems.find(candidate => candidate.id === itemId);
    if (!item) return;
    lyricsTargetId = itemId;
    lyricsSyncing = false;
    lyricsTimestamps = [];
    const textarea = document.getElementById('lyrics-textarea');
    textarea.disabled = false;
    textarea.value = item.timedLyrics.map(line => line.text).join('\n');
    document.getElementById('lyrics-sync-status').textContent = item.timedLyrics.length
        ? `${item.timedLyrics.length} synced lines loaded. Start again to replace their timing.`
        : 'Paste one lyric line per row, then start syncing.';
    document.getElementById('lyrics-save-btn').disabled = true;
    document.getElementById('lyrics-start-btn').disabled = false;
    document.getElementById('lyrics-modal').hidden = false;
    textarea.focus();
}

function closeLyricsModal() {
    lyricsSyncing = false;
    if (lyricsPlayer) {
        lyricsPlayer.pause();
        lyricsPlayer = null;
    }
    const modal = document.getElementById('lyrics-modal');
    if (modal) modal.hidden = true;
}

async function startLyricsSync() {
    const textarea = document.getElementById('lyrics-textarea');
    lyricsLines = textarea.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lyricsLines.length) {
        showToast('Paste at least one lyric line first.', 'error');
        return;
    }

    lyricsTimestamps = [];
    lyricsSyncing = true;
    textarea.disabled = true;
    document.getElementById('lyrics-save-btn').disabled = true;
    document.getElementById('lyrics-start-btn').disabled = true;
    lyricsPlayer = new Audio(audioPreviewUrl);
    lyricsPlayer.currentTime = selectedDurations.includes('30s') ? clipStart : 0;
    lyricsPlayer.addEventListener('ended', finishLyricsCapture);
    try {
        await lyricsPlayer.play();
        updateLyricsStatus();
    } catch (error) {
        lyricsSyncing = false;
        textarea.disabled = false;
        document.getElementById('lyrics-start-btn').disabled = false;
        showToast('Audio preview could not start.', 'error');
    }
}

function captureLyricTimestamp() {
    if (!lyricsPlayer || lyricsTimestamps.length >= lyricsLines.length) return;
    lyricsTimestamps.push(lyricsPlayer.currentTime);
    if (lyricsTimestamps.length >= lyricsLines.length) {
        finishLyricsCapture();
    } else {
        updateLyricsStatus();
    }
}

function updateLyricsStatus() {
    const index = lyricsTimestamps.length;
    const status = document.getElementById('lyrics-sync-status');
    status.innerHTML = `Tap <kbd>Space</kbd> for line ${index + 1} of ${lyricsLines.length}: <strong>${escapeHtml(lyricsLines[index])}</strong>`;
}

function finishLyricsCapture() {
    lyricsSyncing = false;
    if (lyricsPlayer) lyricsPlayer.pause();
    const complete = lyricsTimestamps.length === lyricsLines.length;
    document.getElementById('lyrics-sync-status').textContent = complete
        ? `${lyricsLines.length} lines synced. Save to attach them to this content piece.`
        : `Audio ended after ${lyricsTimestamps.length} of ${lyricsLines.length} lines. Start again to complete.`;
    document.getElementById('lyrics-save-btn').disabled = !complete;
    document.getElementById('lyrics-start-btn').disabled = false;
    document.getElementById('lyrics-textarea').disabled = false;
}

function saveLyricsSync() {
    const item = visualItems.find(candidate => candidate.id === lyricsTargetId);
    if (!item || lyricsTimestamps.length !== lyricsLines.length) return;
    sharedTimedLyrics = lyricsLines.map((text, index) => ({
        text,
        start: lyricsTimestamps[index],
        end: index + 1 < lyricsTimestamps.length
            ? lyricsTimestamps[index + 1]
            : Math.min(audioDuration || lyricsTimestamps[index] + 3, lyricsTimestamps[index] + 3)
    }));
    // Lyrics are synced to the shared audio track, so every content piece can
    // independently opt into the same timing via its checkbox.
    visualItems.forEach(visual => {
        visual.timedLyrics = sharedTimedLyrics.map(line => ({ ...line }));
    });
    renderContentEditors();
    closeLyricsModal();
    showToast(`${sharedTimedLyrics.length} synced lyric lines are now available to every visual.`, 'success');
}

function initProjectControls() {
    document.getElementById('save-project-btn')?.addEventListener('click', saveProject);
    document.getElementById('open-project-btn')?.addEventListener('click', openProjectModal);
    document.querySelectorAll('[data-close-project]').forEach(el => el.addEventListener('click', closeProjectModal));
}

async function saveProject() {
    if (!audioFile || visualItems.length === 0) {
        showToast('Select audio and at least one visual before saving.', 'error');
        return;
    }
    const requestedName = window.prompt('Project name', currentProjectName || audioFile.name.replace(/\.[^.]+$/, ''));
    if (requestedName === null) return;
    const name = requestedName.trim() || 'Untitled Project';
    const button = document.getElementById('save-project-btn');
    button.disabled = true;
    button.textContent = 'Saving…';

    const manifest = {
        id: currentProjectId,
        name,
        formats: selectedFormats,
        durations: selectedDurations,
        clip_start: clipStart,
        shared_timed_lyrics: sharedTimedLyrics,
        visuals: visualItems.map(item => ({
            filename: item.file.name,
            preset: item.preset,
            intensity: item.intensity,
            caption: item.lyricsEnabled ? '' : item.caption,
            timed_lyrics: item.timedLyrics,
            lyrics_enabled: item.lyricsEnabled
        }))
    };
    const formData = new FormData();
    formData.append('project', JSON.stringify(manifest));
    formData.append('audio', audioFile);
    visualItems.forEach((item, index) => formData.append(`visual_${index}`, item.file));

    try {
        const response = await fetch('/projects', { method: 'POST', body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Project could not be saved.');
        currentProjectId = data.id;
        currentProjectName = data.name;
        showToast(`Project saved: ${data.name}`, 'success');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Save Project';
    }
}

async function openProjectModal() {
    const modal = document.getElementById('project-modal');
    const list = document.getElementById('project-list');
    modal.hidden = false;
    list.textContent = 'Loading projects…';
    try {
        const response = await fetch('/projects');
        const projects = await response.json();
        if (!projects.length) {
            list.textContent = 'No saved projects yet.';
            return;
        }
        list.innerHTML = '';
        projects.forEach(project => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'project-list-item';
            button.innerHTML = `<strong>${escapeHtml(project.name)}</strong><span>${project.visual_count} visual${project.visual_count === 1 ? '' : 's'} · ${new Date(project.updated_at * 1000).toLocaleString()}</span>`;
            button.addEventListener('click', () => loadProject(project.id));
            list.appendChild(button);
        });
    } catch (error) {
        list.textContent = 'Projects could not be loaded.';
    }
}

function closeProjectModal() {
    const modal = document.getElementById('project-modal');
    if (modal) modal.hidden = true;
}

async function loadProject(projectId) {
    const list = document.getElementById('project-list');
    list.textContent = 'Opening project and restoring media…';
    try {
        const response = await fetch(`/projects/${encodeURIComponent(projectId)}`);
        const project = await response.json();
        if (!response.ok) throw new Error(project.error || 'Project could not be opened.');

        const audioFileResponse = await fetch(projectAssetUrl(projectId, project.audio_asset));
        const audioBlob = await audioFileResponse.blob();
        audioFile = new File([audioBlob], project.audio_name || project.audio_asset, { type: audioBlob.type });

        sharedTimedLyrics = project.shared_timed_lyrics ||
            (project.visuals || []).find(visual => (visual.timed_lyrics || []).length)?.timed_lyrics || [];
        const restoredVisuals = await Promise.all((project.visuals || []).map(async visual => {
            const assetResponse = await fetch(projectAssetUrl(projectId, visual.asset));
            const blob = await assetResponse.blob();
            const file = new File([blob], visual.filename || visual.asset, { type: blob.type });
            return {
                id: nextVisualId++, file,
                preset: visual.preset || (isMovingVisual(file) ? 'clean' : 'ambient_drift'),
                intensity: visual.intensity || 'medium',
                caption: visual.lyrics_enabled ? '' : (visual.caption || ''),
                timedLyrics: sharedTimedLyrics.map(line => ({ ...line })),
                lyricsEnabled: Boolean(visual.lyrics_enabled && sharedTimedLyrics.length)
            };
        }));

        visualItems = restoredVisuals;
        selectedFormats = project.formats?.length ? project.formats : ['youtube'];
        selectedDurations = project.durations?.length ? project.durations : ['full'];
        clipStart = Number(project.clip_start) || 0;
        currentProjectId = project.id;
        currentProjectName = project.name;
        applyToggleState('#format-toggle', selectedFormats);
        applyToggleState('#duration-toggle', selectedDurations);
        document.getElementById('audio-filename').textContent = truncate(audioFile.name, 25);
        document.getElementById('audio-upload').classList.add('filled');
        readAudioDuration(audioFile);
        renderContentEditors();
        updateArtworkSummary();
        updateClipRange();
        updateRenderBtn();
        closeProjectModal();
        showToast(`Project opened: ${project.name}`, 'success');
    } catch (error) {
        list.textContent = error.message;
    }
}

function projectAssetUrl(projectId, asset) {
    return `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset)}`;
}

function applyToggleState(selector, values) {
    document.querySelectorAll(`${selector} .toggle-btn`).forEach(button => {
        button.classList.toggle('active', values.includes(button.dataset.value));
    });
}

function updateRenderBtn() {
    const btn = document.getElementById('renderBtn');
    const hint = document.getElementById('renderHint');
    if (audioFile && visualItems.length > 0 && selectedFormats.length > 0 && selectedDurations.length > 0) {
        btn.disabled = false;
        const count = visualItems.length * selectedFormats.length * selectedDurations.length;
        hint.textContent = `Ready: ${count} content piece${count === 1 ? '' : 's'} will be rendered`;
    } else {
        btn.disabled = true;
        hint.textContent = 'Complete Step 01 and select at least one format/duration';
    }
}

// ── Core Logic ─────────────────────────────────────────────────────────────

async function submitRender() {
    if (!audioFile || visualItems.length === 0) return;

    const btn = document.getElementById('renderBtn');
    btn.disabled = true;
    btn.textContent = 'Initializing...';

    const formData = new FormData();
    formData.append('audio_0', audioFile);
    visualItems.forEach((item, index) => {
        formData.append(`image_${index}`, item.file);
        formData.append(`platforms_${index}`, selectedFormats.join(','));
        formData.append(`durations_${index}`, selectedDurations.join(','));
        const settings = {
            preset: item.preset,
            intensity: item.intensity,
            clip_start: clipStart,
            timed_lyrics: item.lyricsEnabled ? item.timedLyrics : []
        };
        if (!item.lyricsEnabled && item.caption.trim()) settings.watermark_text = item.caption.trim();
        formData.append(`settings_${index}`, JSON.stringify(settings));
    });

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
            const contentLabel = `Content ${(j.content_index || 0) + 1}`;
            const label = `${contentLabel} · ${j.platform.toUpperCase()} · ${j.duration_mode === '30s' ? '30s Clip' : 'Full'}`;
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

    const completedFiles = jobs.filter(j => j.status === 'completed').map(j => j.output);
    if (completedFiles.length > 1) {
        const downloadAllBtn = document.createElement('button');
        downloadAllBtn.className = 'dl-btn primary download-all-btn';
        downloadAllBtn.textContent = `Download All (${completedFiles.length})`;
        downloadAllBtn.addEventListener('click', () => downloadAll(completedFiles, downloadAllBtn));
        actionGrid.prepend(downloadAllBtn);
    }

    const resetBtn = document.createElement('button');
    resetBtn.className = 'dl-btn';
    resetBtn.textContent = 'Start New Batch';
    resetBtn.onclick = () => location.reload();
    actionGrid.appendChild(resetBtn);

    list.appendChild(actionGrid);
    document.getElementById('step-gallery').style.display = 'block';
    list.scrollIntoView({ behavior: 'smooth' });
}

async function downloadAll(filenames, btn) {
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparing ZIP…';
    try {
        const response = await fetch('/download_batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filenames })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not create batch archive.');
        btn.disabled = false;
        btn.textContent = originalText;
        downloadFile(`/download/${encodeURIComponent(data.filename)}`, data.filename, btn);
    } catch (error) {
        btn.disabled = false;
        btn.textContent = originalText;
        showToast(error.message, 'error');
    }
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

function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
}
