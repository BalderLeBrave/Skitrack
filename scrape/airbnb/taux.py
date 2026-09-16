"""Limites de taux, fichier partagé Python / Node.

On ne découvre pas la limite au 429 : on se cale avant. Relancer lit le
même journal, donc ne martèle pas pendant la fenêtre.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

TAUX_PATH = Path(os.environ.get("SKITRACK_TAUX") or "/tmp/skitrack-taux.json")

# Airbnb : 18 appels / 60 s, 2 s entre deux. Au-delà on s'arrête, on garde le relevé.
HOSTS: dict[str, tuple[float, int]] = {
    "airbnb": (2.0, 18),
    "gites": (2.0, 24),
    "booking": (1.2, 24),
}
WINDOW_S = 60.0
SLEEP_CAP_S = 5.0


def _load() -> dict:
    try:
        raw = json.loads(TAUX_PATH.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def _save(data: dict) -> None:
    try:
        TAUX_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = TAUX_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data), encoding="utf-8")
        tmp.replace(TAUX_PATH)
    except OSError:
        pass


def attente_s(host: str, now: float | None = None) -> float:
    now = time.time() if now is None else now
    row = _load().get(host) or {}
    until = float(row.get("until") or 0)
    if until > now:
        return until - now
    hits = [float(t) for t in row.get("hits") or [] if isinstance(t, (int, float)) and now - float(t) < WINDOW_S]
    gap, max_n = HOSTS.get(host, (2.0, 20))
    wait_gap = 0.0
    if hits:
        wait_gap = max(0.0, max(hits) + gap - now)
    if len(hits) >= max_n:
        return max(wait_gap, WINDOW_S - (now - min(hits)))
    return wait_gap


def noter_hit(host: str, now: float | None = None) -> None:
    now = time.time() if now is None else now
    data = _load()
    row = data.get(host) if isinstance(data.get(host), dict) else {}
    hits = [float(t) for t in row.get("hits") or [] if isinstance(t, (int, float)) and now - float(t) < WINDOW_S]
    hits.append(now)
    data[host] = {"hits": hits, "until": float(row.get("until") or 0)}
    _save(data)


def noter_blocage(host: str, wait_s: float, now: float | None = None) -> None:
    now = time.time() if now is None else now
    hold = max(0.2, float(wait_s))
    data = _load()
    row = data.get(host) if isinstance(data.get(host), dict) else {}
    data[host] = {
        "hits": [float(t) for t in row.get("hits") or [] if isinstance(t, (int, float))],
        "until": max(float(row.get("until") or 0), now + hold),
    }
    _save(data)


def pace(host: str, sleep_cap: float = SLEEP_CAP_S) -> float:
    """Attend si c'est court. Sinon rend l'attente : l'appelant s'arrête."""
    wait = attente_s(host)
    if wait <= 0:
        noter_hit(host)
        return 0.0
    if wait <= sleep_cap:
        time.sleep(wait)
        noter_hit(host)
        return 0.0
    return wait
