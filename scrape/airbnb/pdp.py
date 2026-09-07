"""Fiches Airbnb via PdpPlatformSections (stl-scraper). Isolé de Playwright.

ExploreSearch de STL est mort (400). La fiche PDP sert encore : capacité,
type de bien. On ne l’appelle que pour les annonces sans occupancy.
"""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any
from urllib.parse import urlencode

from occupancy import merge_occupancy, occupancy_from_pdp

# Hash relevé dans stl-scraper (stl/endpoint/pdp.py). Toujours valide le 2026-09-06.
PDP_HASH = "625a4ba56ba72f8e8585d60078eb95ea0030428cac8772fde09de073da1bcdd0"
MAX_ENRICH = 24
WORKERS = 6


def _api_key(proxy_url: str = "") -> str:
    import pyairbnb.api as airbnb_api
    from session import cached

    return cached("key", lambda: airbnb_api.get(proxy_url, timeout=20))


def fetch_pdp(
    listing_id: str,
    *,
    check_in: str | None,
    check_out: str | None,
    adults: int | None,
    api_key: str,
    proxy_url: str = "",
) -> dict[str, Any] | None:
    from curl_cffi import requests

    variables = {
        "request": {
            "id": str(listing_id),
            "layouts": ["SIDEBAR", "SINGLE_COLUMN"],
            "adults": str(int(adults)) if adults else "1",
            "checkIn": check_in,
            "checkOut": check_out,
            "preview": False,
            "bypassTargetings": False,
            "privateBooking": False,
        }
    }
    query = {
        "operationName": "PdpPlatformSections",
        "locale": "fr",
        "currency": "EUR",
        "variables": json.dumps(variables, separators=(",", ":")),
        "extensions": json.dumps(
            {"persistedQuery": {"version": 1, "sha256Hash": PDP_HASH}},
            separators=(",", ":"),
        ),
    }
    url = "https://www.airbnb.fr/api/v3/PdpPlatformSections?" + urlencode(query)
    proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None
    try:
        res = requests.get(
            url,
            headers={
                "Accept": "application/json",
                "x-airbnb-api-key": api_key,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            proxies=proxies,
            timeout=20,
            impersonate="chrome124",
        )
        res.raise_for_status()
        raw = res.json()
    except Exception:
        return None
    if not isinstance(raw, dict) or raw.get("errors"):
        return None
    return occupancy_from_pdp(raw)


def enrich_listings(
    listings: list[dict[str, Any]],
    *,
    check_in: str | None,
    check_out: str | None,
    adults: int | None,
    proxy_url: str = "",
    min_guests: int | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Complète guests/room_type. Rend (annonces, nb de fiches lues)."""
    missing = [row for row in listings if row.get("guests") is None][:MAX_ENRICH]
    if not missing:
        return listings, 0
    try:
        key = _api_key(proxy_url)
    except Exception:
        return listings, 0

    occ_by_id: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futs = {
            pool.submit(
                fetch_pdp,
                row["id"],
                check_in=check_in,
                check_out=check_out,
                adults=adults,
                api_key=key,
                proxy_url=proxy_url,
            ): row["id"]
            for row in missing
        }
        for fut in as_completed(futs):
            listing_id = futs[fut]
            try:
                occ = fut.result()
            except Exception:
                occ = None
            if occ:
                occ_by_id[listing_id] = occ

    out: list[dict[str, Any]] = []
    for row in listings:
        occ = occ_by_id.get(row["id"])
        merged = merge_occupancy(row, occ) if occ else dict(row)
        if merged is None:
            continue
        guests = merged.get("guests")
        if min_guests and isinstance(guests, int) and guests < min_guests:
            continue
        out.append(merged)
    return out, len(occ_by_id)
