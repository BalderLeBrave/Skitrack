"""Moteur qui a marché + quarantaine des défis. Pas partagé avec Airbnb / Gîtes."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
STATE_PATH = Path(os.environ.get("SKITRACK_BOOKING_STATE") or HERE / ".engine-state.json")
COOLDOWN_S = 20 * 60


class EngineState:
    def __init__(self, path: Path | None = STATE_PATH, data: dict[str, Any] | None = None) -> None:
        self.path = path
        self.data = data if data is not None else self._read()

    def _read(self) -> dict[str, Any]:
        if not self.path or not self.path.is_file():
            return {}
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return raw if isinstance(raw, dict) else {}

    def _write(self) -> None:
        if not self.path:
            return
        try:
            self.path.write_text(json.dumps(self.data, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass

    def last_good(self) -> str | None:
        name = self.data.get("lastGood")
        return str(name) if isinstance(name, str) and name else None

    def cooling(self, name: str, now: float | None = None) -> bool:
        until = (self.data.get("blockedUntil") or {}).get(name)
        if not isinstance(until, (int, float)):
            return False
        return until > (now if now is not None else time.time())

    def rank(self, names: list[str], now: float | None = None) -> list[str]:
        now = now if now is not None else time.time()
        good = self.last_good()
        hot = [n for n in names if not self.cooling(n, now)]
        cold = [n for n in names if self.cooling(n, now)]
        if good in hot:
            hot = [good] + [n for n in hot if n != good]
        elif good in cold:
            cold = [good] + [n for n in cold if n != good]
        return hot + cold

    def mark_good(self, name: str) -> None:
        blocked = dict(self.data.get("blockedUntil") or {})
        blocked.pop(name, None)
        self.data["lastGood"] = name
        self.data["blockedUntil"] = blocked
        self.data["goodAt"] = time.time()
        self._write()

    def mark_blocked(self, name: str, now: float | None = None) -> None:
        blocked = dict(self.data.get("blockedUntil") or {})
        blocked[name] = (now if now is not None else time.time()) + COOLDOWN_S
        self.data["blockedUntil"] = blocked
        self._write()
