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

# 3. Refuse to ship a build with no bundled FFmpeg - real end users almost
#    never have FFmpeg installed at all, so an unbundled build is
#    nonfunctional out of the box, not just "less portable."
if (-not (Test-Path "bin\ffmpeg.exe") -or -not (Test-Path "bin\ffprobe.exe")) {
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host "❌ BLOCKED: No bundled FFmpeg/FFprobe found in bin\" -ForegroundColor Yellow
    Write-Host "--------------------------------------------------------==" -ForegroundColor Red
    Write-Host "This build will compile without error but will NOT work for" -ForegroundColor White
    Write-Host "real users - they will not have FFmpeg installed, and the app" -ForegroundColor White
    Write-Host "has no fallback beyond an unqualified 'ffmpeg' PATH lookup." -ForegroundColor White
    Write-Host "" -ForegroundColor White
    Write-Host "To fix:" -ForegroundColor White
    Write-Host "  1. Get STATIC (self-contained) FFmpeg & FFprobe .exe builds for" -ForegroundColor White
    Write-Host "     Windows (64-bit) - not a copy of a locally installed FFmpeg," -ForegroundColor White
    Write-Host "     which may depend on DLLs only present on your machine." -ForegroundColor White
    Write-Host "  2. Place them at '$ProjectRoot\bin\ffmpeg.exe' and 'bin\ffprobe.exe'." -ForegroundColor White
    Write-Host "  3. Re-run this build script." -ForegroundColor White
    Write-Host "" -ForegroundColor White
    Write-Host "Set `$env:AUDRA_ALLOW_UNBUNDLED_FFMPEG=1 to override and build anyway" -ForegroundColor White
    Write-Host "(local testing only - do not ship this to real users)." -ForegroundColor White
    Write-Host "==========================================================" -ForegroundColor Red
    if (-not $env:AUDRA_ALLOW_UNBUNDLED_FFMPEG) {
        exit 1
    }
}

# 4. Trigger PyInstaller build process
Write-Host "🚀 Invoking PyInstaller engine..." -ForegroundColor Cyan
pyinstaller --clean --noconfirm packaging/desktop/audra_desktop.spec

Write-Host ""
Write-Host "🎉 Audra Desktop App successfully packaged for Windows!" -ForegroundColor Green
Write-Host "📂 Locate your compiled executable or application folder in:" -ForegroundColor White
Write-Host "   👉 $ProjectRoot\dist\Audra\Audra.exe" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
