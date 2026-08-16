"""Générateur d'URLs de recherche pré-remplies.

Purement local : construit des liens, ne les appelle jamais.
"""

from __future__ import annotations

import datetime as dt
import functools
import logging
from pathlib import Path
from urllib.parse import quote

import yaml
from pydantic import BaseModel

log = logging.getLogger(__name__)

YAML_PATH = Path(__file__).resolve().parent / "deeplinks.yaml"


class DeepLink(BaseModel):
    name: str
    label: str
    url: str
    verified: str | bool = False
    note: str | None = None


class DeepLinkRequest(BaseModel):
    query: str
    check_in: dt.date | None = None
    check_out: dt.date | None = None
    adults: int = 2
    bedrooms: int = 1
    lat: float | None = None
    lon: float | None = None
    domain_slug: str | None = None


@functools.lru_cache(maxsize=1)
def _config() -> dict:
    if not YAML_PATH.exists():
        log.warning("deeplinks.yaml introuvable (%s)", YAML_PATH)
        return {"sites": [], "domain_sites": {}}
    with YAML_PATH.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def reload_config() -> None:
    """Recharge le YAML sans redémarrer le sidecar (les patterns changent souvent)."""
    _config.cache_clear()


def _fill(pattern: str, values: dict[str, str]) -> str:
    out = pattern
    for key, value in values.items():
        out = out.replace("{" + key + "}", value)
    return out


def build_links(req: DeepLinkRequest) -> list[DeepLink]:
    cfg = _config()
    links: list[DeepLink] = []

    for site in cfg.get("sites", []):
        date_format = site.get("date_format", "%Y-%m-%d")
        values = {
            "query": quote(req.query, safe=""),
            "check_in": req.check_in.strftime(date_format) if req.check_in else "",
            "check_out": req.check_out.strftime(date_format) if req.check_out else "",
            "adults": str(req.adults),
            "bedrooms": str(req.bedrooms),
            "lat": f"{req.lat:.5f}" if req.lat is not None else "",
            "lon": f"{req.lon:.5f}" if req.lon is not None else "",
        }
        links.append(
            DeepLink(
                name=site["name"],
                label=site["label"],
                url=_fill(site["url"], values),
                verified=site.get("verified", False),
                note=site.get("note"),
            )
        )

    if req.domain_slug:
        entry = (cfg.get("domain_sites") or {}).get(req.domain_slug)
        if entry:
            links.append(
                DeepLink(
                    name=f"domain:{req.domain_slug}",
                    label=entry["label"],
                    url=entry["url"],
                    verified=entry.get("verified", False),
                    note=entry.get("note"),
                )
            )
    return links
