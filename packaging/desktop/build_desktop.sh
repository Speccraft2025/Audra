#!/bin/bash
# ── build_desktop.sh — Audra Standalone App Build Automator ──
# Installs pywebview and pyinstaller, verifies static binaries,
# and executes the compiler wrapper.

set -e

# Move to the project root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"
cd "$PROJECT_ROOT"

echo "🎨 Starting Audra Desktop Compilation Pipeline..."

# 1. Activate Python virtual environment
if [ -d ".venv" ]; then
    echo "⚡ Activating virtual environment..."
    source .venv/bin/activate
else
    echo "⚠️  No local virtual environment found. Running compilation globally..."
fi

# 2. Check and install packaging dependencies
echo "📦 Verifying required compiler packages..."
pip install --upgrade pip
pip install pywebview pyinstaller Pillow

# 3. Warn about FFmpeg bundling if directory is empty
if [ ! -f "bin/ffmpeg" ] && [ ! -f "bin/ffmpeg.exe" ]; then
    echo "=========================================================="
    echo "⚠️  WARNING: Precompiled static FFmpeg binaries not found!"
    echo "--------------------------------------------------------=="
    echo "Audra will compile successfully, but the resulting package"
    echo "will rely on users having FFmpeg pre-installed on their system PATH."
    echo ""
    echo "To build a truly portable package that has ZERO external requirements:"
    echo "  1. Download precompiled static FFmpeg & FFprobe executables for your OS"
    echo "  2. Create a folder named 'bin/' in the root directory: '$PROJECT_ROOT/bin'"
    echo "  3. Place the 'ffmpeg' and 'ffprobe' executables inside that 'bin/' folder"
    echo "  4. Re-run this build script."
    echo "=========================================================="
    sleep 3
fi

# 4. Trigger PyInstaller build process
echo "🚀 Invoking PyInstaller engine..."
pyinstaller --clean --noconfirm packaging/desktop/audra_desktop.spec

echo ""
echo "🎉 Audra Desktop App successfully packaged!"
echo "📂 Locate your compiled executable or application folder in:"
echo "   👉 $PROJECT_ROOT/dist/"
echo "=========================================================="
