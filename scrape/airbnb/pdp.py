"""Fiches Airbnb via PdpPlatformSections (stl-scraper). Isolé de Playwright.

ExploreSearch de STL est mort (400). La fiche PDP sert encore : capacité,
chambres, GPS. On l'appelle pour les annonces auxquelles la tuile n'a rien dit.

Les appels partent l'un après l'autre. Un 429 ouvre le coupe-circuit partagé
(`throttle.refus`) : on arrête le lot, sans reprise, et on ne vide pas ce qui
est lu. Une attente de notre propre limiteur arrête aussi le lot, sans rien
ouvrir : Airbnb n'a rien refusé.
"""

from __future__ import annotations

import json
import time
from typing import Any
from urllib.parse import urlencode

from occupancy import merge_occupancy, occupancy_from_pdp
from throttle import PAUSE_MAX_S, CoupeCircuit, RateLimited, RythmeLocal, airbnb_circuit, refus, retry_after_s

# Hash relevé dans stl-scraper (stl/endpoint/pdp.py). Toujours valide le 2026-09-06.
PDP_HASH = "625a4ba56ba72f8e8585d60078eb95ea0030428cac8772fde09de073da1bcdd0"
MAX_ENRICH = 40
PAUSE_S = 0.8
BUDGET_S = 22.0


def _api_key(proxy_url: str = "") -> str:
    import pyairbnb.api as airbnb_api
    from session import cached
    from throttle import call_with_retry

    return cached("key", lambda: call_with_retry(lambda: airbnb_api.get(proxy_url, timeout=20), etape="clé"))


def _incomplete(row: dict[str, Any]) -> bool:
    if row.get("guests") is None:
        return True
    if row.get("bedrooms") is None:
        return True
    if row.get("lat") is None or row.get("lon") is None:
        return True
    return False


def fetch_pdp(
    listing_id: str,
    *,
    check_in: str | None,
    check_out: str | None,
    adults: int | None,
    api_key: str,
    proxy_url: str = "",
) -> dict[str, Any] | None:
    from curl_cffi import requests

    variables = {
        "request": {
            "id": str(listing_id),
            "layouts": ["SIDEBAR", "SINGLE_COLUMN"],
            "adults": str(int(adults)) if adults else "1",
            "checkIn": check_in,
            "checkOut": check_out,
            "preview": False,
            "bypassTargetings": False,
            "privateBooking": False,
        }
    }
    query = {
        "operationName": "PdpPlatformSections",
        "locale": "fr",
        "currency": "EUR",
        "variables": json.dumps(variables, separators=(",", ":")),
        "extensions": json.dumps(
            {"persistedQuery": {"version": 1, "sha256Hash": PDP_HASH}},
            separators=(",", ":"),
        ),
    }
    url = "https://www.airbnb.fr/api/v3/PdpPlatformSections?" + urlencode(query)
    proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None
    try:
        res = requests.get(
            url,
            headers={
                "Accept": "application/json",
                "x-airbnb-api-key": api_key,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            proxies=proxies,
            timeout=20,
            impersonate="chrome124",
        )
    except RateLimited:
        raise
    except Exception:
        return None
    if res.status_code in (429, 503):
        raise RateLimited(res.status_code, retry_after_s(res.headers, cap=PAUSE_MAX_S))
    if res.status_code != 200:
        return None
    try:
        raw = res.json()
    except Exception:
        return None
    if not isinstance(raw, dict) or raw.get("errors"):
        return None
    return occupancy_from_pdp(raw)


def _fetch_pdp_polite(
    listing_id: str,
    *,
    check_in: str | None,
    check_out: str | None,
    adults: int | None,
    api_key: str,
    proxy_url: str,
    deadline: float,
) -> dict[str, Any] | None:
    """Une fiche. Un refus ouvre le coupe-circuit et n'est pas repris.

    `RythmeLocal` (notre file d'attente) et `CoupeCircuit` (pause d'un refus
    antérieur) remontent tels quels : rien n'est parti, l'appelant arrête le
    lot sans rien ouvrir de plus. `RythmeLocal` ouvrait le coupe-circuit, et le
    relevé suivant rendait « HTTP 429 » sans qu'Airbnb ait rien refusé.
    """
    del deadline  # Plus de reprise : l'échéance ne borne plus d'attente ici.
    try:
        occ = fetch_pdp(
            listing_id,
            check_in=check_in,
            check_out=check_out,
            adults=adults,
            api_key=api_key,
            proxy_url=proxy_url,
        )
        airbnb_circuit.hit_ok()
        return occ
    except (RythmeLocal, CoupeCircuit):
        raise
    except RateLimited as err:
        refus(err.status, min(PAUSE_MAX_S, max(0.2, err.retry_after_s)), "PDP")
        return None


def enrich_listings(
    listings: list[dict[str, Any]],
    *,
    check_in: str | None,
    check_out: str | None,
    adults: int | None,
    proxy_url: str = "",
    min_guests: int | None = None,
    max_n: int | None = None,
    budget_s: float = BUDGET_S,
    pause_s: float = PAUSE_S,
) -> tuple[list[dict[str, Any]], int]:
    """Complète guests / chambres / GPS. Rend (annonces, nb de fiches lues)."""
    if airbnb_circuit.open():
        return listings, 0
    cap = max_n if max_n is not None else MAX_ENRICH
    missing = [row for row in listings if _incomplete(row)][: max(0, cap)]
    if not missing:
        return listings, 0
    try:
        key = _api_key(proxy_url)
    except Exception:
        return listings, 0

    occ_by_id: dict[str, dict[str, Any]] = {}
    deadline = time.perf_counter() + max(1.0, budget_s)
    for i, row in enumerate(missing):
        if time.perf_counter() >= deadline:
            break
        if airbnb_circuit.open():
            break
        if i:
            rest = deadline - time.perf_counter()
            if rest <= pause_s:
                break
            time.sleep(pause_s)
        try:
            occ = _fetch_pdp_polite(
                row["id"],
                check_in=check_in,
                check_out=check_out,
                adults=adults,
                api_key=key,
                proxy_url=proxy_url,
                deadline=deadline,
            )
        except (RythmeLocal, CoupeCircuit):
            break
        if occ:
            occ_by_id[row["id"]] = occ

    out: list[dict[str, Any]] = []
    for row in listings:
        occ = occ_by_id.get(row["id"])
        merged = merge_occupancy(row, occ) if occ else dict(row)
        if merged is None:
            continue
        guests = merged.get("guests")
        if min_guests and isinstance(guests, int) and guests < min_guests:
            continue
        out.append(merged)
    return out, len(occ_by_id)
