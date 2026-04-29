import os
import json
import time
import psutil
import logging
from datetime import datetime
from audra import config

# Setup JSON logging
class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "version": config.ENGINE_VERSION
        }
        if hasattr(record, "job_id"):
            log_entry["job_id"] = record.job_id
        if hasattr(record, "metrics"):
            log_entry["metrics"] = record.metrics
        return json.dumps(log_entry)

logger = logging.getLogger("AudraEngine")
logger.setLevel(logging.INFO)
file_handler = logging.FileHandler(config.LOG_FILE)
file_handler.setFormatter(JsonFormatter())
logger.addHandler(file_handler)

class MonitoringService:
    @staticmethod
    def get_system_metrics():
        """Returns CPU/RAM/IO metrics for the dashboard."""
        return {
            "cpu_percent": psutil.cpu_percent(interval=None),
            "memory_used_mb": round(psutil.virtual_memory().used / (1024 * 1024), 2),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_free_gb": round(psutil.disk_usage('/').free / (1024 * 1024 * 1024), 2),
            "timestamp": time.time()
        }

    @staticmethod
    def log_event(message, job_id=None, level="INFO", metrics=None):
        extra = {}
        if job_id: extra["job_id"] = job_id
        if metrics: extra["metrics"] = metrics
        
        if level == "INFO":
            logger.info(message, extra=extra)
        elif level == "ERROR":
            logger.error(message, extra=extra)
        elif level == "WARNING":
            logger.warning(message, extra=extra)

    @staticmethod
    def get_recent_logs(count=50):
        """Reads back structured logs from the log file."""
        if not os.path.exists(config.LOG_FILE):
            return []
        try:
            with open(config.LOG_FILE, "r") as f:
                lines = f.readlines()
                return [json.loads(line) for line in lines[-count:]]
        except:
            return []
