"""Occupancy extraite d’une fiche STL/PDP Airbnb. Aucune requête.

personCapacity, bedroomCount et listingLat viennent de
merlin.pdpSections.metadata (loggingContext / sharingConfig), comme stl-scraper.
"""

from __future__ import annotations

from typing import Any

from map import is_dropped_listing


def _nested(root: Any, path: str) -> Any:
    cur = root
    for key in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


def _take_int(value: Any, zero_ok: bool = False) -> int | None:
    lo = 0 if zero_ok else 1
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and lo <= value <= 50:
        return value
    if isinstance(value, str) and value.isdigit():
        n = int(value)
        return n if lo <= n <= 50 else None
    return None


def _take_coord(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        n = float(value)
        if n != n:
            return None
        return n
    if isinstance(value, str):
        try:
            n = float(value.replace(",", "."))
        except ValueError:
            return None
        return n
    return None


def _plausible(lat: float | None, lon: float | None) -> bool:
    if lat is None or lon is None:
        return False
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return False
    return not (lat == 0.0 and lon == 0.0)


def occupancy_from_pdp(raw: Any) -> dict[str, Any]:
    merlin = _nested(raw, "data.merlin.pdpSections") or {}
    log = _nested(merlin, "metadata.loggingContext.eventDataLogging") or {}
    share = _nested(merlin, "metadata.sharingConfig") or {}
    prefetch = _nested(merlin, "metadata.bookingPrefetchData") or {}

    guests = _take_int(log.get("personCapacity")) or _take_int(share.get("personCapacity"))
    bedrooms = _take_int(log.get("bedroomCount"), zero_ok=True)
    if bedrooms is None:
        bedrooms = _take_int(share.get("bedroomCount"), zero_ok=True)
    if bedrooms is None:
        bedrooms = _take_int(share.get("bedrooms"), zero_ok=True)
    lat = _take_coord(log.get("listingLat")) or _take_coord(share.get("listingLat"))
    lon = (
        _take_coord(log.get("listingLng"))
        or _take_coord(log.get("listingLon"))
        or _take_coord(share.get("listingLng"))
    )
    if not _plausible(lat, lon):
        lat = lon = None
    room_type = None
    for candidate in (log.get("roomType"), share.get("roomType"), prefetch.get("roomType")):
        if isinstance(candidate, str) and candidate.strip():
            room_type = candidate.strip()
            break
    hotel = bool(prefetch.get("isHotelRatePlanEnabled")) if isinstance(prefetch, dict) else False
    dropped = hotel or is_dropped_listing(room_type)
    return {
        "guests": guests,
        "bedrooms": bedrooms,
        "lat": lat,
        "lon": lon,
        "room_type": room_type,
        "hotel": hotel,
        "dropped": dropped,
    }


def merge_occupancy(listing: dict[str, Any], occ: dict[str, Any]) -> dict[str, Any] | None:
    if occ.get("dropped"):
        return None
    out = dict(listing)
    if out.get("guests") is None and occ.get("guests"):
        out["guests"] = occ["guests"]
    if out.get("bedrooms") is None and occ.get("bedrooms") is not None:
        out["bedrooms"] = occ["bedrooms"]
    if out.get("lat") is None and _plausible(occ.get("lat"), occ.get("lon")):
        out["lat"] = occ["lat"]
        out["lon"] = occ["lon"]
    if occ.get("room_type"):
        out["room_type"] = occ["room_type"]
    return out
