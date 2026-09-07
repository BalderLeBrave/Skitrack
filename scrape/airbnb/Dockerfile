# Worker Airbnb isolé — pyairbnb (HTTP), pas de Chromium Playwright.
# Un changement Booking / Gîtes / Abritel ne rebuild pas cette image.

FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080 \
    SOURCE=airbnb \
    PYTHONPATH=/app
COPY scrape/airbnb/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY scrape/airbnb /app
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,os; urllib.request.urlopen('http://127.0.0.1:%s/health'%os.environ.get('PORT','8080'), timeout=2)"
CMD ["python", "worker.py"]
