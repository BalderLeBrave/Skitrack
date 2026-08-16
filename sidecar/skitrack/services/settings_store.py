"""Accès aux préférences persistées (`app_setting`), avec cache mémoire.

Les préférences sont lues à chaque calcul d'itinéraire ; les relire en base à
chaque fois ferait une requête SQLite par domaine.
"""

from __future__ import annotations

from typing import Any

from ..db.session import session_scope
from ..models import AppSetting

_CACHE: dict[str, Any] = {}
_LOADED = False


def load() -> None:
    global _LOADED
    with session_scope() as session:
        from sqlalchemy import select

        _CACHE.clear()
        for row in session.execute(select(AppSetting)).scalars():
            _CACHE[row.key] = row.value
    _LOADED = True


def get_setting(key: str, default: Any = None) -> Any:
    if not _LOADED:
        load()
    return _CACHE.get(key, default)


def all_settings() -> dict[str, Any]:
    if not _LOADED:
        load()
    return dict(_CACHE)


def set_settings(values: dict[str, Any]) -> dict[str, Any]:
    with session_scope() as session:
        for key, value in values.items():
            session.merge(AppSetting(key=key, value=value))
    _CACHE.update(values)
    return dict(_CACHE)
