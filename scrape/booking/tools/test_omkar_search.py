#!/usr/bin/env python3
"""Test live GET booking-scraper.omkar.cloud /booking/hotels/search (Les 2 Alpes)."""

from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://booking-scraper.omkar.cloud/booking/hotels/search"
OUT = Path(__file__).resolve().parent / "test_omkar_search_out"


def token() -> str:
    for name in ("OMKAR_BOOKING_KEY", "OMKAR_API_KEY", "OMKAR_AIRBNB_KEY"):
        raw = (os.environ.get(name) or "").strip()
        if raw:
            return raw
    return ""


def main() -> int:
    print("=== Test Omkar Booking search-hotels — Les 2 Alpes ===")
    key = token()
    if not key:
        print("-> [BLOCAGE] Clé absente.")
        print("   L’API répond 400 : Authentication requires sending your API key")
        print("   in the HTTP header field API-Key.")
        print("   Réglages → Omkar Booking, ou export OMKAR_BOOKING_KEY=…")
        print("   Playground navigateur : https://www.omkar.cloud/tools/booking-scraper/search-hotels")
        print("   (gratuit à l’écran ; le GET programmatique, lui, exige la clé).")
        return 2

    params = {
        "query": "Les 2 Alpes",
        "checkin": "2027-02-06",
        "checkout": "2027-02-13",
        "adults": "8",
        "rooms": "1",
        "locale": "fr",
        "currency": "EUR",
        "sort_by": "homes_first",
        "page": "1",
    }
    url = BASE + "?" + urllib.parse.urlencode(params)
    print("GET", url)
    req = urllib.request.Request(
        url,
        headers={
            "API-Key": key,
            "Accept": "application/json",
            "User-Agent": "skitrack-omkar-test/1.0",
        },
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=40) as res:
            body = res.read()
            status = res.status
    except urllib.error.HTTPError as err:
        body = err.read()
        status = err.code
        print(f"-> [ALERTE] HTTP {status}  {body[:400]!r}")
        return 1
    ms = int((time.time() - t0) * 1000)
    print(f"-> HTTP {status}  {ms} ms  {len(body)} octets")
    data = json.loads(body.decode("utf-8"))
    OUT.mkdir(exist_ok=True)
    (OUT / "page1.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    dest = data.get("destination") or {}
    pag = data.get("pagination") or {}
    results = data.get("results") or []
    print("-> destination:", dest.get("label") or dest.get("name"), dest.get("dest_id"), dest.get("dest_type"))
    print("-> pagination:", pag or {"count": data.get("count"), "total_pages": data.get("total_pages")})
    print(f"-> {len(results)} résultats page 1")
    kept = 0
    dropped_hotel = 0
    no_total = 0
    for i, hit in enumerate(results[:12], 1):
        price = hit.get("price") or {}
        total = price.get("total")
        kind = hit.get("accommodation_type") or "?"
        hotel = bool(kind) and kind.lower().split()[0] in {"hotel", "hostel", "motel", "inn", "riad"}
        if hotel:
            dropped_hotel += 1
        elif not isinstance(total, (int, float)) or total <= 0:
            no_total += 1
        else:
            kept += 1
        print(
            f"  {i:02d}  {total if total is not None else '—':>8} {price.get('currency') or ''}  "
            f"{kind:16}  {(hit.get('name') or '')[:48]}"
        )
    print(f"-> conservés (logement entier + total) : {kept}  hôtels écartés : {dropped_hotel}  sans total : {no_total}")
    if kept:
        print("-> [SUCCÈS] Omkar renvoie des totaux de séjour.")
        return 0
    print("-> [ATTENTION] Réponse 200 mais aucun logement entier à total confirmé.")
    return 3


if __name__ == "__main__":
    raise SystemExit(main())
