"""Relevé Airbnb via pyairbnb — process dédié, sans Playwright.

Les autres sources (Booking, Gîtes, Abritel) n’importent pas ce module.
"""

from __future__ import annotations

import contextlib
import io
import os
import sys
import time
from typing import Any
from urllib.parse import quote, urlencode

from map import listings_from_raw
from pdp import enrich_listings
from session import cached, next_search_cursor

# Paquet vendu à côté de ce fichier.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pyairbnb  # noqa: E402
import pyairbnb.api as airbnb_api  # noqa: E402
import pyairbnb.search as airbnb_search  # noqa: E402
from pyairbnb.utils import get_nested_value  # noqa: E402

MAX_PAGES = 80
DEFAULT_TIMEOUT = 45
CURRENCY = "EUR"
LANGUAGE = "fr"
PLACE_TYPE = "Entire home/apt"


def _proxy() -> str:
    raw = os.environ.get("SKITRACK_PROXY") or os.environ.get("HTTPS_PROXY") or ""
    return raw.strip()


def zoom_for_bounds(north: float, south: float, east: float, west: float) -> int:
    width = max(1e-4, abs(east - west))
    from math import log2

    brut = log2((360 * 1100) / (256 * width))
    return max(8, min(14, round(brut)))


def bounds_from_point(lat: float, lon: float, radius_km: float = 12.0) -> dict[str, float]:
    from math import cos, pi

    dlat = radius_km / 111.0
    dlng = radius_km / (111.0 * max(0.2, cos(lat * pi / 180.0)))
    return {
        "north": lat + dlat,
        "south": lat - dlat,
        "east": lon + dlng,
        "west": lon - dlng,
    }


def build_search_url(params: dict[str, Any]) -> str:
    given = params.get("url")
    if isinstance(given, str) and given.startswith("http"):
        return given
    city = str(params.get("city") or params.get("destination") or "France").strip()
    segment = quote(city.replace(",", "--").replace(" ", "-"))
    query: dict[str, str] = {}
    bounds = params.get("bounds") if isinstance(params.get("bounds"), dict) else None
    if not bounds and isinstance(params.get("lat"), (int, float)) and isinstance(params.get("lon"), (int, float)):
        bounds = bounds_from_point(float(params["lat"]), float(params["lon"]))
    if bounds:
        north = float(bounds.get("north") or bounds.get("ne_lat") or 0)
        south = float(bounds.get("south") or bounds.get("sw_lat") or 0)
        east = float(bounds.get("east") or bounds.get("ne_lng") or bounds.get("ne_long") or 0)
        west = float(bounds.get("west") or bounds.get("sw_lng") or bounds.get("sw_long") or 0)
        query["ne_lat"] = str(north)
        query["ne_lng"] = str(east)
        query["sw_lat"] = str(south)
        query["sw_lng"] = str(west)
        query["zoom"] = str(zoom_for_bounds(north, south, east, west))
        query["search_by_map"] = "true"
    if params.get("checkIn") or params.get("checkin"):
        query["checkin"] = str(params.get("checkIn") or params.get("checkin"))
    if params.get("checkOut") or params.get("checkout"):
        query["checkout"] = str(params.get("checkOut") or params.get("checkout"))
    adults = params.get("adults") or params.get("guests")
    if adults:
        query["adults"] = str(int(adults))
    if params.get("children"):
        query["children"] = str(int(params["children"]))
    if params.get("infants"):
        query["infants"] = str(int(params["infants"]))
    if params.get("minPrice") is not None:
        query["price_min"] = str(int(params["minPrice"]))
    if params.get("maxPrice") is not None:
        query["price_max"] = str(int(params["maxPrice"]))
    bedrooms = params.get("bedrooms") or params.get("min_bedrooms")
    if bedrooms:
        query["min_bedrooms"] = str(int(bedrooms))
    query["room_types[]"] = PLACE_TYPE
    suffix = urlencode(query)
    return f"https://www.airbnb.fr/s/{segment}/homes" + (f"?{suffix}" if suffix else "")


def _hash(proxy_url: str) -> str:
    def fetch() -> str:
        try:
            return airbnb_search.fetch_stays_search_hash(proxy_url, timeout=DEFAULT_TIMEOUT)
        except Exception:
            return ""

    return cached("hash", fetch)


def _search_pages(url: str, proxy_url: str, max_pages: int) -> tuple[list[Any], int]:
    raw_params = airbnb_search.url_to_raw_params(url)
    api_key = cached("key", lambda: airbnb_api.get(proxy_url, timeout=DEFAULT_TIMEOUT))
    op_hash = _hash(proxy_url)
    pages = 0
    raws: list[Any] = []
    cursor = ""
    call = {
        "currency": CURRENCY,
        "language": LANGUAGE,
        "proxy_url": proxy_url,
        "hash": op_hash,
        "raw_params": raw_params,
        "check_in": None,
        "check_out": None,
        "ne_lat": 0,
        "ne_long": 0,
        "sw_lat": 0,
        "sw_long": 0,
        "zoom_value": 0,
        "place_type": PLACE_TYPE,
        "price_min": 0,
        "price_max": 0,
        "amenities": [],
        "free_cancellation": False,
        "adults": 0,
        "children": 0,
        "infants": 0,
        "min_bedrooms": 0,
        "min_beds": 0,
        "min_bathrooms": 0,
    }
    while pages < max_pages:
        raw = airbnb_search.get(api_key=api_key, cursor=cursor, timeout=DEFAULT_TIMEOUT, **call)
        raws.append(raw)
        pages += 1
        pagination = get_nested_value(
            raw, "data.presentation.staysSearch.results.paginationInfo", {}
        ) or {}
        nxt = next_search_cursor(pagination if isinstance(pagination, dict) else {}, cursor)
        stays = listings_from_raw(raw)
        if not stays or not nxt:
            break
        cursor = nxt
    return raws, pages


def run_search(params: dict[str, Any]) -> dict[str, Any]:
    check_in = params.get("checkIn") or params.get("checkin")
    check_out = params.get("checkOut") or params.get("checkout")
    adults = params.get("adults") or params.get("guests")
    min_bedrooms = params.get("bedrooms") or params.get("min_bedrooms")
    max_pages = int(params.get("maxPages") or params.get("scrollCount") or MAX_PAGES)
    max_pages = max(1, min(MAX_PAGES, max_pages))
    url = build_search_url(params)
    proxy_url = str(params.get("proxy_url") or _proxy())
    sink = io.StringIO()
    started = time.perf_counter()
    try:
        with contextlib.redirect_stdout(sink):
            raws, pages = _search_pages(url, proxy_url, max_pages)
    except Exception as err:
        return {"ok": False, "error": f"pyairbnb: {err}", "url": url, "attempts": 1}
    ms_search = int((time.perf_counter() - started) * 1000)

    listings: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raws:
        for row in listings_from_raw(
            raw,
            check_in=str(check_in) if check_in else None,
            check_out=str(check_out) if check_out else None,
            adults=int(adults) if adults else None,
            min_guests=int(adults) if adults else None,
            min_bedrooms=int(min_bedrooms) if min_bedrooms else None,
        ):
            if row["id"] in seen:
                continue
            seen.add(row["id"])
            listings.append(row)
    listings.sort(key=lambda r: r["total"])
    if not listings:
        return {
            "ok": False,
            "error": "pyairbnb: aucune annonce avec total de séjour",
            "url": url,
            "attempts": 1,
        }
    enriched = 0
    ms_enrich = 0
    try:
        enrich_started = time.perf_counter()
        listings, enriched = enrich_listings(
            listings,
            check_in=str(check_in) if check_in else None,
            check_out=str(check_out) if check_out else None,
            adults=int(adults) if adults else None,
            proxy_url=proxy_url,
            min_guests=int(adults) if adults else None,
        )
        ms_enrich = int((time.perf_counter() - enrich_started) * 1000)
        listings.sort(key=lambda r: r["total"])
    except Exception:
        enriched = 0
    if not listings:
        return {
            "ok": False,
            "error": "pyairbnb: aucune annonce avec total de séjour",
            "url": url,
            "attempts": 1,
        }
    payload = {
        "source": "airbnb",
        "destination": params.get("city") or params.get("destination"),
        "checkIn": check_in,
        "checkOut": check_out,
        "listings": [
            {k: v for k, v in row.items() if k != "total" and v is not None} for row in listings
        ],
    }
    return {
        "ok": True,
        "payload": payload,
        "url": url,
        "count": len(listings),
        "attempts": 1,
        "via": "pyairbnb+stl" if enriched else "pyairbnb",
        "pagesFetched": pages,
        "advertised": None,
        "isolated": True,
        "stlEnriched": enriched,
        "msSearch": ms_search,
        "msQuote": ms_enrich,
    }


# Réexport pour que le sidecar puisse `from stays import run_search, pyairbnb`.
__all__ = ["run_search", "build_search_url", "bounds_from_point", "pyairbnb"]
