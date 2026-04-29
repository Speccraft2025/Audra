import os

ENGINE_VERSION = "v1.1.0-hardened"

# --- Security & Limits ---
MAX_FILE_SIZE_MB = 100
ALLOWED_EXTENSIONS_AUDIO = {'.mp3', '.wav', '.m4a', '.opus', '.ogg'}
ALLOWED_EXTENSIONS_IMAGE = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}

# --- Paths ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = os.path.dirname(BASE_DIR)
INPUT_DIR = os.path.join(ROOT_DIR, 'input')
OUTPUT_DIR = os.path.join(ROOT_DIR, 'output')

# --- Processing Config ---
CONCURRENCY_LIMIT = 2
CPU_TARGET_PERCENT = 80.0
MEMORY_LIMIT_MB = 2048  # Kill worker if memory spike exceeds this

# --- Logging ---
LOG_FILE = os.path.join(ROOT_DIR, 'audra.log')
