"""booking-scraper-api (ScrapingBee). Isolé de Crawlbase / Airbnb / Gîtes."""

from __future__ import annotations

import os
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _ingest_env_file(path: Path) -> None:
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        if key and val and key not in os.environ:
            os.environ[key] = val


def token() -> str:
    _ingest_env_file(HERE / ".env")
    _ingest_env_file(HERE.parent.parent / ".env")
    return (
        os.environ.get("SCRAPINGBEE_API_KEY")
        or os.environ.get("BOOKING_SCRAPER_API_KEY")
        or ""
    ).strip()


EXTRACT_RULES = {
    "hotels": {
        "selector": "div[data-testid='property-card'], div[data-testid='property-card-container']",
        "type": "list",
        "output": {
            "name": "div[data-testid='title']",
            "price": "[data-testid='price-and-discounted-price']",
            "url": {"selector": "a[href*='/hotel/']", "output": "@href"},
            "units": "[data-testid='recommended-units']",
            "location": "[data-testid='address']",
        },
    }
}
