# Audra Technology — Automated Beat-to-Video Engine
### Project Brief v1.1 · April 2026

---

## 1. Mission

Audra is a **high-performance video automation engine** designed for music producers and creators. It transforms raw audio beats and static artwork into platform-optimized video content (YouTube, Instagram, TikTok) with zero manual editing.

> **Core Principle**: Speed, stability, and scale. Drop the beats, select the platforms, and let the engine handle the rest.

---

## 2. System Architecture

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla JS, CSS3 (Modern "Dark Mode" UI, Glassmorphism) |
| **Backend** | Python 3 (Flask) |
| **Core Engine** | FFmpeg (Hardened Filter Graphs) |
| **Concurrency** | Threaded Worker Model with Semaphore Control |
| **Monitoring** | PSUtil (Real-time CPU/RAM/Disk metrics) |
| **Storage** | Local File System (`input/`, `output/`) |

---

## 3. Core Components

### 📥 Ingestion Layer (`audra/core/ingestion.py`)
Handles secure file uploads, sanitizes filenames, and organizes assets into a UUID-based workspace to prevent collision.

### 🛡️ Validation Layer (`audra/core/validation.py`)
Performs "Deep Validation" on audio and images. It doesn't just check extensions; it probes headers and **auto-repairs** corrupted or non-standard audio streams to ensure FFmpeg stability.

### 🚥 Queue Manager (`audra/core/queue_manager.py`)
Manages the lifecycle of rendering jobs. Uses a `Semaphore` to limit concurrent renders (default: 2) to prevent system-wide CPU exhaustion.

### ⚡ Rendering Engine (`audra/core/engine.py`)
The heart of Audra. It constructs complex FFmpeg filter graphs to:
- Handle Landscape (16:9) vs. Portrait (9:16) orientations.
- Loop GIFs or pad images to fit specific aspect ratios.
- Apply dynamic effects, watermarks, and text overlays.
- Use `libx264` with `ultrafast` presets for rapid delivery.

---

## 4. The Rendering Lifecycle

Audra follows a strict sequence to ensure output integrity:

```
INGESTED
  ↓  Files saved to /input with unique IDs
VALIDATED
  ↓  Format probe + Auto-repair (Normalization)
QUEUED
  ↓  Job added to Queue Manager
RENDERING
  ↓  Active FFmpeg process (Progress tracked via stderr)
COMPLETED
  ↓  Output moved to /output, available for delivery
DELIVERED
  ↓  Hardened download link generated
```

---

## 5. System Health & Monitoring

Audra includes a **Hardened Monitoring Dashboard** visible in the frontend:

| Metric | Threshold/Source |
|---|---|
| **CPU Usage** | Targeted at <80% to maintain system responsiveness |
| **Memory** | Limits set at 2GB per worker; kills leaking processes |
| **Disk Free** | Prevents rendering if output partition is full |
| **Engine Logs** | Real-time stream of backend events and FFmpeg errors |

---

## 6. Supported Formats

| Platform | Resolution | Behavior |
|---|---|---|
| **YouTube** | 1920 × 1080 | Full audio duration, landscape |
| **Portrait (Social)** | 1080 × 1920 | 30-second teaser cut, vertical |
| **Instagram Square** | 1080 × 1080 | Center-cropped or padded |

---

## 7. Security & Hardening

- **Filename Sanitization**: Prevents directory traversal attacks.
- **Process Isolation**: Every render runs in a tracked subprocess; can be killed via the dashboard.
- **Delivery Layer**: Bypasses direct static file serving to validate job ownership before download.
- **Auto-Repair**: Neutralizes malicious or malformed audio headers before processing.

---

## 8. Development & Deployment

- **Version**: `v1.1.0-hardened`
- **Environment**: Python Virtual Env (`.venv`)
- **Main Entry**: `python main.py` or `python server.py`
- **Local Port**: `5050`

---

*Audra Technology — Technology for Creators.*
