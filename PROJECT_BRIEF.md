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

### Phase 1: Local Automation (Current)
- [x] V2 Preset Engine (Stable)
- [x] Multi-variant Batching
- [x] System Health Dashboard

### Phase 2: SaaS Hardening (Upcoming)
- [ ] User Authentication & Artist Profiles.
- [ ] Stripe Payment Integration (Pay-per-render).
- [ ] Cloud Storage Integration (AWS S3 / Google Cloud Storage).

### Phase 3: Advanced Features
- [ ] Audio-Reactive Visuals (FFT-driven filters).
- [ ] Custom Text Overlays (Lyrics/Titles).
- [ ] Video Background Support.

---

## 📝 Usage Note
Audra is currently optimized for **Mac (Apple Silicon)** and **Linux** environments. It requires FFmpeg to be installed and accessible in the system PATH.
