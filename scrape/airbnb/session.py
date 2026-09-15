"""Cache de la clé API et du hash GraphQL Airbnb.

Sans ça, chaque relevé relit la page d’accueil (clé, hash). Un process par
relevé : le cache mémoire ne survit pas à Relancer. Le fichier tient 30 min,
ce qui évite de redemander la page d’accueil — premier déclencheur des 429.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Callable

TTL_S = 180.0
DISK_TTL_S = 30 * 60.0
SESSION_PATH = Path(os.environ.get("SKITRACK_AIRBNB_SESSION") or "/tmp/skitrack-airbnb-session.json")

_key = ""
_key_at = 0.0
_hash = ""
_hash_at = 0.0


def _read_disk() -> dict:
    try:
        raw = json.loads(SESSION_PATH.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def _write_disk(data: dict) -> None:
    try:
        SESSION_PATH.parent.mkdir(parents=True, exist_ok=True)
        SESSION_PATH.write_text(json.dumps(data), encoding="utf-8")
    except OSError:
        pass


def cached(slot: str, fetch: Callable[[], str]) -> str:
    global _key, _key_at, _hash, _hash_at
    now = time.monotonic()
    wall = time.time()
    if slot == "key":
        if _key and now - _key_at < TTL_S:
            return _key
        disk = _read_disk()
        stored = disk.get("key")
        stored_at = disk.get("key_at")
        if isinstance(stored, str) and stored and isinstance(stored_at, (int, float)) and wall - stored_at < DISK_TTL_S:
            _key, _key_at = stored, now
            return _key
        _key = fetch()
        _key_at = now
        if _key:
            disk["key"] = _key
            disk["key_at"] = wall
            _write_disk(disk)
        return _key
    if _hash and now - _hash_at < TTL_S:
        return _hash
    disk = _read_disk()
    stored = disk.get("hash")
    stored_at = disk.get("hash_at")
    if isinstance(stored, str) and stored and isinstance(stored_at, (int, float)) and wall - stored_at < DISK_TTL_S:
        _hash, _hash_at = stored, now
        return _hash
    _hash = fetch()
    _hash_at = now
    if _hash:
        disk["hash"] = _hash
        disk["hash_at"] = wall
        _write_disk(disk)
    return _hash


def invalidate() -> None:
    """Jette clé et hash : un hash périmé n'est pas un 429, mais il faut le relire."""
    global _key, _key_at, _hash, _hash_at
    _key = _hash = ""
    _key_at = _hash_at = 0.0
    try:
        SESSION_PATH.unlink()
    except FileNotFoundError:
        pass


def next_search_cursor(pagination: dict | None, current: str) -> str | None:
    """Airbnb 2026 : pageCursors[], plus nextPageCursor."""
    if not isinstance(pagination, dict):
        return None
    nxt = pagination.get("nextPageCursor")
    if isinstance(nxt, str) and nxt.strip():
        return nxt.strip()
    pages = pagination.get("pageCursors")
    if not isinstance(pages, list) or not pages:
        return None
    cursors = [c for c in pages if isinstance(c, str) and c]
    if not cursors:
        return None
    if not current:
        return cursors[1] if len(cursors) > 1 else None
    try:
        index = cursors.index(current)
    except ValueError:
        return cursors[1] if len(cursors) > 1 else None
    if index + 1 < len(cursors):
        return cursors[index + 1]
    return None
