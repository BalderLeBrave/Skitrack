"""Mappage hermétique StaySearchResult → clip Skitrack.

Aucune requête. On ne retient qu’un total de séjour publié (jamais une nuit,
jamais « à partir de »). Logement entier seulement.
"""

from __future__ import annotations

import re
from typing import Any

NIGHTLY = re.compile(r"/\s*nuit|par\s+nuit|nightly|per\s+night", re.I)
FROM_PRICE = re.compile(r"(?:à|a)\s+partir\s+de", re.I)
STAY_MARK = re.compile(r"au\s+total|pour\s+\d+\s+nuits?|total\s+(?:price|stay)", re.I)
PRIVATE = re.compile(
    r"chambre d[' ]?hotes|maison d[' ]?hotes|private[ _-]?room|chambre privee|"
    r"shared[ _-]?room|chambre partage|bed[- ]and[- ]breakfast|hotel_room|"
    r"chambre d[' ]?hotel",
    re.I,
)
HOTEL_TILE = re.compile(r"^h[oô]tels?\b", re.I)
ENTIRE = re.compile(r"appartement|chalet|maison|logement entier|entire", re.I)
GUESTS_RE = re.compile(
    r"(\d+)\s*(?:[-–]\s*(\d+))?\s*(?:personnes?|pers\.?|voyageurs?|guests?|pax|couchages?)\b",
    re.I,
)
BEDROOMS_RE = re.compile(r"(\d+)\s*(?:chambres?|bedrooms?|ch\b)", re.I)


def _plausible_point(lat: Any, lon: Any) -> bool:
    """Un couple utilisable. `(0, 0)` n'est jamais un logement."""
    if isinstance(lat, bool) or isinstance(lon, bool):
        return False
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return False
    if lat != lat or lon != lon:
        return False
    if not (-90.0 <= float(lat) <= 90.0 and -180.0 <= float(lon) <= 180.0):
        return False
    return not (float(lat) == 0.0 and float(lon) == 0.0)


def _fold(text: str) -> str:
    import unicodedata

    return "".join(
        c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn"
    )


def is_dropped_listing(text: str | None) -> bool:
    if not text or not str(text).strip():
        return False
    t = _fold(str(text))
    if PRIVATE.search(t):
        return True
    if HOTEL_TILE.search(t) and not ENTIRE.search(t):
        return True
    return False


def parse_amount(token: str) -> float | None:
    raw = token.replace("\u00a0", "").replace("\u202f", "").replace(" ", "")
    last_comma = raw.rfind(",")
    last_dot = raw.rfind(".")
    if last_comma > last_dot:
        raw = raw.replace(".", "").replace(",", ".")
    elif last_dot > last_comma:
        raw = raw.replace(",", "")
    try:
        n = float(raw)
    except ValueError:
        return None
    if n <= 0 or n > 1_000_000:
        return None
    return n


def stay_total_from_label(label: str | None) -> float | None:
    if not label:
        return None
    if FROM_PRICE.search(label):
        return None
    if NIGHTLY.search(label) and not STAY_MARK.search(label):
        return None
    stay = (
        re.search(r"(\d[\d\u00a0\u202f .,]*)\s*(?:€|&euro;)?\s*au\s+total", label, re.I)
        or re.search(r"(\d[\d\u00a0\u202f .,]*)\s*(?:€|&euro;)?\s*pour\s+\d+\s+nuits?", label, re.I)
        or re.search(r"total[^0-9]{0,16}(\d[\d\u00a0\u202f .,]*)", label, re.I)
    )
    if not stay:
        return None
    return parse_amount(stay.group(1))


def _walk_labels(node: Any, out: list[str]) -> None:
    if node is None or not isinstance(node, (dict, list)):
        return
    if isinstance(node, list):
        for item in node:
            _walk_labels(item, out)
        return
    label = node.get("accessibilityLabel")
    if isinstance(label, str) and "€" in label:
        out.append(label)
    for value in node.values():
        _walk_labels(value, out)


def price_label_of(node: Any) -> str | None:
    labels: list[str] = []
    _walk_labels(node, labels)
    for label in labels:
        if STAY_MARK.search(label):
            return label
    for label in labels:
        if not FROM_PRICE.search(label) and not NIGHTLY.search(label):
            return label
    return None


def occupancy_from_text(*texts: str | None) -> tuple[int | None, int | None]:
    blob = " · ".join(t for t in texts if t and t.strip())
    if not blob:
        return None, None
    guests = bedrooms = None
    pers = GUESTS_RE.search(blob)
    if pers:
        a = int(pers.group(1))
        b = int(pers.group(2)) if pers.group(2) else a
        n = max(a, b)
        if 0 < n <= 50:
            guests = n
    ch = BEDROOMS_RE.search(blob)
    if ch:
        n = int(ch.group(1))
        if 0 < n <= 50:
            bedrooms = n
    return guests, bedrooms


def occupancy_from_stay(record: dict[str, Any]) -> tuple[int | None, int | None]:
    guests = bedrooms = None

    def take(n: Any) -> int | None:
        return n if isinstance(n, int) and 0 < n <= 50 else None

    def walk(value: Any, depth: int) -> None:
        nonlocal guests, bedrooms
        if depth > 8 or value is None or not isinstance(value, (dict, list)):
            return
        if isinstance(value, list):
            for item in value:
                walk(item, depth + 1)
            return
        for key, val in value.items():
            k = key.lower()
            if guests is None and k in ("personcapacity", "guestcapacity", "maxguestcapacity"):
                guests = take(val)
            if bedrooms is None and k in (
                "bedroomcount",
                "bedrooms",
                "numberofbedrooms",
                "bedroomscount",
            ):
                bedrooms = take(val)
            walk(val, depth + 1)

    walk(record, 0)
    t_g, t_b = occupancy_from_text(
        record.get("title") if isinstance(record.get("title"), str) else None,
        record.get("subtitle") if isinstance(record.get("subtitle"), str) else None,
    )
    if guests is None:
        guests = t_g
    if bedrooms is None:
        bedrooms = t_b
    return guests, bedrooms


def decode_listing_id(encoded: Any) -> str:
    if isinstance(encoded, int) and encoded > 0:
        return str(encoded)
    if not isinstance(encoded, str) or not encoded:
        return ""
    if encoded.isdigit():
        return encoded
    import base64

    try:
        decoded = base64.b64decode(encoded).decode("utf-8")
    except Exception:
        return ""
    colon = decoded.rfind(":")
    tail = decoded[colon + 1 :] if colon >= 0 else decoded
    return tail if tail.isdigit() else ""


def first_photo(record: dict[str, Any]) -> str | None:
    pics = record.get("contextualPictures")
    if isinstance(pics, list) and pics:
        pic = pics[0]
        if isinstance(pic, dict) and isinstance(pic.get("picture"), str):
            return pic["picture"]
    return None


def _nested_name(node: Any) -> str:
    if isinstance(node, str) and node.strip():
        return node.strip()
    if isinstance(node, dict):
        for key in ("localizedStringWithTranslationPreference", "localizedString", "full", "name"):
            val = node.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
            if isinstance(val, dict):
                found = _nested_name(val)
                if found:
                    return found
    return ""


def listing_name(record: dict[str, Any]) -> str:
    for candidate in (
        record.get("title"),
        record.get("name"),
        record.get("nameLocalized"),
        record.get("subtitle"),
    ):
        found = _nested_name(candidate)
        if found:
            return found
    demand = record.get("demandStayListing") if isinstance(record.get("demandStayListing"), dict) else {}
    desc = demand.get("description") if isinstance(demand.get("description"), dict) else {}
    return _nested_name(desc.get("name"))


def structured_lines(record: dict[str, Any]) -> list[str]:
    lines: list[str] = []

    def walk(value: Any, depth: int) -> None:
        if depth > 6 or value is None:
            return
        if isinstance(value, list):
            for item in value:
                walk(item, depth + 1)
            return
        if not isinstance(value, dict):
            return
        body = value.get("body")
        if isinstance(body, str) and body.strip():
            lines.append(body.strip())
        for item in value.values():
            walk(item, depth + 1)

    walk(record.get("structuredContent"), 0)
    return lines


def stay_to_listing(
    record: dict[str, Any],
    *,
    check_in: str | None,
    check_out: str | None,
    adults: int | None,
) -> dict[str, Any] | None:
    if record.get("__typename") != "StaySearchResult":
        return None
    demand = record.get("demandStayListing") if isinstance(record.get("demandStayListing"), dict) else {}
    listing_id = decode_listing_id(demand.get("id")) or decode_listing_id(record.get("propertyId"))
    name = listing_name(record)
    title = record.get("title") if isinstance(record.get("title"), str) else ""
    subtitle = record.get("subtitle") if isinstance(record.get("subtitle"), str) else ""
    if not listing_id or not name:
        return None
    if is_dropped_listing(name) or is_dropped_listing(title) or is_dropped_listing(subtitle):
        return None
    label = price_label_of(record.get("structuredDisplayPrice"))
    total = stay_total_from_label(label)
    if total is None:
        return None
    guests, bedrooms = occupancy_from_stay(record)
    extra_g, extra_b = occupancy_from_text(name, *structured_lines(record))
    if guests is None:
        guests = extra_g
    if bedrooms is None:
        bedrooms = extra_b
    loc = demand.get("location") if isinstance(demand.get("location"), dict) else {}
    coord = loc.get("coordinate") if isinstance(loc.get("coordinate"), dict) else {}
    lat = coord.get("latitude") if isinstance(coord.get("latitude"), (int, float)) else None
    lon = coord.get("longitude") if isinstance(coord.get("longitude"), (int, float)) else None
    if not _plausible_point(lat, lon):
        lat, lon = None, None
    url = f"https://www.airbnb.fr/rooms/{listing_id}"
    if check_in:
        url += f"?check_in={check_in}"
        if check_out:
            url += f"&check_out={check_out}"
        if adults:
            url += f"&adults={adults}"
    return {
        "id": listing_id,
        "name": name,
        "subtitle": subtitle or None,
        "priceLabel": f"{int(round(total))} € au total",
        "lat": lat,
        "lon": lon,
        "image": first_photo(record),
        "url": url,
        "guests": guests,
        "bedrooms": bedrooms,
        "total": int(round(total)),
    }


def collect_stays(root: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    def walk(value: Any) -> None:
        if value is None:
            return
        if isinstance(value, list):
            for item in value:
                walk(item)
            return
        if not isinstance(value, dict):
            return
        if value.get("__typename") == "StaySearchResult":
            out.append(value)
            return
        for item in value.values():
            walk(item)

    walk(root)
    return out


def listings_from_raw(
    raw: Any,
    *,
    check_in: str | None = None,
    check_out: str | None = None,
    adults: int | None = None,
    min_guests: int | None = None,
    min_bedrooms: int | None = None,
) -> list[dict[str, Any]]:
    seen: set[str] = set()
    listings: list[dict[str, Any]] = []
    for stay in collect_stays(raw):
        row = stay_to_listing(stay, check_in=check_in, check_out=check_out, adults=adults)
        if row is None or row["id"] in seen:
            continue
        if min_guests and row.get("guests") is not None and row["guests"] < min_guests:
            continue
        if min_bedrooms and row.get("bedrooms") is not None and row["bedrooms"] < min_bedrooms:
            continue
        seen.add(row["id"])
        listings.append(row)
    listings.sort(key=lambda r: r["total"])
    return listings
