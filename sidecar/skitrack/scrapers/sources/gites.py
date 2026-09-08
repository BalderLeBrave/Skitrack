from __future__ import annotations

from typing import Any

from ..canonical import CanonicalListing
from ..normalize import normalize


def normalize_gites(raw: dict[str, Any]) -> CanonicalListing:
    """Gîtes de France : chambres / personnes, GPS à l'adresse."""
    listing = normalize(raw, "gites_de_france")
    listing.location_precision = "address" if listing.lat is not None else "unknown"
    return listing
