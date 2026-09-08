from __future__ import annotations

from typing import Any

from ..canonical import CanonicalListing
from ..normalize import normalize


def normalize_central(raw: dict[str, Any], engine: str = "station") -> CanonicalListing:
    listing = normalize(raw, f"central:{engine}")
    listing.source = f"central:{engine}"
    return listing
