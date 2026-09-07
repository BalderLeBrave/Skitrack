"""Porte CozyCozy → atterrissage Booking. La sortie ne mentionne jamais CozyCozy.

Friction 2026, déjà mesurée :
- HTML CozyCozy daté = coquille SPA (0 carte). Le JSON est dans GET /api/getResultList
  après /api/launch (POST sans session = 500).
- Le deeplink n’est pas toujours un 302 : souvent `deeplinkUrl` déjà en
  `https://www.booking.com/hotel/…`. Sinon click tracker → 302 affilié → fiche Booking.
- On ne tape PAS la barre Booking (`ss=` sans dest_id = accueil).
"""

from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from typing import Any
from urllib.parse import parse_qs, urlparse, urlunparse

from map import occupancy_from_text

BOOKING_HOST = re.compile(r"(?:^|\.)booking\.com$", re.I)
TRACKING = (
    "aid",
    "label",
    "sid",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "clickedRef",
    "camref",
    "mpd",
    "mpe",
    "mpb",
    "mpa",
    "mpq",
    "dist",
    "keep_landing",
    "sb_lp",
)


def cozy_search_url(
    destination: str,
    check_in: str,
    check_out: str,
    *,
    adults: int = 8,
    children: int = 0,
    bedrooms: int = 0,
) -> str:
    n = destination.lower()
    if "2 alpes" in n or "deux alpes" in n:
        place = "Les Deux Alpes station de ski, France"
    elif re.search(r",\s*france\s*$", destination, re.I):
        place = destination.strip()
    else:
        place = f"{destination.strip()}, France"
    return (
        "https://www.cozycozy.com/fr/search/"
        f"{urllib.parse.quote(place)}/{check_in}/{check_out}/"
        f"{bedrooms}-{adults}-{children}/results"
    )


def is_booking_provider(code: str = "", name: str = "", url: str = "") -> bool:
    blob = f"{code} {name} {url}".lower()
    return "booking.com" in blob or bool(re.search(r"\bbooking\b", blob))


def extract_booking_url(raw: str) -> str | None:
    if not raw:
        return None
    m = re.search(r"destination:(https?://[^&\s]+)", raw, re.I)
    candidate = urllib.parse.unquote(m.group(1)) if m else raw.strip()
    m2 = re.search(r"https?://(?:www\.)?booking\.com/[^\s\"'<>]+", candidate, re.I)
    if m2:
        return m2.group(0)
    try:
        host = urlparse(candidate).hostname or ""
    except ValueError:
        return None
    if BOOKING_HOST.search(host.replace("www.", "")):
        return candidate
    return None


def canonical_booking_url(
    raw: str,
    *,
    check_in: str | None = None,
    check_out: str | None = None,
    adults: int | None = None,
    bedrooms: int | None = None,
) -> str | None:
    extracted = extract_booking_url(raw)
    if not extracted:
        return None
    try:
        u = urlparse(extracted)
    except ValueError:
        return None
    host = (u.hostname or "").replace("www.", "")
    if not BOOKING_HOST.search(host):
        return None
    q = parse_qs(u.query, keep_blank_values=True)
    for key in TRACKING:
        q.pop(key, None)
    if check_in:
        q["checkin"] = [check_in]
    if check_out:
        q["checkout"] = [check_out]
    if adults:
        q["group_adults"] = [str(int(adults))]
    rooms = bedrooms
    if rooms is None and q.get("no_rooms") and str(q["no_rooms"][0]).isdigit():
        rooms = int(q["no_rooms"][0])
    if rooms:
        q["no_rooms"] = [str(int(rooms))]
    q["selected_currency"] = ["EUR"]
    q["sb_price_type"] = ["total"]
    path = u.path or "/"
    if path.endswith(".en.html"):
        path = path.replace(".en.html", ".fr.html")
    return urlunparse(
        ("https", "www.booking.com", path, "", urllib.parse.urlencode({k: v[0] for k, v in q.items() if v}), "")
    )


def _photo(obj: dict[str, Any]) -> str | None:
    thumbs = obj.get("lightThumbnails") if isinstance(obj.get("lightThumbnails"), dict) else {}
    first = thumbs.get("firstUrls") if isinstance(thumbs, dict) else None
    if isinstance(first, list) and first and isinstance(first[0], str) and first[0].startswith("http"):
        return first[0]
    for key in ("photo", "image"):
        val = obj.get(key)
        if isinstance(val, str) and val.startswith("http"):
            return val
    return None


def _positive_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and value > 0:
        return int(value)
    return None


def _rating(score: Any) -> tuple[float | None, int | None]:
    if not isinstance(score, (int, float)) or score <= 0:
        return None, None
    n = float(score)
    if n > 10:
        return round(n / 10.0, 1), 10
    return round(n, 1), 10


def parse_booking_hits(payload: Any) -> list[dict[str, Any]]:
    """JSON getResultList/getResults → offres Booking (prix, chambres, pers., lieu, dispo)."""
    if not payload or not isinstance(payload, dict):
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    def emit(hit: dict[str, Any], parent: dict[str, Any] | None) -> None:
        if not is_booking_provider(
            str(hit.get("providerCode") or ""),
            str(hit.get("providerName") or hit.get("providerText") or ""),
            str(hit.get("deeplinkUrl") or ""),
        ):
            return
        price = hit.get("totalPrice") if isinstance(hit.get("totalPrice"), dict) else {}
        if price.get("indicative") is True:
            return
        stay = price.get("value") if isinstance(price, dict) else None
        if not isinstance(stay, (int, float)) or stay <= 0:
            stay = hit.get("eurPriceValue")
        if not isinstance(stay, (int, float)) or stay <= 0:
            return
        raw = parent if isinstance(parent, dict) else {}
        title = str(raw.get("name") or hit.get("name") or "").replace("\n", " ").strip()
        if not title:
            return
        details = raw.get("subTitleDetails") if isinstance(raw.get("subTitleDetails"), dict) else {}
        guests = _positive_int(details.get("guestCapacity"))
        bedrooms = _positive_int(details.get("bedRoomCount")) or _positive_int(hit.get("bedRoomCount"))
        beds = _positive_int(details.get("bedCount"))
        br, beds2, g2, _ = occupancy_from_text(
            str(raw.get("subTitle") or ""),
            str(hit.get("text") or ""),
            str(hit.get("shortText") or ""),
            title,
        )
        if guests is None:
            guests = g2
        if bedrooms is None:
            bedrooms = br
        if beds is None:
            beds = beds2
        check_in = str(hit.get("fromDate") or "")[:10] or None
        check_out = str(hit.get("toDate") or "")[:10] or None
        url = canonical_booking_url(
            str(hit.get("deeplinkUrl") or ""),
            check_in=check_in,
            check_out=check_out,
            adults=guests,
            bedrooms=bedrooms,
        )
        if not url:
            return
        sid = str(hit.get("externalId") or hit.get("accommodationId") or raw.get("accommodationId") or url)
        if sid in seen:
            return
        seen.add(sid)
        coords = raw.get("coordinates") if isinstance(raw.get("coordinates"), dict) else {}
        photo = _photo(raw) or _photo(hit)
        if photo and "cozycozy" in photo.lower():
            photo = None
        rating, scale = _rating(raw.get("ratingScore"))
        nightly = hit.get("eurPricePerNight")
        instant = hit.get("instantBooking")
        if not isinstance(instant, bool):
            instant = raw.get("instantBooking") if isinstance(raw.get("instantBooking"), bool) else None
        city = str(raw.get("cityName") or raw.get("locationText") or "").strip() or None
        location = str(raw.get("locationText") or "").strip() or city
        kind = str(raw.get("title") or "").strip() or None
        unit = str(hit.get("text") or "").strip() or None
        row: dict[str, Any] = {
            "source": "booking-web",
            "sourceId": sid,
            "title": title,
            "url": url,
            "totalPrice": round(float(stay), 2),
            "currency": str(price.get("currencyCode") or "EUR"),
            "priceConfidence": "total_confirmed",
            "availabilityStatus": "available",
        }
        if kind:
            row["propertyType"] = kind
        if unit:
            row["unitType"] = unit
        if guests:
            row["guests"] = guests
        if bedrooms:
            row["bedrooms"] = bedrooms
        if beds:
            row["beds"] = beds
        if city:
            row["city"] = city
        if location:
            row["location"] = location
        if isinstance(coords.get("latitude"), (int, float)):
            row["latitude"] = float(coords["latitude"])
        if isinstance(coords.get("longitude"), (int, float)):
            row["longitude"] = float(coords["longitude"])
        if photo:
            row["images"] = [photo]
        if check_in:
            row["checkIn"] = check_in
        if check_out:
            row["checkOut"] = check_out
        if rating is not None:
            row["rating"] = rating
            row["ratingScale"] = scale
        reviews = _positive_int(raw.get("ratingCount"))
        if reviews:
            row["reviewCount"] = reviews
        if isinstance(nightly, (int, float)) and nightly > 0:
            row["nightlyPrice"] = round(float(nightly), 2)
        if instant is not None:
            row["instantBooking"] = bool(instant)
        if raw.get("cancellationPolicy") is not None:
            row["cancellationPolicy"] = raw.get("cancellationPolicy")
        out.append(row)

    def walk(node: Any, parent: dict[str, Any] | None = None) -> None:
        if isinstance(node, dict):
            if node.get("deeplinkUrl") or node.get("providerCode"):
                emit(node, parent)
            for val in node.values():
                walk(val, node)
        elif isinstance(node, list):
            for val in node:
                walk(val, parent)

    walk(payload)
    return out


def _omkar_key() -> str:
    for name in ("OMKAR_BOOKING_KEY", "OMKAR_API_KEY", "OMKAR_AIRBNB_KEY"):
        val = (os.environ.get(name) or "").strip()
        if val:
            return val
    here = os.path.dirname(__file__)
    for rel in (os.path.join(here, ".env"), os.path.join(here, "..", "..", ".env")):
        try:
            text = open(rel, encoding="utf-8").read()
        except OSError:
            continue
        for line in text.splitlines():
            if line.startswith("OMKAR_BOOKING_KEY=") or line.startswith("OMKAR_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"')
    return ""


def mask_with_booking_details(row: dict[str, Any], timeout_s: float = 20) -> dict[str, Any]:
    """Complète la fiche via Omkar /hotels/details (prix Booking, photo bstatic)."""
    key = _omkar_key()
    url = row.get("url") or ""
    if not key or not url:
        return row
    params = {
        "query": url,
        "checkin": row.get("checkIn") or "",
        "checkout": row.get("checkOut") or "",
        "adults": str(row.get("guests") or 8),
        "rooms": str(row.get("bedrooms") or 1),
        "locale": "fr",
        "currency": "EUR",
    }
    api = "https://booking-scraper.omkar.cloud/booking/hotels/details?" + urllib.parse.urlencode(
        {k: v for k, v in params.items() if v}
    )
    req = urllib.request.Request(api, headers={"API-Key": key, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as res:
            data = json.loads(res.read().decode("utf-8"))
    except (OSError, json.JSONDecodeError, TimeoutError):
        return row
    if not isinstance(data, dict) or data.get("error"):
        return row
    out = dict(row)
    if data.get("name"):
        out["title"] = str(data["name"])
    if data.get("link"):
        cleaned = canonical_booking_url(
            str(data["link"]),
            check_in=out.get("checkIn"),
            check_out=out.get("checkOut"),
            adults=out.get("guests"),
            bedrooms=out.get("bedrooms"),
        )
        if cleaned:
            out["url"] = cleaned
    price = data.get("price") if isinstance(data.get("price"), dict) else {}
    total = price.get("total")
    if isinstance(total, (int, float)) and total > 0:
        out["totalPrice"] = round(float(total), 2)
        out["currency"] = str(price.get("currency") or out.get("currency") or "EUR")
    loc = data.get("location") if isinstance(data.get("location"), dict) else {}
    if isinstance(loc.get("latitude"), (int, float)):
        out["latitude"] = float(loc["latitude"])
    if isinstance(loc.get("longitude"), (int, float)):
        out["longitude"] = float(loc["longitude"])
    if loc.get("city"):
        out["city"] = str(loc["city"])
        out.setdefault("location", str(loc["city"]))
    img = data.get("image") or (data.get("photos") or [None])[0]
    if isinstance(img, str) and "cozycozy" not in img.lower():
        out["images"] = [img]
    if data.get("id") is not None:
        out["sourceId"] = str(data["id"])
    out["source"] = "booking-web"
    return out
