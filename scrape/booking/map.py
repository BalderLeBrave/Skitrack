"""HTML Booking → offres Skitrack.

Aucune requête. Total de séjour publié seulement (jamais une nuit, jamais
« à partir de »). Logement entier seulement. N’importe ni Gîtes ni Airbnb.
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

NIGHTLY = re.compile(r"/\s*nuit|par\s+nuit|nightly|per\s+night", re.I)
FROM_PRICE = re.compile(r"(?:à|a)\s+partir\s+de", re.I)
STAY_MARK = re.compile(r"au\s+total|pour\s+\d+\s+nuits?|total\s+(?:price|stay)|taxes\s+et\s+frais", re.I)
PRIVATE = re.compile(
    r"chambre d[' ]?hotes|maison d[' ]?hotes|private[ _-]?room|chambre privee|"
    r"shared[ _-]?room|chambre partage|bed[- ]and[- ]breakfast|hotel_room|"
    r"chambre d[' ]?hotel",
    re.I,
)
HOTEL_TILE = re.compile(r"^h[oô]tels?\b", re.I)
ENTIRE = re.compile(r"appartement|chalet|maison|logement entier|entire|villa|studio", re.I)
GUESTS_RE = re.compile(
    r"(\d+)\s*(?:[-–]\s*(\d+))?\s*(?:personnes?|pers\.?|voyageurs?|guests?|pax|couchages?)\b",
    re.I,
)
BEDROOMS_RE = re.compile(r"(\d+)\s*(?:chambres?|bedrooms?|ch\b)", re.I)
BEDS_RE = re.compile(r"(\d+)\s*lits?", re.I)
AREA_RE = re.compile(r"(\d+)\s*m(?:²|2)(?![0-9])", re.I)
BLOCKED = re.compile(
    r"unusual traffic|verify you are (?:a )?human|attention required|"
    r"checking your browser|just a moment|challenge-running|"
    r"cf-browser-verification|accès refusé|access denied|"
    r"confirmez que vous êtes humain|trafic inhabituel|are you a robot|"
    r"robot ou pas robot",
    re.I,
)
PRICE_RE = re.compile(r"(\d[\d\s\u00a0\u202f.,]*)\s*(?:€|&euro;|EUR)", re.I)
CARD_SPLIT = re.compile(
    r'(?=<div[^>]*(?:data-testid="(?:property-card(?:-container)?|sr-property-card)"|data-hotel-id=))',
    re.I,
)
HREF_RE = re.compile(r'href="(https?://[^"]+/hotel/[^"]+|[^"]+/hotel/[^"]+)"', re.I)
TITLE_RE = re.compile(
    r'data-testid="(?:title|property-card-title|header-title)"[^>]*>\s*([^<]{2,160})',
    re.I,
)
IMG_RE = re.compile(r'(?:src|data-src|data-lazy-src)="(https?://[^"]+)"', re.I)
HOTEL_ID_RE = re.compile(r'data-hotel-id="([^"]+)"', re.I)
UNITS_RE = re.compile(
    r'data-testid="(?:recommended-units|property-card-unit-configuration)"[^>]*>\s*([^<]{0,400})',
    re.I,
)
PRICE_TESTID_RE = re.compile(
    r'data-testid="(?:price-and-discounted-price|price|nights-and-price)"[^>]*>\s*([^<]{1,120})',
    re.I,
)
ADVERTISED_RE = re.compile(
    r"([\d][\d\s.,]{0,10})\s*(?:établissements?|logements?|hébergements?|r[ée]sultats?|properties|results)",
    re.I,
)
ADVERTISED_SUR = re.compile(r"sur\s+([\d][\d\s.,]{0,10})", re.I)


def _fold(text: str) -> str:
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
        or PRICE_RE.search(label)
        or re.search(r"(?:€|&euro;|EUR)\s*(\d[\d\s\u00a0\u202f.,]*)", label, re.I)
    )
    if not stay:
        return None
    return parse_amount(stay.group(1))


def looks_blocked(html: str, url: str = "") -> bool:
    if not html:
        return True
    head = html[:80_000]
    if BLOCKED.search(head):
        return True
    if "booking.com" in (url or "").lower() and "/searchresults" not in url and "challenge" in html.lower():
        return True
    has_cards = bool(re.search(r'data-testid="(?:property-card|sr-property-card)', html, re.I))
    has_apollo = "data-capla-store-data" in html and "pageName" in html
    if has_cards or has_apollo:
        return False
    path = (url or "").lower()
    if "booking.com" in path and ("/index" in path or path.rstrip("/").endswith("booking.com")):
        return False
    return len(html) < 12_000


def _textish(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(value, dict):
        for key in ("translation", "value", "text", "name"):
            t = value.get(key)
            if isinstance(t, str) and t.strip():
                return t.strip()
    return None


def _price_from_node(node: dict[str, Any]) -> tuple[float | None, str | None]:
    for key, val in node.items():
        k = str(key)
        if re.search(r"night|nuit|perNight|averagePrice", k, re.I):
            continue
        if isinstance(val, str) and "€" in val:
            total = stay_total_from_label(val)
            if total:
                return total, val
        if isinstance(val, dict):
            amt = val.get("amount") or val.get("value") or val.get("price")
            curr = str(val.get("currency") or val.get("currencyCode") or "")
            if isinstance(amt, (int, float)) and amt > 0 and curr.upper() in ("", "EUR", "€"):
                if re.search(r"night|nuit", k, re.I):
                    continue
                return float(amt), f"{amt} €"
    return None, None


def _walk_apollo(node: Any, positions: dict, occupancy: dict, props: dict) -> None:
    if node is None or not isinstance(node, (dict, list)):
        return
    if isinstance(node, list):
        for item in node:
            _walk_apollo(item, positions, occupancy, props)
        return
    page = node.get("pageName")
    loc = node.get("location") if isinstance(node.get("location"), dict) else None
    if isinstance(page, str):
        slot = props.get(page) or {}
        if loc and isinstance(loc.get("latitude"), (int, float)) and isinstance(loc.get("longitude"), (int, float)):
            lat, lon = float(loc["latitude"]), float(loc["longitude"])
            if lat or lon:
                positions[page] = {"lat": lat, "lon": lon}
                slot["lat"] = lat
                slot["lon"] = lon
        occu = node.get("occupancy") if isinstance(node.get("occupancy"), dict) else {}
        max_p = occu.get("maxPersons") or occu.get("maxGuests") or node.get("maxPersons") or node.get("numberOfGuests")
        if isinstance(max_p, (int, float)) and 0 < max_p <= 50:
            occupancy.setdefault(page, {})["guests"] = int(max_p)
            slot["guests"] = int(max_p)
        br = node.get("numberOfBedrooms") or node.get("bedroomCount") or node.get("bedrooms")
        if isinstance(br, (int, float)) and 0 < br <= 50:
            occupancy.setdefault(page, {})["bedrooms"] = int(br)
            slot["bedrooms"] = int(br)
        for key in ("accommodationTypeName", "propertyType", "accType"):
            t = node.get(key)
            if isinstance(t, str) and len(t.strip()) > 1:
                occupancy.setdefault(page, {})["type"] = t.strip()
                slot["type"] = t.strip()
        title = _textish(node.get("name")) or _textish(node.get("displayName")) or _textish(node.get("hotelName"))
        if title:
            slot["title"] = title
        total, label = _price_from_node(node)
        if total:
            slot["total"] = total
            slot["price_label"] = label
        hid = node.get("id") or node.get("hotelId") or node.get("propertyId")
        if isinstance(hid, (int, str)) and str(hid).strip():
            slot["id"] = str(hid)
        props[page] = slot
        occupancy[page] = occupancy.get(page) or {}
    for value in node.values():
        _walk_apollo(value, positions, occupancy, props)


def apollo_indexes(html: str) -> tuple[dict[str, dict], dict[str, dict], dict[str, dict]]:
    positions: dict[str, dict] = {}
    occupancy: dict[str, dict] = {}
    props: dict[str, dict] = {}
    for m in re.finditer(
        r'<script[^>]*data-capla-store-data="apollo"[^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    ):
        raw = m.group(1).strip()
        if not raw:
            continue
        try:
            _walk_apollo(json.loads(raw), positions, occupancy, props)
        except json.JSONDecodeError:
            continue
    return positions, occupancy, props


def occupancy_from_text(*texts: str | None) -> tuple[int | None, int | None, int | None, int | None]:
    blob = " · ".join(t for t in texts if t and t.strip())
    if not blob:
        return None, None, None, None

    def take(m: re.Match[str] | None, cap: int) -> int | None:
        if not m:
            return None
        n = int(m.group(1))
        return n if 0 < n <= cap else None

    guests = None
    pers = GUESTS_RE.search(blob)
    if pers:
        a = int(pers.group(1))
        b = int(pers.group(2)) if pers.group(2) else a
        n = max(a, b)
        if 0 < n <= 50:
            guests = n
    return (
        take(BEDROOMS_RE.search(blob), 50),
        take(BEDS_RE.search(blob), 50),
        guests,
        take(AREA_RE.search(blob), 2000),
    )


def advertised_count(html: str) -> int | None:
    head = html[:12_000].replace("\u00a0", " ")
    m = ADVERTISED_SUR.search(head) or ADVERTISED_RE.search(head)
    if not m:
        return None
    n = parse_amount(m.group(1))
    if n is None:
        digits = re.sub(r"[^\d]", "", m.group(1))
        n = float(digits) if digits else None
    if n is not None and 0 < n <= 50_000:
        return int(n)
    return None


def _clean_url(href: str, base: str = "https://www.booking.com") -> str | None:
    if not href:
        return None
    href = href.replace("&", "&")
    abs_url = urljoin(base, href)
    if "/hotel/" not in abs_url:
        return None
    parts = urlsplit(abs_url)
    path = parts.path.split("?")[0]
    return urlunsplit((parts.scheme or "https", parts.netloc or "www.booking.com", path, "", ""))


def stamp_stay(url: str, params: dict) -> str:
    try:
        parts = urlsplit(url)
    except ValueError:
        return url
    q = dict(parse_qsl(parts.query, keep_blank_values=True))
    check_in = params.get("checkIn") or params.get("checkin")
    check_out = params.get("checkOut") or params.get("checkout")
    adults = params.get("adults") or params.get("guests")
    if check_in:
        q["checkin"] = str(check_in)
    if check_out:
        q["checkout"] = str(check_out)
    if adults:
        q["group_adults"] = str(adults)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(q), ""))


def _slug(url: str) -> str | None:
    m = re.search(r"/hotel/[a-z]{2}/([^./?#]+)", url, re.I)
    return m.group(1) if m else None


def _source_id(chunk: str, url: str) -> str:
    hid = HOTEL_ID_RE.search(chunk)
    if hid:
        return hid.group(1)
    m = re.search(r"\.([a-z0-9]+)\.fr\.html", url, re.I) or re.search(r"/hotel/[^/]+/([^.]+)", url, re.I)
    return m.group(1) if m else url


def _photo(chunk: str) -> str | None:
    for m in IMG_RE.finditer(chunk):
        src = m.group(1)
        if re.search(r"placeholder|blank|spacer|1x1|pixel", src, re.I):
            continue
        if "bstatic.com" in src or "/xdata/images/" in src:
            return src.split("?")[0]
    return None


def _title(chunk: str) -> str | None:
    m = TITLE_RE.search(chunk)
    if m:
        t = re.sub(r"\s+", " ", m.group(1)).strip()
        return t if len(t) >= 2 else None
    return None


def listings_from_autoparse(
    body: dict[str, Any],
    *,
    url: str = "",
    check_in: str | None = None,
    check_out: str | None = None,
    adults: int | None = None,
    min_guests: int | None = None,
    min_bedrooms: int | None = None,
    page_index: int = 1,
    engine: str = "crawlbase",
) -> list[dict[str, Any]]:
    """JSON Crawlbase autoparse → mêmes offres que le HTML (total de séjour)."""
    props = body.get("properties") if isinstance(body, dict) else None
    if not isinstance(props, list):
        return []
    params = {"checkIn": check_in, "checkOut": check_out, "adults": adults}
    if url:
        q = dict(parse_qsl(urlsplit(url).query, keep_blank_values=True))
        params["checkIn"] = params["checkIn"] or q.get("checkin")
        params["checkOut"] = params["checkOut"] or q.get("checkout")
        if not params["adults"] and q.get("group_adults"):
            try:
                params["adults"] = int(q["group_adults"])
            except ValueError:
                pass
        min_guests = min_guests or params.get("adults")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    advertised = body.get("propertyCount")
    try:
        advertised_n = int(advertised) if advertised is not None else None
    except (TypeError, ValueError):
        advertised_n = None
    if advertised_n is not None and advertised_n <= len(props):
        advertised_n = None
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    rank = 0
    for item in props:
        if not isinstance(item, dict):
            continue
        title = str(item.get("name") or item.get("title") or "").strip()
        href = str(item.get("url") or item.get("link") or "")
        clean = _clean_url(href)
        if not title or not clean:
            continue
        if is_dropped_listing(title):
            continue
        label = str(item.get("price") or "")
        amount = item.get("priceAmount")
        total = stay_total_from_label(label)
        if total is None and isinstance(amount, (int, float)) and amount > 0:
            if FROM_PRICE.search(label or "") or NIGHTLY.search(label or ""):
                continue
            total = float(amount)
        if total is None:
            continue
        br, beds, guests, area = occupancy_from_text(title, str(item.get("address") or ""))
        if min_guests and guests is not None and guests < int(min_guests):
            continue
        if min_bedrooms and br is not None and br < int(min_bedrooms):
            continue
        sid = _source_id("", clean)
        if sid in seen:
            continue
        seen.add(sid)
        rank += 1
        photo = item.get("image")
        row: dict[str, Any] = {
            "source": "booking-web",
            "sourceId": sid,
            "title": title,
            "url": stamp_stay(clean, params),
            "totalPrice": total,
            "currency": "EUR",
            "priceConfidence": "total_confirmed",
            "availabilityStatus": "available",
            "retrievedAt": now,
            "searchPageIndex": page_index,
            "searchRank": rank,
            "engine": engine,
        }
        if params.get("checkIn"):
            row["checkIn"] = params["checkIn"]
        if params.get("checkOut"):
            row["checkOut"] = params["checkOut"]
        if br:
            row["bedrooms"] = br
        if beds:
            row["beds"] = beds
        if guests:
            row["guests"] = guests
        if area:
            row["areaSqm"] = area
        if isinstance(photo, str) and photo.startswith("http"):
            row["images"] = [photo.split("?")[0]]
        if advertised_n and rank == 1:
            row["advertisedTotal"] = advertised_n
        out.append(row)
    return out


def listings_from_bee(
    body: dict[str, Any],
    *,
    url: str = "",
    check_in: str | None = None,
    check_out: str | None = None,
    adults: int | None = None,
    min_guests: int | None = None,
    min_bedrooms: int | None = None,
    page_index: int = 1,
    engine: str = "scrapingbee",
) -> list[dict[str, Any]]:
    """JSON booking-scraper-api → mêmes offres (total de séjour, logement entier)."""
    hotels = body.get("hotels") if isinstance(body, dict) else None
    if not isinstance(hotels, list):
        return []
    props = []
    for item in hotels:
        if not isinstance(item, dict):
            continue
        props.append(
            {
                "name": item.get("name") or item.get("title"),
                "url": item.get("url") or item.get("link") or item.get("href"),
                "price": item.get("price"),
                "address": item.get("location") or item.get("address") or item.get("units"),
            }
        )
    return listings_from_autoparse(
        {"properties": props},
        url=url,
        check_in=check_in,
        check_out=check_out,
        adults=adults,
        min_guests=min_guests,
        min_bedrooms=min_bedrooms,
        page_index=page_index,
        engine=engine,
    )


def listings_from_html(
    html: str,
    *,
    check_in: str | None = None,
    check_out: str | None = None,
    adults: int | None = None,
    min_guests: int | None = None,
    min_bedrooms: int | None = None,
    page_index: int = 1,
    engine: str = "",
) -> list[dict[str, Any]]:
    if not html:
        return []
    positions, occupancy, props = apollo_indexes(html)
    params = {"checkIn": check_in, "checkOut": check_out, "adults": adults}
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    advertised = advertised_count(html)
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    parts = CARD_SPLIT.split(html)
    rank = 0
    for chunk in parts:
        if "property-card" not in chunk and "data-hotel-id" not in chunk and "sr-property-card" not in chunk:
            continue
        href_m = HREF_RE.search(chunk)
        if not href_m:
            continue
        url = _clean_url(href_m.group(1))
        if not url:
            continue
        title = _title(chunk)
        if not title:
            continue
        sid = _source_id(chunk, url)
        if sid in seen:
            continue
        seen.add(sid)
        units_m = UNITS_RE.search(chunk)
        units = units_m.group(1) if units_m else ""
        type_hint = units.split("•")[0].split("·")[0].strip() if units else ""
        slug = _slug(url)
        extra = occupancy.get(slug or "", {})
        pos = positions.get(slug or "", {})
        property_type = extra.get("type") or (type_hint if 2 <= len(type_hint) < 48 and not type_hint[:1].isdigit() else None)
        if is_dropped_listing(property_type) or is_dropped_listing(title):
            continue
        price_el = PRICE_TESTID_RE.search(chunk)
        price_text = (price_el.group(1) if price_el else "") or ""
        if not price_text:
            euro = PRICE_RE.search(chunk[:4000])
            price_text = euro.group(0) if euro else ""
        if slug and props.get(slug, {}).get("price_label") and not price_text:
            price_text = str(props[slug]["price_label"])
        total = stay_total_from_label(price_text)
        if total is None and slug and props.get(slug, {}).get("total"):
            total = props[slug]["total"]
        if total is None:
            continue
        br, beds, guests, area = occupancy_from_text(units, title)
        if extra.get("bedrooms") and not br:
            br = extra["bedrooms"]
        if extra.get("guests") and not guests:
            guests = extra["guests"]
        if min_guests and guests is not None and guests < int(min_guests):
            continue
        if min_bedrooms and br is not None and br < int(min_bedrooms):
            continue
        rank += 1
        row: dict[str, Any] = {
            "source": "booking-web",
            "sourceId": sid,
            "title": title,
            "url": stamp_stay(url, params),
            "totalPrice": total,
            "currency": "EUR",
            "priceConfidence": "total_confirmed",
            "availabilityStatus": "available",
            "retrievedAt": now,
            "propertyType": property_type,
            "images": [p] if (p := _photo(chunk)) else None,
            "searchPageIndex": page_index,
            "searchRank": rank,
        }
        if check_in:
            row["checkIn"] = check_in
        if check_out:
            row["checkOut"] = check_out
        if br:
            row["bedrooms"] = br
        if beds:
            row["beds"] = beds
        if guests:
            row["guests"] = guests
        if area:
            row["areaSqm"] = area
        if pos.get("lat") is not None:
            row["latitude"] = pos["lat"]
        if pos.get("lon") is not None:
            row["longitude"] = pos["lon"]
        if extra.get("type"):
            row["propertyType"] = extra["type"]
        if advertised and rank == 1:
            row["advertisedTotal"] = advertised
        if engine:
            row["engine"] = engine
        out.append(row)
        if slug:
            seen.add(slug)

    for slug, slot in props.items():
        if slug in seen or slot.get("id") in seen:
            continue
        title = slot.get("title") or slug.replace("-", " ").strip()
        total = slot.get("total")
        if not title or not total:
            continue
        property_type = slot.get("type")
        if is_dropped_listing(property_type) or is_dropped_listing(title):
            continue
        guests = slot.get("guests")
        br = slot.get("bedrooms")
        if min_guests and guests is not None and guests < int(min_guests):
            continue
        if min_bedrooms and br is not None and br < int(min_bedrooms):
            continue
        sid = str(slot.get("id") or slug)
        if sid in seen:
            continue
        seen.add(sid)
        seen.add(slug)
        rank += 1
        url = stamp_stay(f"https://www.booking.com/hotel/fr/{slug}.fr.html", params)
        row = {
            "source": "booking-web",
            "sourceId": sid,
            "title": title,
            "url": url,
            "totalPrice": total,
            "currency": "EUR",
            "priceConfidence": "total_confirmed",
            "availabilityStatus": "available",
            "retrievedAt": now,
            "propertyType": property_type,
            "searchPageIndex": page_index,
            "searchRank": rank,
        }
        if check_in:
            row["checkIn"] = check_in
        if check_out:
            row["checkOut"] = check_out
        if br:
            row["bedrooms"] = br
        if guests:
            row["guests"] = guests
        if slot.get("lat") is not None:
            row["latitude"] = slot["lat"]
        if slot.get("lon") is not None:
            row["longitude"] = slot["lon"]
        if advertised and rank == 1:
            row["advertisedTotal"] = advertised
        if engine:
            row["engine"] = engine
        out.append(row)
    return out


# HTMLParser import kept so tests can assert the module stays stdlib-only for mapping.
_ = HTMLParser
