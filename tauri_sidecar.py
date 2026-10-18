"""Production entry point for the Python engine bundled beside Tauri."""

import os
import threading
import time

from waitress import serve

from audra import config
from audra.utils.monitoring import MonitoringService
from server import app


def exit_when_bootloader_parent_exits():
    """Ensure PyInstaller's child server cannot outlive the Tauri sidecar handle."""
    original_parent = os.getppid()
    while True:
        time.sleep(0.5)
        current_parent = os.getppid()
        if current_parent == 1 or current_parent != original_parent:
            os._exit(0)


if __name__ == '__main__':
    threading.Thread(target=exit_when_bootloader_parent_exits, daemon=True).start()
    host = os.environ.get('AUDRA_HOST', '127.0.0.1')
    port = int(os.environ.get('AUDRA_PORT', '5050'))
    MonitoringService.log_event(
        f"Audra Tauri engine {config.ENGINE_VERSION} launched on {host}:{port}."
    )
    print(f"AUDRA_READY http://{host}:{port}", flush=True)
    serve(app, host=host, port=port, threads=6)
