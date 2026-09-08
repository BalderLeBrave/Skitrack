"""Raffiner les GPS d'une annonce.

Le provider n'est pas la source de vérité géo. On garde un point exact
plausible ; sinon BAN (France) / Nominatim. Le centroïde du domaine n'est
jamais posé comme GPS du logement.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from ..schemas.geo import GeocodeResult
from .geo_math import haversine_m, plausible_point
from .geocoding import geocode as default_geocode

MAX_KM_FROM_DOMAIN = 40.0
MIN_BAN_SCORE = 0.4

STREET_RE = re.compile(
    r"\b(rue|avenue|av\.?|place|impasse|chemin|route|bd|boul\.?|boulevard|"
    r"all[eé]e|square|quai|lotissement|r[eé]sidence|hameau|mont[eé]e)\b",
    re.I,
)
HAS_NUMBER = re.compile(r"\d{1,4}")
POSTCODE = re.compile(r"\b\d{5}\b")

GeocodeFn = Callable[..., Awaitable[list[GeocodeResult]]]


@dataclass(slots=True)
class RefinedPoint:
    lat: float | None
    lon: float | None
    precision: str
    source: str
    label: str | None = None
    city: str | None = None


def geocode_query(address: str | None, commune: str | None) -> tuple[str, str] | None:
    """(requête, précision visée) ou None si on ne doit pas géocoder.

    Un titre d'annonce n'est pas une adresse : « Chalet les étoiles » enverrait
    toutes les cartes au même chef-lieu.
    """
    addr = (address or "").strip()
    town = (commune or "").strip()
    if addr and STREET_RE.search(addr) and HAS_NUMBER.search(addr):
        return addr, "address"
    if addr and POSTCODE.search(addr):
        hoped = "address" if STREET_RE.search(addr) else "approximate"
        return addr, hoped
    if town and len(town) >= 3:
        return town, "approximate"
    return None


def precision_from_kind(kind: str | None, hoped: str) -> str:
    k = (kind or "").lower()
    if k in {"housenumber", "street", "house", "building"}:
        return "address"
    if k in {"locality", "municipality", "city", "town", "village", "hamlet"}:
        return "approximate"
    return hoped


def _too_far(lat: float, lon: float, domain_lat: float | None, domain_lon: float | None) -> bool:
    if domain_lat is None or domain_lon is None:
        return False
    return haversine_m(lat, lon, domain_lat, domain_lon) > MAX_KM_FROM_DOMAIN * 1000


async def refine_listing_coords(
    *,
    lat: float | None,
    lon: float | None,
    precision: str | None,
    address: str | None = None,
    commune: str | None = None,
    domain_lat: float | None = None,
    domain_lon: float | None = None,
    geocode_fn: GeocodeFn | None = None,
) -> RefinedPoint:
    """Décide le point à utiliser pour l'altitude et la distance aux remontées."""
    lookup = geocode_fn or default_geocode
    prec = (precision or "").lower() or "unknown"
    ok = plausible_point(lat, lon)
    far = ok and _too_far(float(lat), float(lon), domain_lat, domain_lon)

    if ok and prec == "exact" and not far:
        return RefinedPoint(float(lat), float(lon), "exact", "provider")

    query = geocode_query(address, commune)
    if query:
        q, hoped = query
        hits = await lookup(q, limit=5, lat=domain_lat, lon=domain_lon)
        chosen: GeocodeResult | None = None
        best_d = None
        for hit in hits:
            if hit.score is not None and hit.score < MIN_BAN_SCORE:
                continue
            if not plausible_point(hit.lat, hit.lon):
                continue
            if _too_far(hit.lat, hit.lon, domain_lat, domain_lon):
                continue
            if domain_lat is not None and domain_lon is not None:
                d = haversine_m(hit.lat, hit.lon, domain_lat, domain_lon)
                if best_d is None or d < best_d:
                    best_d, chosen = d, hit
            else:
                chosen = hit
                break
        if chosen is not None:
            return RefinedPoint(
                chosen.lat,
                chosen.lon,
                precision_from_kind(chosen.kind, hoped),
                chosen.provider,
                label=chosen.label,
                city=chosen.city,
            )

    if ok and not far:
        kept = prec if prec in {"exact", "address", "approximate"} else "approximate"
        return RefinedPoint(float(lat), float(lon), kept, "provider")

    return RefinedPoint(None, None, "unknown", "none")
