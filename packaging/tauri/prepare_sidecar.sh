#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

PYTHON="$PROJECT_ROOT/.venv/bin/python"
PYINSTALLER="$PROJECT_ROOT/.venv/bin/pyinstaller"
if [ ! -x "$PYTHON" ] || [ ! -x "$PYINSTALLER" ]; then
  echo "Audra Tauri build requires .venv with PyInstaller installed."
  exit 1
fi

if [ ! -f "bin/ffmpeg" ] && [ ! -f "bin/ffmpeg.exe" ]; then
  echo "No bundled FFmpeg binary was found in bin/."
  exit 1
fi

TARGET_TRIPLE="$(rustc -vV | awk '/^host:/ { print $2 }')"
if [ -z "$TARGET_TRIPLE" ]; then
  echo "Could not determine the Rust target triple."
  exit 1
fi

"$PYINSTALLER" --clean --noconfirm \
  --distpath "$PROJECT_ROOT/build/tauri-sidecar/dist" \
  --workpath "$PROJECT_ROOT/build/tauri-sidecar/work" \
  "$PROJECT_ROOT/packaging/tauri/audra_sidecar.spec"

mkdir -p "$PROJECT_ROOT/src-tauri/binaries"
SOURCE="$PROJECT_ROOT/build/tauri-sidecar/dist/audra-engine"
DESTINATION="$PROJECT_ROOT/src-tauri/binaries/audra-engine-$TARGET_TRIPLE"
if [[ "$TARGET_TRIPLE" == *windows* ]]; then
  SOURCE="$SOURCE.exe"
  DESTINATION="$DESTINATION.exe"
fi
cp "$SOURCE" "$DESTINATION"
chmod +x "$DESTINATION" 2>/dev/null || true
echo "Prepared Tauri sidecar: $DESTINATION"
