"""Occupancy extraite d’une fiche STL/PDP Airbnb. Aucune requête.

personCapacity et roomType viennent de merlin.pdpSections.metadata
(loggingContext / sharingConfig), comme stl-scraper.
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


def occupancy_from_pdp(raw: Any) -> dict[str, Any]:
    merlin = _nested(raw, "data.merlin.pdpSections") or {}
    log = _nested(merlin, "metadata.loggingContext.eventDataLogging") or {}
    share = _nested(merlin, "metadata.sharingConfig") or {}
    prefetch = _nested(merlin, "metadata.bookingPrefetchData") or {}

    def take_int(value: Any) -> int | None:
        if isinstance(value, bool):
            return None
        if isinstance(value, int) and 0 < value <= 50:
            return value
        if isinstance(value, str) and value.isdigit():
            n = int(value)
            return n if 0 < n <= 50 else None
        return None

    guests = take_int(log.get("personCapacity")) or take_int(share.get("personCapacity"))
    room_type = None
    for candidate in (log.get("roomType"), share.get("roomType"), prefetch.get("roomType")):
        if isinstance(candidate, str) and candidate.strip():
            room_type = candidate.strip()
            break
    hotel = bool(prefetch.get("isHotelRatePlanEnabled")) if isinstance(prefetch, dict) else False
    dropped = hotel or is_dropped_listing(room_type)
    return {
        "guests": guests,
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
    if occ.get("room_type"):
        out["room_type"] = occ["room_type"]
    return out
