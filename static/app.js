/* ── app.js — Audra v0 Pro Frontend Logic ──────────────────────────────────── */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let selectedPlatforms = ['landscape']; // Default
let beatPairs = [];                // [{id, audioFile, imageFile, jobIds: []}]
let activeJobs = [];               // job IDs currently polling
let pollTimer  = null;
let rowCounter = 0;
const MAX_BEATS = 10;

// Rendering Stats for ETA
let totalJobsToRender = 0;
let dashboardPulse = null;

// --- Dashboard & Monitoring ---
async function fetchMonitoring() {
  try {
    const res = await fetch('/metrics');
    if (!res.ok) return;
    const data = await res.json();
    
    document.getElementById('cpu-metric').innerText = `${data.cpu_percent}%`;
    document.getElementById('mem-metric').innerText = `${data.memory_used_mb}MB`;
    document.getElementById('disk-metric').innerText = `${data.disk_free_gb}GB`;
    
    const resLogs = await fetch('/logs');
    const logs = await resLogs.json();
    const logContainer = document.getElementById('log-content');
    logContainer.innerHTML = logs.map(l => {
        const color = l.level === 'ERROR' ? '#ff4444' : (l.level === 'WARNING' ? '#ffaa00' : '#aaa');
        return `<div><span style="color: ${color}">[${l.level}]</span> ${l.message}</div>`;
    }).join('');
    logContainer.scrollTop = logContainer.scrollHeight;
  } catch(e) {}
}
// Start health pulse
dashboardPulse = setInterval(fetchMonitoring, 3000);
fetchMonitoring();
let lastProgressUpdate = Date.now();
const SECONDS_PER_JOB = 12; // average on standard mac

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initPlatformPicker();
  addBeatRow();             // start with one empty row
  document.getElementById('addBeatBtn').addEventListener('click', addBeatRow);
  document.getElementById('renderBtn').addEventListener('click', submitRender);
});

// ── Orientation Picker ─────────────────────────────────────────────────────
function initPlatformPicker() {
  document.querySelectorAll('.platform-card-large').forEach(card => {
    card.addEventListener('click', () => {
      const p = card.dataset.platform;
      if (selectedPlatforms.includes(p)) {
        selectedPlatforms = selectedPlatforms.filter(item => item !== p);
        card.classList.remove('active');
      } else {
        selectedPlatforms.push(p);
        card.classList.add('active');
      }
      updateRenderBtn();
    });
  });
}

// ── Beat Row Management ────────────────────────────────────────────────────
function addBeatRow() {
  if (beatPairs.length >= MAX_BEATS) {
    showToast(`🚫 Limit reached: ${MAX_BEATS} beats max`, 'error');
    return;
  }

  rowCounter++;
  const id = rowCounter;
  const pair = { id, audioFile: null, imageFile: null, jobIds: [] };
  beatPairs.push(pair);

  const row = document.createElement('div');
  row.className = 'settings-row-container';
  row.id = `beat-row-${id}`;
  row.innerHTML = `
    <div class="beat-row">
      <div class="row-num">${id}</div>
      <div class="row-slots">
        <div class="row-slot audio-slot" id="audio-slot-${id}" data-id="${id}">
          <span class="slot-icon">🎵</span>
          <span class="slot-text" id="audio-text-${id}">Select Beat</span>
        </div>
        <div class="row-slot image-slot" id="image-slot-${id}" data-id="${id}">
          <span class="slot-icon">🖼️</span>
          <span class="slot-text" id="image-text-${id}">Add Cover</span>
        </div>
      </div>
      
      <!-- New Settings Toggle -->
      <button class="settings-toggle" id="settings-toggle-${id}" title="Video Settings">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>

      <div class="row-remove" onclick="removeRow(${id})" title="Remove">✕</div>
      <div class="row-progress-container">
        <div class="row-progress-fill" id="progress-${id}"></div>
      </div>
    </div>

    <!-- Expansion Panel -->
    <div class="settings-panel" id="settings-panel-${id}">
      <div class="settings-group">
        <label class="settings-label">Effects Preset</label>
        <select class="settings-field" id="effect-${id}">
          <option value="clean">Standard (No Effect)</option>
          <option value="vibrant">Vibrant Colors</option>
          <option value="zoom_slow" selected>Slow Zoom-In</option>
          <option value="fade_in_out">Fade In/Out</option>
        </select>
      </div>
      <div class="settings-group">
        <label class="settings-label">Text Watermark</label>
        <input type="text" class="settings-field" id="wm-text-${id}" placeholder="@yourhandle" maxlength="30">
      </div>
      <div class="settings-group">
        <label class="settings-label">Image Watermark</label>
        <div class="wm-image-slot" id="wm-image-slot-${id}" data-id="${id}">
          <span>Upload PNG/JPG</span>
        </div>
      </div>
    </div>
  `;

  setupSlot(row.querySelector(`#audio-slot-${id}`), pair, 'audio');
  setupSlot(row.querySelector(`#image-slot-${id}`), pair, 'image');
  
  // Settings Logic
  const toggle = row.querySelector(`#settings-toggle-${id}`);
  const panel = row.querySelector(`#settings-panel-${id}`);
  toggle.addEventListener('click', () => {
    panel.classList.toggle('active');
    toggle.classList.toggle('active');
  });

  // Watermark Image Slot
  const wmSlot = row.querySelector(`#wm-image-slot-${id}`);
  wmSlot.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png,.jpg,.jpeg';
    input.onchange = () => {
        if (input.files[0]) {
            pair.wmImageFile = input.files[0];
            wmSlot.classList.add('filled');
            wmSlot.querySelector('span').textContent = truncate(input.files[0].name, 15);
        }
    };
    input.click();
  });

  document.getElementById('pairsList').appendChild(row);
  updateRenderBtn();
}

function removeRow(id) {
  beatPairs = beatPairs.filter(p => p.id !== id);
  const el = document.getElementById(`beat-row-${id}`);
  if (el) el.remove();
  updateRenderBtn();
}

// ── Slot Interaction ───────────────────────────────────────────────────────
function setupSlot(slot, pair, type) {
  slot.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = type === 'audio' ? '.mp3,.wav,.aiff,.m4a' : '.jpg,.jpeg,.png,.gif,.webp';
    input.onchange = () => { if (input.files[0]) handleFile(input.files[0], pair, type, slot); };
    input.click();
  });
  slot.addEventListener('dragover', e => { e.preventDefault(); slot.style.borderColor = 'var(--purple)'; });
  slot.addEventListener('dragleave', () => { slot.style.borderColor = ''; });
  slot.addEventListener('drop', e => {
    e.preventDefault();
    slot.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, pair, type, slot);
  });
}

function handleFile(file, pair, type, slot) {
  const isAudio = (type === 'audio');
  if (isAudio) pair.audioFile = file;
  else pair.imageFile = file;

  slot.classList.add('filled');
  const textEl = slot.querySelector('.slot-text');
  textEl.textContent = truncate(file.name, 25);
  textEl.classList.add('has-file');
  updateRenderBtn();
}

// ── Render Submission ──────────────────────────────────────────────────────
function updateRenderBtn() {
  const btn = document.getElementById('renderBtn');
  const hint = document.getElementById('renderHint');
  const ready = beatPairs.filter(p => p.audioFile && p.imageFile);
  
  if (ready.length === 0 || selectedPlatforms.length === 0) {
    btn.disabled = true;
    hint.textContent = 'Add beats and select at least one format';
  } else {
    btn.disabled = false;
    hint.textContent = `${ready.length} beat${ready.length>1?'s':''} ready to render`;
  }
}

async function submitRender() {
  const readyPairs = beatPairs.filter(p => p.audioFile && p.imageFile);
  if (!readyPairs.length) return;

  const btn = document.getElementById('renderBtn');
  btn.disabled = true;
  btn.classList.add('loading');

  // Clear previous gallery entries before starting new render to avoid duplicates
  document.getElementById('outputList').innerHTML = '';

  const formData = new FormData();
  readyPairs.forEach((pair, i) => {
    formData.append(`audio_${i}`, pair.audioFile);
    formData.append(`image_${i}`, pair.imageFile);
    formData.append(`platforms_${i}`, selectedPlatforms.join(','));
    
    // Construct settings object
    const settings = {
        effect: document.getElementById(`effect-${pair.id}`).value,
        watermark_text: document.getElementById(`wm-text-${pair.id}`).value,
        text_overlays: [] // For now keeping it simple, can expand to more complex UI later
    };
    
    // If watermark text is "@audra" or similar, maybe add a default hook
    if (settings.watermark_text && !settings.watermark_text.startsWith('@')) {
        settings.watermark_text = '@' + settings.watermark_text;
    }

    formData.append(`settings_${i}`, JSON.stringify(settings));

    if (pair.wmImageFile) {
        formData.append(`watermark_image_${i}`, pair.wmImageFile);
    }
  });

  try {
    const res = await fetch('/process', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.jobs && data.jobs.length) {
      totalJobsToRender = data.jobs.length;
      let jobIndex = 0;
      readyPairs.forEach(pair => {
        pair.jobIds = [];
        for(let j=0; j<selectedPlatforms.length; j++) {
            if(data.jobs[jobIndex]) pair.jobIds.push(data.jobs[jobIndex]);
            jobIndex++;
        }
        const row = document.getElementById(`beat-row-${pair.id}`);
        if(row) row.classList.add('is-rendering');
      });

      activeJobs = [...data.jobs];
      startPolling();
      showToast(`🚀 Processing ${data.jobs.length} videos...`, 'success');
      
      // Update gallery visibility immediately to show new empty rows
      document.getElementById('step-gallery').style.display = 'none';
      document.getElementById('outputList').innerHTML = '';
    }
  } catch (err) {
    showToast('❌ Server error', 'error');
    btn.disabled = false;
  }
}

// ── Progress Polling & ETA ──────────────────────────────────────────────────
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollProgress, 1000);
}

async function pollProgress() {
  if (activeJobs.length === 0) {
    clearInterval(pollTimer);
    finishSession();
    return;
  }

  try {
    const res = await fetch('/jobs');
    const all = await res.json();
    const jobMap = Object.fromEntries(all.map(j => [j.id, j]));

    let finishedGlobal = 0;

    beatPairs.forEach(pair => {
        if (!pair.jobIds || pair.jobIds.length === 0) return;

        const rowJobs = pair.jobIds.map(id => jobMap[id]).filter(Boolean);
        const finishedCount = rowJobs.filter(j => j.status === 'done' || j.status === 'error').length;
        finishedGlobal += finishedCount;

        const totalProgress = rowJobs.reduce((acc, j) => acc + (j.progress || 0), 0);
        const avgProgress = totalProgress / (rowJobs.length || 1);

        const fill = document.getElementById(`progress-${pair.id}`);
        if (fill) {
            fill.style.width = `${avgProgress}%`;
            
            // NEW: Hardware-Aware Status Feedback
            const isWaiting = rowJobs.some(j => j.status === 'queued');
            const isRendering = rowJobs.some(j => j.status === 'rendering');
            const isDone = rowJobs.every(j => j.status === 'completed');
            
            let statusText = isDone ? 'Done' : (isRendering ? 'Processing...' : (isWaiting ? 'Waiting for resources...' : 'Preparing...'));
            // Could display statusText in a label
        }

        if (finishedCount === rowJobs.length) {
            const row = document.getElementById(`beat-row-${pair.id}`);
            if(row) row.classList.remove('is-rendering');
        }
    });

    updateETA(finishedGlobal);

    activeJobs = activeJobs.filter(id => {
      const j = jobMap[id];
      return j && (j.status === 'queued' || j.status === 'rendering');
    });

  } catch (e) {}
}

function updateETA(finishedCount) {
    const remaining = totalJobsToRender - finishedCount;
    const etaEl = document.getElementById('renderEta');
    if (remaining <= 0) {
        etaEl.textContent = "";
        return;
    }
    const seconds = remaining * SECONDS_PER_JOB;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    etaEl.textContent = `⏳ Est. time remaining: ~${timeStr}`;
}

function finishSession() {
    document.getElementById('renderBtn').disabled = false;
    document.getElementById('renderBtn').classList.remove('loading');
    document.getElementById('renderEta').textContent = "✅ All renders complete!";
    setTimeout(() => { document.getElementById('renderEta').textContent = ""; }, 5000);
    refreshGallery();
    showToast('🏆 All videos generated!', 'success');
}

// ── Output List Logic ────────────────────────────────────────────────────────
async function refreshGallery() {
  try {
    const res  = await fetch('/jobs');
    const jobs = await res.json();
    
    // Group jobs by pair_id
    const groups = {};
    jobs.forEach(j => {
        if (!j.pair_id || j.status !== 'done') return;
        if (!groups[j.pair_id]) groups[j.pair_id] = { name: j.name, landscape: null, portrait: null };
        if (j.platform === 'landscape') groups[j.pair_id].landscape = j.output;
        if (j.platform === 'portrait') groups[j.pair_id].portrait = j.output;
    });

    const list = document.getElementById('outputList');
    list.innerHTML = '';
    const visiblePairs = Object.values(groups).reverse();

    if (visiblePairs.length > 0) {
        document.getElementById('step-gallery').style.display = 'block';
        const label = document.querySelector('#step-gallery .step-label');
        if (label && !document.getElementById('clearGalleryBtn')) {
            const clearBtn = document.createElement('button');
            clearBtn.id = 'clearGalleryBtn';
            clearBtn.className = 'dl-btn';
            clearBtn.style.marginLeft = 'auto';
            clearBtn.style.fontSize = '0.7rem';
            clearBtn.innerHTML = '🗑️ Clear Gallery';
            clearBtn.onclick = clearAllJobs;
            label.appendChild(clearBtn);
        }
    }

    visiblePairs.forEach(group => {
      const item = document.createElement('div');
      item.className = 'output-item';
      
      const hasPortrait = !!group.portrait;
      const isPortraitSelected = selectedPlatforms.includes('portrait');

      item.innerHTML = `
        <div class="output-header">${group.name}</div>
        <div class="output-actions">
           ${group.landscape ? `<a href="/download/${encodeURIComponent(group.landscape)}" download="${group.landscape}" class="dl-btn primary">Download Landscape</a>` : ''}
           ${(isPortraitSelected && group.portrait) ? `<a href="/download/${encodeURIComponent(group.portrait)}" download="${group.portrait}" class="dl-btn primary">Download Portrait</a>` : ''}
           ${(isPortraitSelected && group.landscape && group.portrait) ? `<button class="dl-btn" onclick="downloadBoth('${group.landscape}', '${group.portrait}')">Download Both</button>` : ''}
        </div>
      `;
      list.appendChild(item);
    });
  } catch (e) {}
}

async function downloadBoth(l, p) {
    const trigger = (file) => {
        console.log(`[Audra] Requesting download: ${file}`);
        const a = document.createElement('a');
        a.href = `/download/${encodeURIComponent(file)}`;
        a.setAttribute('download', file);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };
    trigger(l);
    setTimeout(() => trigger(p), 800); 
}

async function clearAllJobs() {
    if (!confirm("Clear all renders from this session?")) return;
    try {
        await fetch('/clear_jobs', { method: 'POST' });
        document.getElementById('outputList').innerHTML = '';
        document.getElementById('step-gallery').style.display = 'none';
        const btn = document.getElementById('clearGalleryBtn');
        if (btn) btn.remove();
        showToast('🧹 Gallery cleared', 'info');
    } catch(e) {}
}

// ── UI Helpers ──────────────────────────────────────────────────────────────
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
