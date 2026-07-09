# ── build_desktop.ps1 — Audra Standalone App Build Automator for Windows ──
# Installs pywebview, pyinstaller, and Pillow in the Windows virtual env,
# verifies precompiled FFmpeg binaries, and compiles the native .exe bundle.

$ErrorActionPreference = "Stop"

# Get project root directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path "$ScriptDir\..\.."
Set-Location $ProjectRoot

Write-Host "🎨 Starting Audra Windows Desktop Compilation Pipeline..." -ForegroundColor Cyan

# 1. Activate Python virtual environment
if (Test-Path ".venv") {
    Write-Host "⚡ Activating Windows virtual environment..." -ForegroundColor Yellow
    & .venv\Scripts\Activate.ps1
} else {
    Write-Host "⚠️  No local virtual environment found. Running compilation globally..." -ForegroundColor Red
}

# 2. Check and install packaging dependencies
Write-Host "📦 Verifying required compiler packages..." -ForegroundColor Cyan
python -m pip install --upgrade pip
pip install pywebview pyinstaller Pillow

# 3. Warn about FFmpeg bundling if directory is empty
if (-not (Test-Path "bin\ffmpeg.exe") -or -not (Test-Path "bin\ffprobe.exe")) {
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host "⚠️  WARNING: Precompiled static FFmpeg/FFprobe binaries not found for Windows!" -ForegroundColor Yellow
    Write-Host "--------------------------------------------------------==" -ForegroundColor Red
    Write-Host "Audra will compile successfully, but the resulting package" -ForegroundColor White
    Write-Host "will rely on users having FFmpeg pre-installed on their system PATH." -ForegroundColor White
    Write-Host "" -ForegroundColor White
    Write-Host "To build a truly portable package that has ZERO external requirements:" -ForegroundColor White
    Write-Host "  1. Download precompiled static FFmpeg & FFprobe executables for Windows (64-bit)" -ForegroundColor White
    Write-Host "  2. Create a folder named 'bin\' in the root directory: '$ProjectRoot\bin'" -ForegroundColor White
    Write-Host "  3. Place the 'ffmpeg.exe' and 'ffprobe.exe' executables inside that 'bin\' folder" -ForegroundColor White
    Write-Host "  4. Re-run this build script." -ForegroundColor White
    Write-Host "==========================================================" -ForegroundColor Red
    Start-Sleep -Seconds 3
}

# 4. Trigger PyInstaller build process
Write-Host "🚀 Invoking PyInstaller engine..." -ForegroundColor Cyan
pyinstaller --clean --noconfirm packaging/desktop/audra_desktop.spec

Write-Host ""
Write-Host "🎉 Audra Desktop App successfully packaged for Windows!" -ForegroundColor Green
Write-Host "📂 Locate your compiled executable or application folder in:" -ForegroundColor White
Write-Host "   👉 $ProjectRoot\dist\Audra\Audra.exe" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
