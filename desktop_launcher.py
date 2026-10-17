#!/usr/bin/env python
"""
── desktop_launcher.py — Standalone Desktop Wrapper for Audra v2 ──
Launches the Flask rendering engine in a background thread and presents
the dashboard inside a beautiful native OS webview container (pywebview).
"""

import sys
import os
import time
import socket
import threading
import webview
from server import app

# Port configuration with dynamic fallback if 5050 is occupied
DEFAULT_PORT = 5050

def get_free_port():
    """Checks if default port is free; otherwise finds an ephemeral port."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(('127.0.0.1', DEFAULT_PORT))
        s.close()
        return DEFAULT_PORT
    except OSError:
        # Port is in use, find a free ephemeral port
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
        s.close()
        return port

def run_flask_backend(port):
    """Spawns the Flask server in gunicorn or waitress mode, falling back to werkzeug."""
    print(f"🚀 Launching Audra V2 Engine local daemon on port {port}...")
    # Run Flask server (debug=False is essential for compiled packages)
    app.run(host='127.0.0.1', port=port, debug=False)

class DesktopAPI:
    """JS-to-Python Bridge for pywebview to allow native macOS operations."""
    def __init__(self):
        self.window = None

    def download_file(self, filename):
        """Native save file dialog that copies files locally, bypassing WebKit download limits."""
        import shutil
        from audra import config
        
        filename = os.path.basename(filename)
        source_path = os.path.join(config.OUTPUT_DIR, filename)
        
        if not os.path.exists(source_path):
            return {"success": False, "error": f"Source file {filename} not found"}

        try:
            # Open native macOS Save File Dialog
            save_path = self.window.create_file_dialog(
                webview.SAVE_DIALOG,
                directory=os.path.expanduser("~/Downloads"),
                save_filename=filename
            )
            
            if not save_path:
                return {"success": False, "cancelled": True}
                
            # Handle list/tuple format of returned save paths in webview
            if isinstance(save_path, (list, tuple)):
                if len(save_path) > 0:
                    save_path = save_path[0]
                else:
                    return {"success": False, "cancelled": True}
                    
            if not save_path:
                return {"success": False, "cancelled": True}
                
            shutil.copy2(source_path, save_path)
            return {"success": True, "save_path": save_path}
        except Exception as e:
            return {"success": False, "error": str(e)}

if __name__ == '__main__':
    port = get_free_port()
    
    # 1. Start the Flask backend in a daemon thread so it shuts down when the window closes
    backend_thread = threading.Thread(
        target=run_flask_backend,
        args=(port,),
        daemon=True
    )
    backend_thread.start()
    
    # 2. Wait slightly for Flask to bind the socket and start serving
    time.sleep(1.2)
    
    # 3. Spawn native OS desktop frame pointing to local web server
    print("🎬 Opening Audra Desktop GUI frame...")
    api = DesktopAPI()
    window = webview.create_window(
        title="Audra — Audio to Video",
        url=f"http://127.0.0.1:{port}/workspace",
        width=1280,
        height=800,
        resizable=True,
        min_size=(1024, 768),
        js_api=api
    )
    api.window = window
    
    # Start webview loop (blocks main thread until application window closes)
    webview.start()
    print("👋 Audra Desktop closed. Exiting engine session.")
    sys.exit(0)
