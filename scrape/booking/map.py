"""Cartes Booking → clips Skitrack. Aucune requête.

Sélecteurs 2026 (data-testid=property-card) + héritage actor
(.sr_property_block, .sr-hotel__name). Total de séjour seulement.
GPS : Apollo / atlas-latlng / JSON — jamais inventé.
"""

from __future__ import annotations

import json
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
ENTIRE = re.compile(r"appartement|chalet|maison|villa|logement entier|entire|g[iî]te", re.I)
HOTEL_TYPE = re.compile(r"h[oô]tel|hostel|auberge", re.I)
ATLAS_RE = re.compile(
    r'data-atlas-latlng="\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*"',
    re.I,
)
HOTEL_ATLAS_RE = re.compile(
    r'data-hotel-id="(\d+)"[^>]{0,600}data-(?:atlas-latlng|coords)="\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*"',
    re.I,
)
ATLAS_HOTEL_RE = re.compile(
    r'data-(?:atlas-latlng|coords)="\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*"[^>]{0,600}data-hotel-id="(\d+)"',
    re.I,
)
ID_LAT_RE = re.compile(
    r'(?:hotel_id|hotelId|propertyId|"id")\s*"?\s*[:=]\s*"?(\d{4,})"?[\s\S]{0,280}?'
    r'"latitude"\s*:\s*(-?\d+\.\d+)[\s\S]{0,80}?"longitude"\s*:\s*(-?\d+\.\d+)',
    re.I,
)
GEO_LD_RE = re.compile(
    r'"geo"\s*:\s*\{[^}]{0,240}"latitude"\s*:\s*"?(-?\d+\.\d+)"?[^}]{0,80}"longitude"\s*:\s*"?(-?\d+\.\d+)"?',
    re.I,
)
BMAP_RE = re.compile(
    r'b_map_center_latitude["\'\s:=]+(-?\d+\.\d+)[\s\S]{0,160}b_map_center_longitude["\'\s:=]+(-?\d+\.\d+)',
    re.I,
)


def _fold(text: str) -> str:
    import unicodedata

    return "".join(
        c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn"
    )


def is_dropped_listing(*texts: str | None) -> bool:
    blob = " ".join(t for t in texts if t and str(t).strip())
    if not blob:
        return False
    t = _fold(blob)
    if PRIVATE.search(t):
        return True
    if HOTEL_TILE.search(t) and not ENTIRE.search(t):
        return True
    if HOTEL_TYPE.search(t) and not ENTIRE.search(t):
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
    hit = (
        re.search(r"(\d[\d\u00a0\u202f .,]*)\s*(?:€|&euro;)", label)
        or re.search(r"(?:€|&euro;)\s*(\d[\d\u00a0\u202f .,]*)", label)
    )
    if not hit:
        return None
    return parse_amount(hit.group(1))


def occupancy_from_text(*texts: str | None) -> tuple[int | None, int | None]:
    blob = " · ".join(t for t in texts if t and str(t).strip())
    guests = bedrooms = None
    pers = re.search(
        r"(\d+)\s*(?:personnes?|pers\.?|voyageurs?|guests?|pax|couchages?)\b", blob, re.I
    )
    if pers:
        n = int(pers.group(1))
        if 0 < n <= 50:
            guests = n
    chb = re.search(r"(\d+)\s*(?:chambres?|bedrooms?)\b", blob, re.I)
    if chb:
        n = int(chb.group(1))
        if 0 < n <= 30:
            bedrooms = n
    return guests, bedrooms


def _attr(node: Any, name: str) -> str:
    if node is None:
        return ""
    val = node.get(name) if hasattr(node, "get") else None
    return val.strip() if isinstance(val, str) else ""


def _text(node: Any) -> str:
    if node is None:
        return ""
    return " ".join(node.get_text(" ", strip=True).split()) if hasattr(node, "get_text") else ""


def _plausible(lat: Any, lon: Any) -> bool:
    if isinstance(lat, bool) or isinstance(lon, bool):
        return False
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return False
    if lat != lat or lon != lon:
        return False
    if not (-90.0 <= float(lat) <= 90.0 and -180.0 <= float(lon) <= 180.0):
        return False
    return not (float(lat) == 0.0 and float(lon) == 0.0)


def _store_coord(out: dict[str, dict[str, Any]], key: Any, lat: Any, lon: Any) -> None:
    if key is None:
        return
    label = str(key).strip()
    if not label or label in ("0", "None"):
        return
    if not _plausible(lat, lon):
        return
    slot = out.setdefault(label, {})
    slot["lat"] = float(lat)
    slot["lon"] = float(lon)


def harvest_places(node: Any, out: dict[str, dict[str, Any]]) -> None:
    if node is None:
        return
    if isinstance(node, list):
        for item in node:
            harvest_places(item, out)
        return
    if not isinstance(node, dict):
        return
    page = node.get("pageName")
    hid = node.get("id") or node.get("hotelId") or node.get("propertyId")
    loc = node.get("location") if isinstance(node.get("location"), dict) else None
    lat = lon = None
    if loc:
        lat, lon = loc.get("latitude"), loc.get("longitude")
    if not _plausible(lat, lon):
        lat = node.get("latitude") if lat is None else lat
        lon = node.get("longitude") if lon is None else lon
    if not _plausible(lat, lon):
        lat = node.get("lat") if lat is None else lat
        lon = node.get("lng") or node.get("lon") or lon
    if _plausible(lat, lon):
        if isinstance(page, str) and page:
            _store_coord(out, page, lat, lon)
        _store_coord(out, hid, lat, lon)
    if isinstance(page, str) and page:
        slot = out.setdefault(page, {})
        occu = node.get("occupancy") if isinstance(node.get("occupancy"), dict) else {}
        max_p = occu.get("maxPersons") or occu.get("maxGuests") or node.get("maxPersons")
        if isinstance(max_p, int) and 0 < max_p <= 50:
            slot["guests"] = max_p
        br = node.get("numberOfBedrooms") or node.get("bedroomCount") or node.get("bedrooms")
        if isinstance(br, int) and 0 < br <= 30:
            slot["bedrooms"] = br
        for key in ("accommodationTypeName", "propertyType", "accType"):
            t = node.get(key)
            if isinstance(t, str) and len(t.strip()) > 1:
                slot["type"] = t.strip()
                break
        if hid is not None and str(hid) not in out:
            out[str(hid)] = slot
    for value in node.values():
        harvest_places(value, out)


def apollo_index(html: str) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for m in re.finditer(
        r'<script[^>]+data-capla-store-data="apollo"[^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    ):
        try:
            harvest_places(json.loads(m.group(1)), out)
        except json.JSONDecodeError:
            continue
    for m in re.finditer(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', html, re.I | re.S):
        raw = m.group(1).strip()
        if len(raw) < 20 or raw[0] not in "{[":
            continue
        try:
            harvest_places(json.loads(raw), out)
        except json.JSONDecodeError:
            continue
    return out


def coords_from_html(html: str) -> dict[str, tuple[float, float]]:
    out: dict[str, tuple[float, float]] = {}
    for key, slot in apollo_index(html).items():
        if _plausible(slot.get("lat"), slot.get("lon")):
            out[key] = (float(slot["lat"]), float(slot["lon"]))
    for m in HOTEL_ATLAS_RE.finditer(html):
        lat, lon = float(m.group(2)), float(m.group(3))
        if _plausible(lat, lon):
            out[m.group(1)] = (lat, lon)
    for m in ATLAS_HOTEL_RE.finditer(html):
        lat, lon = float(m.group(1)), float(m.group(2))
        if _plausible(lat, lon):
            out[m.group(3)] = (lat, lon)
    for m in ID_LAT_RE.finditer(html):
        lat, lon = float(m.group(2)), float(m.group(3))
        if _plausible(lat, lon):
            out[m.group(1)] = (lat, lon)
    for m in re.finditer(
        r'"id"\s*:\s*"?(\d{4,})"?[^\{]{0,80}\{[^}]{0,180}"latitude"\s*:\s*(-?\d+\.\d+)[^}]{0,80}"longitude"\s*:\s*(-?\d+\.\d+)',
        html,
    ):
        lat, lon = float(m.group(2)), float(m.group(3))
        if _plausible(lat, lon):
            out[m.group(1)] = (lat, lon)
    return out


def coords_from_hotel_html(html: str) -> tuple[float, float] | None:
    if not html:
        return None
    m = ATLAS_RE.search(html)
    if m:
        lat, lon = float(m.group(1)), float(m.group(2))
        if _plausible(lat, lon):
            return lat, lon
    m = GEO_LD_RE.search(html)
    if m:
        lat, lon = float(m.group(1)), float(m.group(2))
        if _plausible(lat, lon):
            return lat, lon
    m = BMAP_RE.search(html)
    if m:
        lat, lon = float(m.group(1)), float(m.group(2))
        if _plausible(lat, lon):
            return lat, lon
    harvested = coords_from_html(html)
    for pair in harvested.values():
        if _plausible(pair[0], pair[1]):
            return pair
    return None


def listings_from_html(
    html: str,
    *,
    check_in: str | None = None,
    check_out: str | None = None,
    adults: int | None = None,
    min_guests: int | None = None,
    min_bedrooms: int | None = None,
) -> list[dict[str, Any]]:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select('[data-testid="property-card"], [data-testid="property-card-container"]')
    if not cards:
        cards = soup.select(".sr_property_block.sr_item, div.sr_item_content, #hotellist_inner div.sr_item")
    apollo = apollo_index(html)
    coords = coords_from_html(html)
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for card in cards:
        link = card.select_one('a[href*="/hotel/"]')
        href = _attr(link, "href") if link else ""
        if "/hotel/" not in href:
            continue
        if href.startswith("//"):
            href = "https:" + href
        elif href.startswith("/"):
            href = "https://www.booking.com" + href
        href = href.split("?")[0]
        slug = None
        m = re.search(r"/hotel/[a-z]{2}/([^./?#]+)", href, re.I)
        if m:
            slug = m.group(1)
        source_id = _attr(card, "data-hotel-id") or slug or href
        if source_id in seen:
            continue
        title_el = card.select_one(
            '[data-testid="title"], [data-testid="property-card-title"], .sr-hotel__name'
        )
        name = _text(title_el) or _text(link)
        if not name or len(name) < 2:
            continue
        units = _text(card.select_one('[data-testid="recommended-units"]')) or _text(card)
        extra = apollo.get(str(source_id), {}) or apollo.get(slug or "", {})
        pin = coords.get(str(source_id)) or (coords.get(slug) if slug else None)
        lat_attr = _attr(card, "data-latitude") or _attr(card, "data-lat")
        lon_attr = _attr(card, "data-longitude") or _attr(card, "data-lng") or _attr(card, "data-lon")
        atlas = _attr(card, "data-atlas-latlng") or _attr(card, "data-coords")
        lat = extra.get("lat")
        lon = extra.get("lon")
        if pin:
            lat, lon = pin
        if atlas and "," in atlas:
            try:
                a, b = atlas.split(",", 1)
                cand_lat, cand_lon = float(a), float(b)
                if _plausible(cand_lat, cand_lon):
                    lat, lon = cand_lat, cand_lon
            except ValueError:
                pass
        try:
            if not _plausible(lat, lon) and lat_attr:
                lat = float(lat_attr)
            if not _plausible(lat, lon) and lon_attr:
                lon = float(lon_attr)
        except ValueError:
            pass
        if not _plausible(lat, lon):
            lat = lon = None
        property_type = extra.get("type")
        if is_dropped_listing(name, units, property_type):
            continue
        price_el = card.select_one(
            '[data-testid="price-and-discounted-price"], [data-testid="price"], '
            ".bui-price-display__value, .totalPrice, strong.price"
        )
        label = _text(price_el)
        total = stay_total_from_label(label)
        if total is None:
            continue
        guests, bedrooms = occupancy_from_text(name, units)
        if guests is None:
            guests = extra.get("guests")
        if bedrooms is None:
            bedrooms = extra.get("bedrooms")
        if min_guests and isinstance(guests, int) and guests > 0 and guests < min_guests:
            continue
        if min_bedrooms and isinstance(bedrooms, int) and bedrooms > 0 and bedrooms < min_bedrooms:
            continue
        img = card.select_one('[data-testid="image"], img')
        image = _attr(img, "src") or _attr(img, "data-src")
        url = href
        if check_in:
            url += f"?checkin={check_in}"
            if check_out:
                url += f"&checkout={check_out}"
            if adults:
                url += f"&group_adults={int(adults)}"
        seen.add(source_id)
        out.append(
            {
                "source": "booking-web",
                "sourceId": source_id,
                "title": name,
                "url": url,
                "totalPrice": int(round(total)),
                "currency": "EUR",
                "images": [image] if image and image.startswith("http") else [],
                "latitude": lat if isinstance(lat, (int, float)) else None,
                "longitude": lon if isinstance(lon, (int, float)) else None,
                "guests": guests,
                "bedrooms": bedrooms,
                "propertyType": property_type,
                "priceConfidence": "total_confirmed",
                "availabilityStatus": "available",
            }
        )
    return out
