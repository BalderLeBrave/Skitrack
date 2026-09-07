# Worker Booking isolé — invisible_playwright → Camoufox → SeleniumBase UC.
# Un changement Airbnb / Gîtes / Abritel ne rebuild pas cette image.

FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080 \
    SOURCE=booking-web \
    PYTHONPATH=/app \
    SKITRACK_BOOKING_HEADLESS=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libnss3 \
      libx11-xcb1 \
      libxrandr2 \
      libxshmfence1 \
      libxss1 \
      libxtst6 \
      xvfb \
    && rm -rf /var/lib/apt/lists/*
COPY scrape/booking/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt \
 && python -m invisible_playwright fetch \
 && python -m camoufox fetch
COPY scrape/booking /app
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request,os; urllib.request.urlopen('http://127.0.0.1:%s/health'%os.environ.get('PORT','8080'), timeout=3)"
CMD ["python", "worker.py"]
