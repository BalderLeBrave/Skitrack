"""Géocodage d'adresse.

* **Base Adresse Nationale** (``api-adresse.data.gouv.fr``) pour la France :
  ouverte, sans clé, précision au numéro de rue. Vérifiée en fonctionnement le
  2026-08-11 sur l'adresse de test du cahier des charges.
* **Nominatim** (OpenStreetMap) pour le reste de l'Europe. Sa politique d'usage
  impose 1 requête/seconde et un User-Agent identifiant : les deux sont
  appliqués. Pour un usage intensif, il faut sa propre instance.
"""

from __future__ import annotations

import logging

from ..config import get_settings
from ..schemas.geo import GeocodeResult
from .http import get_http

log = logging.getLogger(__name__)

BAN_URL = "https://api-adresse.data.gouv.fr/search/"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


def _looks_french(query: str) -> bool:
    """Heuristique : code postal à 5 chiffres, ou mention explicite de la France.

    Se tromper n'est pas grave — en cas d'échec de la BAN on repasse par
    Nominatim, et inversement.
    """
    import re

    if re.search(r"\b\d{5}\b", query):
        return True
    return "france" in query.lower()


async def _geocode_ban(query: str, limit: int) -> list[GeocodeResult]:
    settings = get_settings()
    data = await get_http().request_json(
        "GET",
        BAN_URL,
        namespace="geocode",
        ttl_s=settings.ttl_geocode_s,
        params={"q": query, "limit": limit},
        min_interval_s=0.1,
    )
    out = []
    for feat in (data or {}).get("features", []):
        lon, lat = feat["geometry"]["coordinates"]
        props = feat.get("properties", {})
        out.append(
            GeocodeResult(
                label=props.get("label", query),
                lat=float(lat),
                lon=float(lon),
                score=props.get("score"),
                city=props.get("city"),
                postcode=props.get("postcode"),
                provider="ban",
            )
        )
    return out


async def _geocode_nominatim(query: str, limit: int) -> list[GeocodeResult]:
    settings = get_settings()
    data = await get_http().request_json(
        "GET",
        NOMINATIM_URL,
        namespace="geocode",
        ttl_s=settings.ttl_geocode_s,
        params={"q": query, "format": "jsonv2", "limit": limit, "addressdetails": 1},
        min_interval_s=1.05,  # politique d'usage Nominatim
    )
    out = []
    for item in data or []:
        addr = item.get("address", {})
        out.append(
            GeocodeResult(
                label=item.get("display_name", query),
                lat=float(item["lat"]),
                lon=float(item["lon"]),
                score=float(item.get("importance", 0) or 0),
                city=addr.get("city") or addr.get("town") or addr.get("village"),
                postcode=addr.get("postcode"),
                provider="nominatim",
            )
        )
    return out


async def geocode(query: str, *, limit: int = 5) -> list[GeocodeResult]:
    primary, fallback = (
        (_geocode_ban, _geocode_nominatim)
        if _looks_french(query)
        else (_geocode_nominatim, _geocode_ban)
    )
    try:
        results = await primary(query, limit)
    except Exception as exc:  # noqa: BLE001
        log.warning("Géocodeur principal en échec (%s), bascule sur le secondaire", exc)
        results = []
    if results:
        return results
    try:
        return await fallback(query, limit)
    except Exception as exc:  # noqa: BLE001
        log.error("Aucun géocodeur disponible : %s", exc)
        return []
