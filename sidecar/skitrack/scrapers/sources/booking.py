from __future__ import annotations

from typing import Any

from ..canonical import CanonicalListing
from ..normalize import normalize


def normalize_booking(raw: dict[str, Any]) -> CanonicalListing:
    """Booking JSON/HTML : numberOfBedrooms / maxPersons, note /10."""
    listing = normalize(raw, "booking_scraper")
    if listing.rating is not None:
        listing.rating_scale = 10
    return listing
