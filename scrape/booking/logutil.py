"""Journaux structurés (stderr). stdout reste le JSON du relevé."""

from __future__ import annotations

import json
import logging
import sys
import time
from typing import Any

LOGGER = logging.getLogger("skitrack.booking")


def setup_logging(level: int = logging.INFO) -> None:
    if LOGGER.handlers:
        return
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOGGER.addHandler(handler)
    LOGGER.setLevel(level)
    LOGGER.propagate = False


def event(kind: str, **fields: Any) -> None:
    payload = {"event": kind, "ts": round(time.time(), 3), **fields}
    LOGGER.info(json.dumps(payload, ensure_ascii=False, default=str))


class Timer:
    def __init__(self) -> None:
        self._t0 = time.perf_counter()

    def ms(self) -> int:
        return int((time.perf_counter() - self._t0) * 1000)
