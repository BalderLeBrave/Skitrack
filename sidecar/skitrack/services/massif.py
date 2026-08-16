"""Classification en massifs à partir du code ISO 3166-2."""

from __future__ import annotations

import functools
import logging

import yaml

from ..config import REFERENCE_DIR

log = logging.getLogger(__name__)


@functools.lru_cache(maxsize=1)
def _table() -> dict:
    path = REFERENCE_DIR / "massifs.yaml"
    if not path.exists():
        log.warning("massifs.yaml introuvable (%s) — aucun massif ne sera renseigné", path)
        return {"by_admin_code": {}, "by_country": {}}
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def massif_for(admin_code: str | None, country: str | None) -> str | None:
    table = _table()
    if admin_code:
        hit = table.get("by_admin_code", {}).get(admin_code)
        if hit:
            return hit
    if country:
        return table.get("by_country", {}).get(country.upper())
    return None


def known_massifs() -> list[str]:
    table = _table()
    values = set(table.get("by_admin_code", {}).values())
    values |= set(table.get("by_country", {}).values())
    return sorted(values)
