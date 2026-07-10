# Project Audra V2: Simplified Beat-to-Video Engine

Audra is a high-performance video automation engine designed for music producers and content creators. It transforms audio tracks and static cover art into professional, platform-ready videos (YouTube and Social) using a curated preset system.

## 🎯 Project Goal
To provide a "one-click" workflow for generating high-impact music visualization videos, removing the need for complex editing software while maintaining premium aesthetic standards.

---

## 🚀 Core Features

### 1. Visual Preset System
A library of 5 hardened FFmpeg-based visual presets with variable intensity (Low, Medium, High):
- **Ambient Drift**: Smooth cinematic motion and vintage color grading.
- **Trap Pulse**: Rhythmic scale-pulsing synced to a theoretical beat.
- **Cinematic Fade**: Moody transitions and slow-drift focus.
- **Afro Glow**: Warm saturation with "breathing" motion.
- **Hard Cut Energy**: High-frequency jitter and gritty noise for high-energy tracks.

### 2. Multi-Variant Batch Rendering
One-click generation of multiple output formats:
- **YouTube**: 16:9 Landscape (1920x1080).
- **Social/Shorts**: 9:16 Portrait (1080x1920).
- **Full Track**: Complete audio duration.
- **30s Teaser**: Automated high-energy segment extraction for social previews.

### 3. Real-Time Monitoring Dashboard
A backend-integrated dashboard for administrators and users:
- **System Health**: CPU, RAM, and Disk space tracking.
- **Live Logs**: Real-time stream of FFmpeg processes and engine events.
- **Job Queue**: Visual tracking of batch progress.

---

## 🛠 Technology Stack
- **Backend**: Python 3.12 + Flask.
- **Rendering Engine**: FFmpeg 8.0+ (using `crop`, `scale`, `zoompan`, and `complex_filter` chains).
- **Frontend**: Vanilla JavaScript (ES6+), CSS3 (Modern Glassmorphism), Semantic HTML5.
- **Process Management**: Multi-threaded queue with `Semaphore` concurrency limiting.

---

## 🏗 System Architecture

### 1. Ingestion & Validation
Sanitizes filenames and validates media integrity. Audio is normalized to WAV for processing stability, and images are formatted to YUV420P to prevent color-space crashes.

### 2. Queue Manager
Manages concurrent FFmpeg processes. It ensures the system does not exceed hardware limits (CPU Target: 80%) and provides thread-safe job tracking.

### 3. Rendering Pipeline
Constructs dynamic filter graphs based on user selection. It handles complex operations like 30s clipping, watermark overlays, and motion effects in a single pass.

---

## 📈 Roadmap & Evolution

**Product thesis:** Audra is a local-first, one-click batch publisher for beat-culture producers (type-beat / trap / afrobeats / lo-fi) — turn a beat + cover into every format needed to post today, without touching After Effects or uploading unreleased music anywhere. Primary audience: independent bedroom producers who publish high-volume, low-budget content. Secondary/later audience: small labels and producer collectives (Studio tier, Phase 3).

**Explicitly not doing right now:** building SaaS/cloud and desktop simultaneously (desktop ships first, cloud is Phase 3); competing on FFT audio-reactivity (Phase 4, after the core loop is validated); complex team/org features before there are paying individual users.

### Phase 1: Local Automation Engine (Complete)
- [x] V2 Preset Engine — 5 mood-graded presets, 3 intensities
- [x] Multi-variant batch rendering (YouTube / Shorts / 30s teaser)
- [x] System health dashboard, live logs, job queue
- [x] Bundled-ffmpeg path resolution for desktop packaging (fixes the code-234 failures seen pre-fix)

### Phase 2: Desktop Product Launch (Next — the actual ship)
Goal: a non-technical producer downloads Audra, activates a license, and publishes their first batch in under 5 minutes — entirely offline.

**2.0 Technical debt / portability** (blocks everything below) — Complete
- [x] Fix hardcoded dev-machine font path in `audra/core/filters.py` → resolve via `config.BASE_DIR`
- [x] Add `build/`, `dist/` to `.gitignore`; stop tracking generated PyInstaller output
- [x] Add `psutil`, `pywebview` to `requirements.txt` (split `pywebview` into `requirements-desktop.txt`, since it breaks the headless Docker install)
- [x] Resolve duplicate `saas_auth.py` (`audra/` vs `packaging/saas/`) — removed the dead `packaging/saas/` copy
- [x] Commit the in-progress desktop/UI work in logical, reviewable chunks

**2.1 Licensing & monetization rework**
- [x] Rework `saas_auth.py` from a blocking per-render license check → non-blocking tier resolver (`resolve_tier`/`attach_tier`) that degrades to Free instead of 401ing
- [x] Define Free / Pro tiers in `config.py` (`FREE_TIER_PRESETS`, `FREE_TIER_RENDER_CAP`, forced `FREE_TIER_BRAND_TEXT`)
- [x] Engine-level enforcement: Free tier gates preset access and always carries the Audra watermark alongside any user watermark; verified end-to-end against a running server (preset gating, cap enforcement, license-key bypass to Pro)
- [ ] Stripe or Lemon Squeezy hosted checkout → license key issuance (no in-app billing UI needed)

**2.2 Flagship differentiator: branding & overlays**
- [x] UI: producer tag field on the render form (`workspace.html`/`app.js`)
- [x] Wire existing `text_watermark` filter into the render pipeline via job `settings` (`watermark_text`)
- [x] Fix overlay collision: text tag and an uploaded watermark image both defaulted to bottom-right and stacked - text now moves to top-right when an image watermark is present
- [x] Persist a producer's default tag via localStorage so branding is one-click on every future render
- [ ] Timed `text_overlay` (lyrics/title hooks at specific timestamps) - not yet wired into the UI; deferred, closer to a Phase 4 concern than core branding

**2.3 Distribution**
- [ ] Code-sign + notarize the macOS `.app` (currently unsigned in `dist/`)
- [ ] Auto-update mechanism (Sparkle, or a simple version-check endpoint)
- [ ] Landing page with demo reel + license purchase flow
- [ ] Windows build pass (packaging scripts already stub `.ps1` — verify cross-platform ffmpeg bundling)

**2.4 Validation**
- [ ] Closed beta with 10-20 real type-beat producers (YouTube/Discord beat communities)
- [ ] Track time-to-first-render, renders/week/user, free→paid conversion
- [ ] Exit criteria: organic word-of-mouth + real paid conversions before investing in Phase 3

### Phase 3: Studio / Team Tier (Cloud — only after Phase 2 has paying users)
- [ ] Stand up the parked `packaging/saas/` Docker scaffolding for real
- [ ] Multi-seat accounts, shared brand presets, org-wide no-watermark
- [ ] Cloud render queue for agencies/labels managing multiple artist channels
- [ ] API access for programmatic batch submission

### Phase 4: Advanced Visual Differentiation
- [ ] Audio-reactive visuals (FFT-driven filters) — a "wow feature" layered on a validated core loop, not a race to parity with waveform-first tools
- [ ] Video background support
- [ ] Community/marketplace presets

---

## 📝 Usage Note
Audra is currently optimized for **Mac (Apple Silicon)** and **Linux** environments. It requires FFmpeg to be installed and accessible in the system PATH.
