# -*- mode: python ; coding: utf-8 -*-
"""One-file Python/FFmpeg engine embedded as a Tauri sidecar."""

import os
import sys

SPEC_DIR = os.path.dirname(os.path.abspath(SPEC))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SPEC_DIR))

binaries = []
binary_names = ('ffmpeg.exe', 'ffprobe.exe') if sys.platform.startswith('win') else ('ffmpeg', 'ffprobe')
for binary_name in binary_names:
    binary_path = os.path.join(PROJECT_ROOT, 'bin', binary_name)
    if os.path.isfile(binary_path):
        binaries.append((binary_path, 'bin'))

a = Analysis(
    [os.path.join(PROJECT_ROOT, 'tauri_sidecar.py')],
    pathex=[PROJECT_ROOT],
    binaries=binaries,
    datas=[
        (os.path.join(PROJECT_ROOT, 'index.html'), '.'),
        (os.path.join(PROJECT_ROOT, 'workspace.html'), '.'),
        (os.path.join(PROJECT_ROOT, 'static'), 'static'),
    ],
    hiddenimports=['flask', 'flask_cors', 'psutil', 'waitress', 'jinja2', 'werkzeug'],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='audra-engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
