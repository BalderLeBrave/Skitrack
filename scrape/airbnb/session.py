"""Cache court de la clé API et du hash GraphQL Airbnb.

Sans ça, chaque relevé relit la page d’accueil trois fois (clé, hash, fiches).
"""

from __future__ import annotations

import time
from typing import Callable

TTL_S = 180.0

_key = ""
_key_at = 0.0
_hash = ""
_hash_at = 0.0


def cached(slot: str, fetch: Callable[[], str]) -> str:
    global _key, _key_at, _hash, _hash_at
    now = time.monotonic()
    if slot == "key":
        if _key and now - _key_at < TTL_S:
            return _key
        _key = fetch()
        _key_at = now
        return _key
    if _hash and now - _hash_at < TTL_S:
        return _hash
    _hash = fetch()
    _hash_at = now
    return _hash


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
