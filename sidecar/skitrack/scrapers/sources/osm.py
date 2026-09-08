from __future__ import annotations

from typing import Any

from ..canonical import CanonicalListing
from ..normalize import normalize, positive_int


def normalize_osm(raw: dict[str, Any]) -> CanonicalListing:
    """OSM tourism=apartment/chalet : rooms / beds / capacity. Pas de prix."""
    listing = normalize(raw, "osm")
    if listing.bedrooms is None:
        rooms = positive_int(raw.get("rooms"))
        if rooms == 1:
            listing.bedrooms = 0
        elif rooms is not None:
            listing.bedrooms = rooms
    if listing.capacity_max is None:
        cap = positive_int(raw.get("capacity")) or listing.beds
        if cap is not None:
            listing.capacity_max = cap
    listing.capacity_source = "osm" if listing.capacity_max is not None else "none"
    listing.fields_quality["bedrooms"] = "ok" if listing.bedrooms is not None else "missing"
    listing.fields_quality["capacity_max"] = "ok" if listing.capacity_max is not None else "missing"
    return listing
