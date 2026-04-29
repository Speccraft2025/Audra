import threading
import time
import subprocess
import os
import signal
import psutil
from audra import config
from audra.utils.monitoring import MonitoringService

class QueueManager:
    def __init__(self):
        self.jobs = {}
        self.jobs_lock = threading.Lock()
        self.semaphore = threading.Semaphore(config.CONCURRENCY_LIMIT)
        self.active_processes = {}  # {job_id: subprocess.Popen}
        
        # Start Watchdog thread
        self.watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True)
        self.watchdog_thread.start()

    def add_job(self, job_data):
        with self.jobs_lock:
            self.jobs[job_data['id']] = job_data
        MonitoringService.log_event(f"Job queued: {job_data['id']}", job_id=job_data['id'])

    def update_job(self, job_id, updates):
        with self.jobs_lock:
            if job_id in self.jobs:
                self.jobs[job_id].update(updates)

    def get_job(self, job_id):
        with self.jobs_lock:
            return self.jobs.get(job_id)

    def get_all_jobs(self):
        with self.jobs_lock:
            return list(self.jobs.values())

    def clear_all(self):
        with self.jobs_lock:
            self.jobs = {}
            MonitoringService.log_event("All jobs cleared from memory store.")

    def register_process(self, job_id, process):
        self.active_processes[job_id] = process

    def unregister_process(self, job_id):
        if job_id in self.active_processes:
            del self.active_processes[job_id]

    def _watchdog_loop(self):
        """Monitors system resources and kills offending workers if necessary."""
        while True:
            try:
                metrics = MonitoringService.get_system_metrics()
                
                # Check for high memory usage across active jobs
                for job_id, proc in list(self.active_processes.items()):
                    if proc.poll() is None:  # Still running
                        try:
                            p = psutil.Process(proc.pid)
                            mem_mb = p.memory_info().rss / (1024 * 1024)
                            
                            if mem_mb > config.MEMORY_LIMIT_MB:
                                MonitoringService.log_event(
                                    f"Memory Limit Exceeded ({mem_mb:.1f}MB). Killing Job.",
                                    job_id=job_id, level="ERROR"
                                )
                                proc.kill()
                                self.update_job(job_id, {"status": "failed", "error": "Memory budget exceeded"})
                        except:
                            pass
                
                # Global Pause if CPU too high? 
                # (Optional: Implementation of backpressure here)
                
            except Exception as e:
                MonitoringService.log_event(f"Watchdog Error: {e}", level="WARNING")
            
            time.sleep(2)  # Check every 2 seconds

# Singleton instance
manager = QueueManager()
