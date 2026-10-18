# Audra Tauri desktop build

The Tauri shell starts the existing Flask rendering engine as a bundled Python
sidecar on a random loopback port. The UI and API remain local to the device.

## Local macOS build

```bash
source .venv/bin/activate
pip install -r requirements.txt pyinstaller
npm install
npm run tauri:build
```

Artifacts are written under `src-tauri/target/release/bundle/`.

## Shipping requirements

- Replace `bin/ffmpeg` and `bin/ffprobe` with genuinely self-contained binaries
  for each target platform. Homebrew binaries are dynamically linked and are
  suitable only for local testing.
- Build separately on macOS and Windows so PyInstaller and Tauri produce native
  sidecars and installers for each platform.
- Configure an Apple Developer signing identity and notarization credentials for
  macOS distribution. Configure a code-signing certificate for Windows.
- Add updater signing keys and endpoints before enabling Tauri's updater plugin.
