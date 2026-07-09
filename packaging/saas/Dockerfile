# ── Dockerfile — Production SaaS Deployment Container for Audra v2 ──
FROM python:3.11-slim

# 1. Install production dependencies and FFmpeg utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 2. Setup isolated working folder scope
WORKDIR /app

# 3. Cache python dependencies installations
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir gunicorn

# 4. Copy app codebase into container
COPY . .

# 5. Create storage endpoints to mount local cache folders
RUN mkdir -p input output && chmod -R 777 input output

# 6. Expose operational Flask/gunicorn serving port
EXPOSE 5050

# 7. Environment parameters
ENV FLASK_APP=server.py
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1

# 8. Start Flask app with multithreaded gunicorn.
# Using 1 worker and 4 threads is crucial to ensure that the in-memory 
# concurrent rendering queue is shared globally across request threads.
CMD ["gunicorn", "--bind", "0.0.0.0:5050", "--workers", "1", "--threads", "4", "server:app"]
