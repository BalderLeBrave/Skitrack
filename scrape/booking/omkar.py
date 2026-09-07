"""Omkar Booking HTTP — search paginé, totaux de séjour. Jeton jamais loggé."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlsplit

HERE = Path(__file__).resolve().parent
BASE = "https://booking-scraper.omkar.cloud"
HOTEL_TYPE = re.compile(r"^(hotel|hostel|motel|inn|riad)\b", re.I)


def _ingest_env_file(path: Path) -> None:
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        if key and val and key not in os.environ:
            os.environ[key] = val


def token() -> str:
    _ingest_env_file(HERE / ".env")
    _ingest_env_file(HERE.parent.parent / ".env")
    return (
        os.environ.get("OMKAR_BOOKING_KEY")
        or os.environ.get("OMKAR_API_KEY")
        or os.environ.get("OMKAR_AIRBNB_KEY")
        or ""
    ).strip()


def get(path: str, query: dict[str, Any], timeout_s: float = 20) -> dict[str, Any]:
    key = token()
    if not key:
        raise RuntimeError("omkar: jeton absent")
    url = BASE + path + "?" + urllib.parse.urlencode({k: v for k, v in query.items() if v not in (None, "")})
    req = urllib.request.Request(
        url, headers={"API-Key": key, "Accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as res:
            raw = res.read()
            status = res.status
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", "replace")
        raise RuntimeError(f"omkar HTTP {err.code}: {body[:180]}") from err
    except OSError as err:
        raise RuntimeError(f"omkar réseau: {err}") from err
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as err:
        raise RuntimeError("omkar: réponse non JSON") from err
    if status != 200:
        raise RuntimeError(f"omkar HTTP {status}")
    if not isinstance(data, dict):
        raise RuntimeError("omkar: corps inattendu")
    return data


def _hotel_only(kind: str | None, title: str) -> bool:
    t = (kind or "").strip()
    if t and HOTEL_TYPE.search(t) and not re.search(r"apart|appart|residence|chalet|villa", t, re.I):
        return True
    from map import is_dropped_listing

    return is_dropped_listing(title)


def listings_from_omkar(
    body: dict[str, Any],
    *,
    check_in: str | None = None,
    check_out: str | None = None,
    adults: int | None = None,
    page_index: int = 1,
    engine: str = "omkar",
) -> list[dict[str, Any]]:
    rows = body.get("results") if isinstance(body.get("results"), list) else []
    advertised = body.get("pagination", {}).get("count") if isinstance(body.get("pagination"), dict) else None
    if advertised is None:
        advertised = body.get("count")
    try:
        advertised_n = int(advertised) if advertised is not None else None
    except (TypeError, ValueError):
        advertised_n = None
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    rank = 0
    for hit in rows:
        if not isinstance(hit, dict):
            continue
        if hit.get("is_sold_out"):
            continue
        title = str(hit.get("name") or "").strip()
        link = str(hit.get("link") or "").strip()
        sid = str(hit.get("id") or "").strip()
        if not title or not link or not sid:
            continue
        kind = hit.get("accommodation_type")
        if _hotel_only(str(kind) if kind else None, title):
            continue
        price = hit.get("price") if isinstance(hit.get("price"), dict) else {}
        total = price.get("total")
        if not isinstance(total, (int, float)) or total <= 0:
            continue
        if sid in seen:
            continue
        seen.add(sid)
        rank += 1
        from map import stamp_stay

        url = stamp_stay(link, {"checkIn": check_in, "checkOut": check_out, "adults": adults})
        loc = hit.get("location") if isinstance(hit.get("location"), dict) else {}
        unit = hit.get("unit") if isinstance(hit.get("unit"), dict) else {}
        rating = hit.get("rating") if isinstance(hit.get("rating"), dict) else {}
        row: dict[str, Any] = {
            "source": "booking-web",
            "sourceId": sid,
            "title": title,
            "url": url,
            "totalPrice": round(float(total), 2),
            "currency": str(price.get("currency") or "EUR"),
            "priceConfidence": "total_confirmed",
            "availabilityStatus": "available",
            "retrievedAt": now,
            "searchPageIndex": page_index,
            "searchRank": rank,
            "engine": engine,
            "propertyType": kind or None,
        }
        if check_in:
            row["checkIn"] = check_in
        if check_out:
            row["checkOut"] = check_out
        if isinstance(loc.get("latitude"), (int, float)):
            row["latitude"] = float(loc["latitude"])
        if isinstance(loc.get("longitude"), (int, float)):
            row["longitude"] = float(loc["longitude"])
        if loc.get("city"):
            row["city"] = str(loc["city"])
        photo = hit.get("image")
        if isinstance(photo, str) and photo.startswith("http"):
            row["images"] = [photo]
        br = unit.get("bedrooms")
        if isinstance(br, (int, float)) and br >= 0:
            row["bedrooms"] = int(br)
        beds = unit.get("beds")
        if isinstance(beds, (int, float)) and beds > 0:
            row["beds"] = int(beds)
        score = rating.get("score")
        if isinstance(score, (int, float)):
            row["rating"] = float(score)
            row["ratingScale"] = 10
        if advertised_n and rank == 1:
            row["advertisedTotal"] = advertised_n
        out.append(row)
    return out


def page_from_url(url: str) -> tuple[dict[str, Any], int]:
    q = dict(parse_qsl(urlsplit(url).query, keep_blank_values=True))
    offset = 0
    try:
        offset = int(q.get("offset") or 0)
    except ValueError:
        offset = 0
    page = offset // 25 + 1
    query = {
        "query": q.get("ssne") or q.get("ss") or q.get("query") or "",
        "dest_id": q.get("dest_id"),
        "dest_type": q.get("dest_type"),
        "checkin": q.get("checkin"),
        "checkout": q.get("checkout"),
        "adults": q.get("group_adults") or "2",
        "rooms": "1",
        "locale": "fr",
        "currency": "EUR",
        "sort_by": "homes_first",
        "page": page,
    }
    return query, page
