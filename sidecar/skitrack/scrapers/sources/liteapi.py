from __future__ import annotations

from typing import Any

from ..canonical import CanonicalListing
from ..normalize import normalize


def normalize_liteapi(raw: dict[str, Any]) -> CanonicalListing:
    listing = normalize(raw, "liteapi")
    listing.location_precision = "exact" if listing.lat is not None else "unknown"
    return listing
