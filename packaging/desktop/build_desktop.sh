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

# 3. Refuse to ship a build with no bundled FFmpeg - it will NOT work for
#    real users. A double-clicked .app gets a minimal system PATH that does
#    NOT include Homebrew (/opt/homebrew/bin), even if ffmpeg is on YOUR
#    PATH right now in this terminal. Falling back to a bare "ffmpeg" lookup
#    only appears to work when launched from a dev shell.
if [ ! -f "bin/ffmpeg" ] && [ ! -f "bin/ffmpeg.exe" ]; then
    echo "=========================================================="
    echo "❌ BLOCKED: No bundled FFmpeg found in bin/"
    echo "--------------------------------------------------------=="
    echo "This build would look functional when launched from a terminal"
    echo "(which inherits your shell's PATH) but FAIL for every real user"
    echo "who double-clicks the app, because GUI-launched apps on macOS"
    echo "get a minimal PATH that does not include Homebrew."
    echo ""
    echo "To fix:"
    echo "  1. Get STATIC (self-contained, no external .dylib deps) FFmpeg"
    echo "     & FFprobe binaries for your OS - a plain 'cp \$(which ffmpeg)'"
    echo "     is NOT sufficient, since Homebrew builds are dynamically"
    echo "     linked against libraries only present on your own machine."
    echo "  2. Place them at '$PROJECT_ROOT/bin/ffmpeg' and 'bin/ffprobe'."
    echo "  3. Re-run this build script."
    echo ""
    echo "Set AUDRA_ALLOW_UNBUNDLED_FFMPEG=1 to override and build anyway"
    echo "(local testing only - do not ship this to real users)."
    echo "=========================================================="
    if [ -z "$AUDRA_ALLOW_UNBUNDLED_FFMPEG" ]; then
        exit 1
    fi
fi

# 4. Trigger PyInstaller build process
echo "🚀 Invoking PyInstaller engine..."
pyinstaller --clean --noconfirm packaging/desktop/audra_desktop.spec

echo ""
echo "🎉 Audra Desktop App successfully packaged!"
echo "📂 Locate your compiled executable or application folder in:"
echo "   👉 $PROJECT_ROOT/dist/"
echo "=========================================================="
