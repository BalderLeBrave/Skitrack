"""Relevé Gîtes — process dédié. SERP Botasaurus/Playwright, devis ITEA HTTP."""

from __future__ import annotations

import re
from typing import Any

from fetch_serp import fetch_serp
from itea import quote
from parse import keep_gite, tiles_from_html
from store import write_results
from urls import search_url, towns_id


def _advertised(html: str) -> int | None:
    m = re.search(r"(\d+)\s*R[ée]sultats?", html, re.I)
    if m:
        n = int(m.group(1))
        return n if 0 < n < 50_000 else None
    return None


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
    max_pages = int(params.get("maxPages") or 4)
    quote_limit = int(params.get("quoteLimit") or 40)

    tiles: list[dict[str, Any]] = []
    engine = None
    advertised = None
    for page in range(max_pages):
        url = search_url(dest, check_in, check_out, adults=adults, page=page)
        html, engine = fetch_serp(url)
        if advertised is None:
            advertised = _advertised(html)
        batch = tiles_from_html(html)
        if not batch:
            break
        tiles.extend(batch)
        if advertised is not None and len(tiles) >= advertised:
            break
        if len(batch) < 10:
            break

    seen: set[str] = set()
    uniq: list[dict[str, Any]] = []
    for t in tiles:
        sid = t["sourceId"]
        if sid in seen:
            continue
        seen.add(sid)
        if bedrooms and int(t.get("bedrooms") or 0) < bedrooms:
            continue
        if adults and int(t.get("guests") or 0) and int(t["guests"]) < adults:
            continue
        uniq.append(t)

    hits: list[dict[str, Any]] = []
    for card in uniq[:quote_limit]:
        q = quote(card["sourceId"], check_in, check_out, adults)
        if not q.get("available") or not q.get("price_firm"):
            continue
        if not keep_gite(ident=str(q.get("ident") or ""), url=card["url"], type_label=str(card.get("propertyType") or "")):
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
        "serpTiles": len(uniq),
        "advertised": advertised,
        "results": hits,
        "error": None if hits else "aucun gîte avec total séjour",
    }
    output_dir = params.get("outputDir") or params.get("output_dir")
    if output_dir and hits:
        out["files"] = write_results(hits, str(output_dir), extra={"via": out["via"]})
    return out
