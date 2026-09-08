"""normalize(raw, source) → CanonicalListing.

Chaque connecteur (scraper ou API) rend un dict d'origine. Ici on le traduit
vers le contrat unique. L'altitude et la distance aux remontées restent vides :
elles sont calculées ensuite par IGN + domain_lift.base.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from .canonical import (
    CanonicalListing,
    non_negative_int,
    positive_int,
    quality,
)
from ..services.geo_math import plausible_point

AMENITY_MAP = {
    "ski_room": ("ski locker", "local a ski", "local à ski", "ski storage"),
    "sauna": ("sauna",),
    "dishwasher": ("dishwasher", "lave-vaisselle", "lave vaisselle"),
    "parking": ("parking", "garage"),
    "pets": ("pets allowed", "animaux acceptes", "animaux acceptés"),
    "wifi": ("wifi", "wi-fi", "internet"),
    "fireplace": ("fireplace", "cheminee", "cheminée"),
    "washer": ("washer", "washing machine", "lave-linge", "lave linge"),
    "elevator": ("elevator", "ascenseur"),
}


def _first(raw: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if raw.get(key) is not None:
            return raw[key]
    nested = raw.get("listing") if isinstance(raw.get("listing"), dict) else None
    if nested:
        for key in keys:
            if nested.get(key) is not None:
                return nested[key]
    return None


def _url_id(url: str | None, fallback: str) -> str:
    if not url:
        return fallback
    path = urlparse(url).path.rstrip("/")
    return path.split("/")[-1] or fallback


def _amenities(raw: Any) -> list[str]:
    blob = raw
    if isinstance(raw, list):
        blob = " ".join(str(x) for x in raw)
    text = str(blob or "").lower()
    out: list[str] = []
    for key, needles in AMENITY_MAP.items():
        if any(n in text for n in needles):
            out.append(key)
    return out


def _coords(raw: dict[str, Any]) -> tuple[float | None, float | None]:
    lat = _first(raw, "lat", "latitude")
    lon = _first(raw, "lon", "lng", "longitude")
    try:
        lat_f = float(lat) if lat is not None else None
        lon_f = float(lon) if lon is not None else None
    except (TypeError, ValueError):
        return None, None
    if not plausible_point(lat_f, lon_f):
        return None, None
    return lat_f, lon_f


def _price(raw: dict[str, Any]) -> tuple[float | None, float | None]:
    total = _first(raw, "price_total_eur", "totalPrice", "total", "price")
    nightly = _first(raw, "price_per_night_eur", "nightlyPrice", "nightly")
    try:
        total_f = float(total) if total not in (None, 0, "0") else None
    except (TypeError, ValueError):
        total_f = None
    try:
        night_f = float(nightly) if nightly not in (None, 0, "0") else None
    except (TypeError, ValueError):
        night_f = None
    return total_f, night_f


def _precision(source: str, lat: float | None) -> str:
    if lat is None:
        return "unknown"
    if source in {"airbnb_scraper", "abritel_scraper", "cozycozy_scraper"}:
        return "approximate"
    if source == "gites_de_france":
        return "address"
    return "exact"


def _source_of(raw: dict[str, Any], hinted: str | None) -> str:
    if hinted:
        return hinted
    s = str(raw.get("source") or raw.get("src") or "").lower()
    if "airbnb" in s:
        return "airbnb_scraper"
    if "booking" in s:
        return "booking_scraper"
    if "abritel" in s or "vrbo" in s:
        return "abritel_scraper"
    if "gite" in s:
        return "gites_de_france"
    if "liteapi" in s:
        return "liteapi"
    if "expedia" in s:
        return "expedia"
    if "osm" in s:
        return "osm"
    if "cozy" in s:
        return "cozycozy_scraper"
    return "manual"


def normalize(raw: dict[str, Any], source: str | None = None) -> CanonicalListing:
    """Traduit un brut worker/API. N'écrit jamais altitude_m ni dist_to_nearest_lift_m."""
    src = _source_of(raw, source)
    lat, lon = _coords(raw)
    total, nightly = _price(raw)
    url = _first(raw, "url", "deep_link", "deepLink")
    source_id = str(
        _first(raw, "source_id", "sourceId", "id")
        or _url_id(url, "unknown")
    )
    bedrooms = positive_int(
        _first(
            raw,
            "bedrooms",
            "bedroomCount",
            "bedRoomCount",
            "numberOfBedrooms",
            "chambres",
            "ch",
        )
    )
    if bedrooms is None and (_first(raw, "rooms") == 1 or str(_first(raw, "type") or "").lower() == "studio"):
        bedrooms = 0
    capacity = positive_int(
        _first(
            raw,
            "capacity_max",
            "personCapacity",
            "guestCapacity",
            "maxPersons",
            "guests",
            "pers",
            "personnes",
            "occupancy",
        )
    )
    if capacity is None:
        adults = positive_int(_first(raw, "adults"))
        children = non_negative_int(_first(raw, "children"))
        if adults is not None or children is not None:
            capacity = (adults or 0) + (children or 0)
            if capacity <= 0:
                capacity = None
    beds = positive_int(_first(raw, "beds", "bedCount", "lits"))
    name = str(_first(raw, "name", "title") or "").strip() or source_id
    rating = _first(raw, "rating", "avgRating", "guestRating")
    try:
        rating_f = float(rating) if rating is not None else None
    except (TypeError, ValueError):
        rating_f = None
    scale_raw = _first(raw, "rating_scale", "ratingScale")
    scale = 10 if scale_raw in (10, "10") or src in {"booking_scraper", "liteapi"} else 5 if rating_f is not None else None
    if src in {"booking_scraper", "liteapi"} and rating_f is not None:
        scale = 10
    if src in {"airbnb_scraper", "abritel_scraper"} and rating_f is not None:
        scale = 5

    # Interdit : recopier une altitude marketing.
    listing = CanonicalListing(
        source=src,
        source_id=source_id,
        name=name,
        url=url,
        lat=lat,
        lon=lon,
        location_precision=_precision(src, lat),  # type: ignore[arg-type]
        address_text=_first(raw, "address", "address_text", "addressText"),
        commune=_first(raw, "commune", "city"),
        altitude_m=None,
        altitude_source="none",
        bedrooms=bedrooms,
        beds=beds,
        capacity_max=capacity,
        capacity_source="provider" if capacity is not None else "none",
        dist_to_nearest_lift_m=None,
        walk_min_to_lift=None,
        domain_id=str(raw["domain_id"]) if raw.get("domain_id") is not None else None,
        price_total_eur=total,
        price_per_night_eur=nightly,
        rating=rating_f,
        rating_scale=scale,  # type: ignore[arg-type]
        review_count=non_negative_int(_first(raw, "review_count", "reviewCount", "reviews_count")),
        amenities=_amenities(_first(raw, "amenities", "description") or ""),
        raw=raw,
    )
    listing.fields_quality = {
        "altitude_m": "missing",
        "bedrooms": "ok" if listing.bedrooms is not None else "missing",
        "capacity_max": "ok" if listing.capacity_max is not None else "missing",
        "dist_to_nearest_lift_m": "missing",
        "lat": quality(lat),
    }
    return listing
