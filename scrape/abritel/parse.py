"""getResultList CozyCozy → fiches Abritel (total séjour, pas /nuit)."""

from __future__ import annotations

import re
from typing import Any

from urls import canonical_abritel_url, is_abritel_family


def _positive(v: Any) -> int | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)) and v > 0:
        return int(v)
    return None


def _photo(obj: dict[str, Any]) -> str | None:
    thumbs = obj.get("lightThumbnails") if isinstance(obj.get("lightThumbnails"), dict) else {}
    first = thumbs.get("firstUrls") if isinstance(thumbs, dict) else None
    if isinstance(first, list) and first:
        s = first[0]
        if isinstance(s, str) and s.startswith("//"):
            return "https:" + s
        if isinstance(s, str) and s.startswith("http"):
            return s
    for key in ("photo", "image"):
        val = obj.get(key)
        if isinstance(val, str) and val.startswith("http") and "cozycozy" not in val.lower():
            return val
    return None


def keep_entire(parent: dict[str, Any], hit: dict[str, Any]) -> bool:
    kind = str(parent.get("title") or "").lower()
    unit = str(hit.get("text") or hit.get("shortText") or "").lower()
    if re.search(r"h[oô]tel", kind) and (re.search(r"\d+\s*×", unit) or "chambre" in unit):
        return False
    if "chambre d" in kind and "hote" in kind:
        return False
    return True


def parse_abritel_hits(payload: Any) -> list[dict[str, Any]]:
    if not payload or not isinstance(payload, dict):
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    def emit(hit: dict[str, Any], parent: dict[str, Any] | None) -> None:
        if not is_abritel_family(
            str(hit.get("providerCode") or ""),
            str(hit.get("providerName") or hit.get("providerText") or ""),
            str(hit.get("deeplinkUrl") or ""),
        ):
            return
        raw = parent if isinstance(parent, dict) else {}
        if not keep_entire(raw, hit):
            return
        price = hit.get("totalPrice") if isinstance(hit.get("totalPrice"), dict) else {}
        if price.get("indicative") is True:
            return
        stay = price.get("value") if isinstance(price, dict) else None
        if not isinstance(stay, (int, float)) or stay <= 0:
            stay = hit.get("eurPriceValue")
        if not isinstance(stay, (int, float)) or stay <= 0:
            return
        title = str(raw.get("name") or hit.get("name") or "").replace("\n", " ").strip()
        if not title:
            return
        details = raw.get("subTitleDetails") if isinstance(raw.get("subTitleDetails"), dict) else {}
        guests = _positive(details.get("guestCapacity"))
        bedrooms = _positive(details.get("bedRoomCount")) or _positive(hit.get("bedRoomCount"))
        beds = _positive(details.get("bedCount"))
        check_in = str(hit.get("fromDate") or "")[:10] or None
        check_out = str(hit.get("toDate") or "")[:10] or None
        url = canonical_abritel_url(
            str(hit.get("deeplinkUrl") or ""),
            check_in=check_in,
            check_out=check_out,
            adults=guests,
        )
        if not url:
            return
        pid = re.search(r"/(p\d+[a-z]?)(?:/|$|\?)", url, re.I)
        sid = str(
            (pid.group(1).lower() if pid else None)
            or hit.get("externalId")
            or raw.get("accommodationId")
            or hit.get("accommodationId")
            or url
        )
        if sid in seen:
            return
        seen.add(sid)
        coords = raw.get("coordinates") if isinstance(raw.get("coordinates"), dict) else {}
        photo = _photo(raw) or _photo(hit)
        city = str(raw.get("cityName") or "").strip() or None
        location = str(raw.get("locationText") or "").strip() or city
        kind = str(raw.get("title") or "").strip() or "logement"
        row: dict[str, Any] = {
            "source": "vrbo-web",
            "sourceId": sid,
            "listingKey": f"abritel:{sid.lower()}",
            "title": title,
            "url": url,
            "totalPrice": round(float(stay), 2),
            "currency": str(price.get("currencyCode") or "EUR"),
            "priceConfidence": "total_confirmed",
            "availabilityStatus": "available",
            "propertyType": kind,
        }
        if guests:
            row["guests"] = guests
        if bedrooms is not None:
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
