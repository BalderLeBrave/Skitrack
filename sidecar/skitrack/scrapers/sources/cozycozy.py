from __future__ import annotations

from typing import Any

from ..canonical import CanonicalListing
from ..normalize import normalize


def normalize_cozycozy(raw: dict[str, Any]) -> CanonicalListing:
    return normalize(raw, "cozycozy_scraper")
