"""Relevé Gîtes — toutes les pages Drupal, puis devis ITEA de chaque gîte."""

from __future__ import annotations

import time
from typing import Any

from fetch_serp import fetch_serp
from itea import quote
from parse import advertised_count, keep_gite, last_page_index, tiles_from_html
from store import write_results
from urls import search_url, towns_id


def collect_serp(
    dest: str,
    check_in: str,
    check_out: str,
    adults: int,
    *,
    max_pages: int = 40,
) -> tuple[list[dict[str, Any]], str | None, int | None, int]:
    tiles: list[dict[str, Any]] = []
    seen: set[str] = set()
    engine = None
    advertised = None
    last = 0
    page = 0
    pages = 0
    while page <= last and pages < max_pages:
        url = search_url(dest, check_in, check_out, adults=adults, page=page)
        html, engine = fetch_serp(url)
        pages += 1
        if advertised is None:
            advertised = advertised_count(html)
        last = max(last, last_page_index(html), page)
        batch = tiles_from_html(html)
        new = 0
        for t in batch:
            sid = t["sourceId"]
            if sid in seen:
                continue
            seen.add(sid)
            tiles.append(t)
            new += 1
        if new == 0:
            break
        # Drupal : si le compteur « N Résultats » dépasse les tuiles déjà lues, il reste une page.
        if advertised is not None and len(tiles) < advertised:
            last = max(last, page + 1)
        elif last_page_index(html) > page:
            last = max(last, last_page_index(html))
        page += 1
    return tiles, engine, advertised, pages


def run_search(params: dict[str, Any]) -> dict[str, Any]:
    from fetch_serp import _ingest_env

    _ingest_env()
    dest = str(params.get("destination") or params.get("city") or "")
    check_in = str(params.get("checkIn") or params.get("checkin") or "")
    check_out = str(params.get("checkOut") or params.get("checkout") or "")
    try:
        adults = int(params.get("adults") or 8)
    except (TypeError, ValueError):
        adults = 8
    try:
        bedrooms = int(params.get("bedrooms") or 0)
    except (TypeError, ValueError):
        bedrooms = 0
    max_pages = int(params.get("maxPages") or 40)
    quote_limit = params.get("quoteLimit")
    quote_limit_n = int(quote_limit) if quote_limit not in (None, "", "all") else None

    tiles, engine, advertised, pages = collect_serp(
        dest, check_in, check_out, adults, max_pages=max_pages
    )

    eligible: list[dict[str, Any]] = []
    dropped_rooms = 0
    dropped_guests = 0
    for t in tiles:
        rooms = t.get("bedrooms")
        guests = t.get("guests")
        # Inconnu ≠ trop petit : on ne jette que si le chiffre de la tuile est lu et sous le plancher.
        if bedrooms and rooms is not None and int(rooms) < bedrooms:
            dropped_rooms += 1
            continue
        if adults and guests is not None and int(guests) < adults:
            dropped_guests += 1
            continue
        eligible.append(t)

    to_quote = eligible if quote_limit_n is None else eligible[:quote_limit_n]
    hits: list[dict[str, Any]] = []
    skipped = 0
    for i, card in enumerate(to_quote):
        if i:
            time.sleep(0.15)
        q = quote(card["sourceId"], check_in, check_out, adults)
        if not q.get("available") or not q.get("price_firm"):
            skipped += 1
            continue
        if not keep_gite(
            ident=str(q.get("ident") or ""),
            url=card["url"],
            type_label=str(card.get("propertyType") or ""),
        ):
            skipped += 1
            continue
        row = dict(card)
        row["totalPrice"] = q["totalPrice"]
        row["currency"] = "EUR"
        row["priceConfidence"] = "total_confirmed"
        row["availabilityStatus"] = "available"
        row["checkIn"] = check_in
        row["checkOut"] = check_out
        if q.get("photo") and "images" not in row:
            row["images"] = [q["photo"]]
        if q.get("ident"):
            row["ident"] = q["ident"]
        # Pin OSM de la fiche (JSON-LD ITEA / #map-accommodation), pas le centroïde SERP.
        if q.get("latitude") is not None and q.get("longitude") is not None:
            row["latitude"] = q["latitude"]
            row["longitude"] = q["longitude"]
        if q.get("city") and not row.get("city"):
            row["city"] = q["city"]
        if q.get("address") and not row.get("address"):
            row["address"] = q["address"]
        hits.append(row)

    out = {
        "ok": bool(hits),
        "source": "gites-web",
        "count": len(hits),
        "via": f"serp-{engine}+itea",
        "towns": towns_id(dest),
        "destination": dest,
        "checkIn": check_in,
        "checkOut": check_out,
        "pages": pages,
        "serpTiles": len(tiles),
        "eligible": len(eligible),
        "quoted": len(to_quote),
        "droppedRooms": dropped_rooms,
        "droppedGuests": dropped_guests,
        "advertised": advertised,
        "results": hits,
        "error": None if hits else "aucun gîte avec total séjour",
    }
    output_dir = params.get("outputDir") or params.get("output_dir")
    if output_dir and hits:
        out["files"] = write_results(hits, str(output_dir), extra={"via": out["via"], "pages": pages})
    return out
