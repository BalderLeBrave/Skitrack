"""Délais de crawl + jitter. Booking n’emprunte pas ceux d’Airbnb / Gîtes."""

from __future__ import annotations

import random
import time
from typing import Callable

from config import Settings

SleepFn = Callable[[float], None]


def crawl_pause(settings: Settings, sleep: SleepFn = time.sleep) -> float:
    """Respecte le crawl-delay, plus un écart aléatoire (pas de rythme fixe)."""
    wait = settings.crawl_delay_seconds + random.uniform(settings.jitter_min, settings.jitter_max)
    sleep(wait)
    return wait


def human_pause(sleep: SleepFn = time.sleep, *, engine: str = "") -> float:
    """Pause après une page. Crawlbase (HTTP) reste court ; les navigateurs, un peu plus."""
    if engine in ("crawlbase", "scrapingbee"):
        wait = random.uniform(0.12, 0.35)
    else:
        wait = random.uniform(0.7, 1.8)
    sleep(wait)
    return wait


def retry_backoff(attempt: int, base: float = 0.35, cap: float = 2.0, sleep: SleepFn = time.sleep) -> float:
    """attempt 0-based. Court : un défi ne se résout pas en attendant 8 s."""
    wait = min(cap, base * (2 ** max(0, attempt))) + random.uniform(0.1, 0.35)
    sleep(wait)
    return wait
