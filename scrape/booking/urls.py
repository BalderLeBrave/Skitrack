"""URL de recherche Booking — process dédié, pas le builder Node."""

from __future__ import annotations

from urllib.parse import urlencode

PAGE_SIZE = 25


def search_url(params: dict, offset: int = 0) -> str:
    dest = (
        params.get("destination")
        or params.get("city")
        or params.get("ss")
        or params.get("query")
        or ""
    )
    q: dict[str, str] = {
        "ss": str(params.get("ss") or dest),
        "group_adults": str(params.get("adults") or params.get("guests") or 2),
        "group_children": str(params.get("children") or 0),
        "no_rooms": "1",
        "selected_currency": "EUR",
        "sb_price_type": "total",
        "nflt": "privacy_type=3",
        "lang": "fr",
        "src": "searchresults" if offset > 0 else "index",
    }
    dest_id = params.get("dest_id")
    dest_type = params.get("dest_type")
    if dest_id and dest_type:
        q["dest_id"] = str(dest_id)
        q["dest_type"] = str(dest_type)
    ssne = params.get("ssne")
    if ssne:
        q["ssne"] = str(ssne)
        q["ssne_untouched"] = "1"
    check_in = params.get("checkIn") or params.get("checkin")
    check_out = params.get("checkOut") or params.get("checkout")
    if check_in:
        q["checkin"] = str(check_in)
    if check_out:
        q["checkout"] = str(check_out)
    if offset > 0:
        q["offset"] = str(offset)
    return "https://www.booking.com/searchresults.fr.html?" + urlencode(q)
