# -*- mode: python ; coding: utf-8 -*-
"""
── audra_desktop.spec — PyInstaller Compilation Script for Audra v2 ──
Instructs PyInstaller how to bundle python modules, the Flask server core,
native OS webview bindings, web layouts/assets, and bundled FFmpeg/FFprobe.
"""

import sys
import os

block_cipher = None

# Determine base execution directory relative to the spec location
SPEC_DIR = os.path.dirname(os.path.abspath(SPEC))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SPEC_DIR))

# Platform-specific configurations
binary_extensions = []
if sys.platform.startswith('win'):
    # Include compiled Windows static binaries if present
    ffmpeg_source = os.path.join(PROJECT_ROOT, 'bin', 'ffmpeg.exe')
    ffprobe_source = os.path.join(PROJECT_ROOT, 'bin', 'ffprobe.exe')
    
    if os.path.exists(ffmpeg_source):
        binary_extensions.append((ffmpeg_source, 'bin'))
    if os.path.exists(ffprobe_source):
        binary_extensions.append((ffprobe_source, 'bin'))
else:
    # macOS / Linux precompiled binaries
    ffmpeg_source = os.path.join(PROJECT_ROOT, 'bin', 'ffmpeg')
    ffprobe_source = os.path.join(PROJECT_ROOT, 'bin', 'ffprobe')
    
    if os.path.exists(ffmpeg_source):
        binary_extensions.append((ffmpeg_source, 'bin'))
    if os.path.exists(ffprobe_source):
        binary_extensions.append((ffprobe_source, 'bin'))

a = Analysis(
    [os.path.join(PROJECT_ROOT, 'desktop_launcher.py')],
    pathex=[PROJECT_ROOT],
    binaries=binary_extensions,
    datas=[
        (os.path.join(PROJECT_ROOT, 'index.html'), '.'),
        (os.path.join(PROJECT_ROOT, 'workspace.html'), '.'),
        (os.path.join(PROJECT_ROOT, 'static'), 'static'),
    ],
    hiddenimports=[
        'flask',
        'flask_cors',
        'psutil',
        'webview',
        'jinja2',
        'werkzeug',
        'click',
        'itsdangerous'
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Audra',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # Set to False to hide black command shell window on launch
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='Audra',
)

# macOS specific App bundle generation
if sys.platform == 'darwin':
    app = BUNDLE(
        coll,
        name='Audra.app',
        icon=os.path.join(PROJECT_ROOT, 'static', 'assets', 'logo.png'), # Fallback to icon image
        bundle_identifier='com.audra.desktop',
        info_plist={
            'NSPrincipalClass': 'NSApplication',
            'NSAppleScriptEnabled': False,
            'CFBundleDocumentTypes': [],
            'NSCameraUsageDescription': 'Audra requires access to the camera.',
            'NSMicrophoneUsageDescription': 'Audra requires access to the microphone.'
        }
    )
