"""Profil navigateur local (cookies Booking). Un dossier par moteur, rien de partagé."""

from __future__ import annotations

import os
from pathlib import Path

HERE = Path(__file__).resolve().parent


def profile_dir(engine: str) -> Path:
    root = Path(os.environ.get("SKITRACK_BOOKING_PROFILES") or HERE / ".profiles")
    path = root / engine
    path.mkdir(parents=True, exist_ok=True)
    return path
