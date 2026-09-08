from __future__ import annotations

from typing import Any

from ..canonical import CanonicalListing
from ..normalize import normalize


def normalize_abritel(raw: dict[str, Any]) -> CanonicalListing:
    """Abritel / VRBO via Cozy : bedRoomCount / guestCapacity, GPS flou."""
    listing = normalize(raw, "abritel_scraper")
    listing.location_precision = "approximate" if listing.lat is not None else "unknown"
    if listing.rating is not None:
        listing.rating_scale = 5
    return listing
