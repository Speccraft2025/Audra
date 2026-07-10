import os
import sys

ENGINE_VERSION = "v2.0.1-stable"

# --- Context & Binary Resolution ---
IS_BUNDLE = hasattr(sys, '_MEIPASS')

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = BASE_DIR

# Determine local binaries directory if packaged in Desktop bundle
if IS_BUNDLE:
    BUNDLE_DIR = sys._MEIPASS
else:
    BUNDLE_DIR = BASE_DIR

# Prioritize local bin folder for desktop bundle compilation
LOCAL_FFMPEG = os.path.join(BUNDLE_DIR, 'bin', 'ffmpeg')
LOCAL_FFPROBE = os.path.join(BUNDLE_DIR, 'bin', 'ffprobe')

# Handle Windows executable extensions
if sys.platform.startswith('win'):
    if not LOCAL_FFMPEG.endswith('.exe'): LOCAL_FFMPEG += '.exe'
    if not LOCAL_FFPROBE.endswith('.exe'): LOCAL_FFPROBE += '.exe'

FFMPEG_BINARY = os.environ.get("AUDRA_FFMPEG_PATH")
if not FFMPEG_BINARY:
    FFMPEG_BINARY = LOCAL_FFMPEG if os.path.exists(LOCAL_FFMPEG) else "ffmpeg"

FFPROBE_BINARY = os.environ.get("AUDRA_FFPROBE_PATH")
if not FFPROBE_BINARY:
    FFPROBE_BINARY = LOCAL_FFPROBE if os.path.exists(LOCAL_FFPROBE) else "ffprobe"

# Watermark/overlay font (bundled under 'static' in both dev and packaged builds)
WATERMARK_FONT = os.path.join(BUNDLE_DIR, 'static', 'assets', 'ouroboros', 'fonts', 'Ouroboros-Regular.ttf')

# --- Security & Limits ---
MAX_FILE_SIZE_MB = int(os.environ.get("AUDRA_MAX_FILE_SIZE_MB", 100))
ALLOWED_EXTENSIONS_AUDIO = {'.mp3', '.wav', '.m4a', '.opus', '.ogg'}
ALLOWED_EXTENSIONS_IMAGE = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}

# --- Paths ---
INPUT_DIR = os.path.join(ROOT_DIR, 'input')
OUTPUT_DIR = os.path.join(ROOT_DIR, 'output')

# --- Processing Config ---
CONCURRENCY_LIMIT = int(os.environ.get("AUDRA_CONCURRENCY_LIMIT", 2))
CPU_TARGET_PERCENT = float(os.environ.get("AUDRA_CPU_TARGET", 80.0))
MEMORY_LIMIT_MB = int(os.environ.get("AUDRA_MEMORY_LIMIT_MB", 2048))

# --- Logging ---
LOG_FILE = os.path.join(ROOT_DIR, 'audra.log')

# --- Monetization Tiers ---
TIER_FREE = "free"
TIER_PRO = "pro"

# Presets available without a Pro entitlement; the rest are Pro-only.
FREE_TIER_PRESETS = {"ambient_drift", "cinematic_fade"}

# Soft cap on Free tier renders. Process-lifetime counter (see queue_manager) -
# not persisted across restarts. Good enough for the Phase 2 MVP; a real
# per-user/per-day cap needs a persistent store once accounts exist.
FREE_TIER_RENDER_CAP = int(os.environ.get("AUDRA_FREE_RENDER_CAP", 10))

# Branding forced onto every Free tier render, regardless of user watermark settings.
FREE_TIER_BRAND_TEXT = "Made with Audra"

