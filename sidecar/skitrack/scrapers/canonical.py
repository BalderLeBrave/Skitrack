"""CanonicalListing — miroir Python du contrat partagé (src/shared/canonicalListing.ts)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

ListingSource = Literal[
    "liteapi",
    "booking_scraper",
    "expedia",
    "gites_de_france",
    "osm",
    "airbnb_scraper",
    "abritel_scraper",
    "cozycozy_scraper",
    "manual",
    "deeplink",
]
LocationPrecision = Literal["exact", "address", "approximate", "unknown"]
FieldQuality = Literal["ok", "inferred", "missing", "conflict"]
CapacitySource = Literal["provider", "osm", "parsed", "inferred", "none"]
AltitudeSource = Literal["ign", "eudem", "openskimap_point", "curated", "none"]


class CanonicalListing(BaseModel):
    source: str
    source_id: str
    name: str
    url: str | None = None
    lat: float | None = None
    lon: float | None = None
    location_precision: LocationPrecision = "unknown"
    address_text: str | None = None
    commune: str | None = None
    altitude_m: int | None = None
    altitude_source: AltitudeSource = "none"
    bedrooms: int | None = None
    beds: int | None = None
    capacity_max: int | None = None
    capacity_source: CapacitySource = "none"
    dist_to_nearest_lift_m: int | None = None
    walk_min_to_lift: int | None = None
    domain_id: str | None = None
    price_total_eur: float | None = None
    price_per_night_eur: float | None = None
    rating: float | None = None
    rating_scale: Literal[5, 10] | None = None
    review_count: int | None = None
    amenities: list[str] = Field(default_factory=list)
    fields_quality: dict[str, FieldQuality] = Field(default_factory=dict)
    raw: dict[str, Any] | None = None


def quality(value: Any) -> FieldQuality:
    if value is None:
        return "missing"
    if isinstance(value, (int, float)) and value == value:  # not NaN
        return "ok"
    if isinstance(value, str) and value.strip():
        return "ok"
    if isinstance(value, (list, dict)) and value:
        return "ok"
    return "missing"


def positive_int(value: Any) -> int | None:
    """0 et valeurs non numériques → None. Un studio annoncé passe par `studio_bedrooms`."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def non_negative_int(value: Any) -> int | None:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n >= 0 else None
