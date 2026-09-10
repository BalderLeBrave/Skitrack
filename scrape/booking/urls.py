"""URL Booking : BookingScraper + actor Apify, pas Playwright.

sb_price_type=total (BookingScraper) : total de séjour, pas la nuit.
offset (booking_scraper, 25/page). ht_id appartements/villas (actor).
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

PAGE_SIZE = 25
# actor-booking-scraper PROPERTY_TYPE_IDS : logements entiers, pas hôtels.
APARTMENT_IDS = ("201", "213", "220", "222")  # appartements, villas, holiday homes, homestays


def search_url(params: dict[str, Any], offset: int = 0) -> str:
    city = str(params.get("destination") or params.get("city") or params.get("ss") or "").strip()
    given = params.get("url")
    if isinstance(given, str) and given.startswith("http") and "booking.com" in given:
        return given
    query: list[tuple[str, str]] = [
        ("ss", city or "France"),
        ("lang", "fr"),
        ("selected_currency", "EUR"),
        ("changed_currency", "1"),
        ("sb_price_type", "total"),
        ("no_rooms", "1"),
        ("group_adults", str(int(params.get("adults") or params.get("guests") or 2))),
        ("group_children", str(int(params.get("children") or 0))),
    ]
    check_in = params.get("checkIn") or params.get("checkin") or params.get("datein")
    check_out = params.get("checkOut") or params.get("checkout") or params.get("dateout")
    if check_in:
        query.append(("checkin", str(check_in)))
    if check_out:
        query.append(("checkout", str(check_out)))
    nflt = ";".join(f"ht_id={hid}" for hid in APARTMENT_IDS)
    query.append(("nflt", nflt))
    if offset > 0:
        query.append(("offset", str(int(offset))))
    return "https://www.booking.com/searchresults.fr.html?" + urlencode(query)
