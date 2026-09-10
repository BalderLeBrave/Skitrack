"""Relevé Booking HTTP — process dédié, sans Playwright.

Les autres sources n’importent pas ce module. Si Booking renvoie un défi
(202 / page vide), on le dit : le connecteur Node replie sur Chromium.
Accepte aussi un HTML déjà chargé (Playwright) pour extraire cartes + GPS.
"""

from __future__ import annotations

import os
from typing import Any

from map import listings_from_html
from urls import PAGE_SIZE, search_url

MAX_PAGES = 15
DEFAULT_TIMEOUT = 25


def _proxy() -> str:
    return (os.environ.get("SKITRACK_PROXY") or os.environ.get("HTTPS_PROXY") or "").strip()


def _headers() -> dict[str, str]:
    return {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Upgrade-Insecure-Requests": "1",
    }


def fetch_page(url: str, proxy_url: str = "") -> tuple[int, str]:
    from curl_cffi import requests

    proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None
    res = requests.get(
        url,
        headers=_headers(),
        proxies=proxies,
        timeout=DEFAULT_TIMEOUT,
        impersonate="chrome124",
    )
    return res.status_code, res.text or ""


def _pack(listings: list[dict[str, Any]], url: str, pages: int, via: str) -> dict[str, Any]:
    listings.sort(key=lambda r: r.get("totalPrice") or 0)
    gps = sum(1 for r in listings if isinstance(r.get("latitude"), (int, float)))
    return {
        "ok": True,
        "results": listings,
        "url": url,
        "count": len(listings),
        "attempts": 1,
        "via": via,
        "pagesFetched": pages,
        "isolated": True,
        "source": "booking-web",
        "withGps": gps,
    }


def run_search(params: dict[str, Any]) -> dict[str, Any]:
    check_in = params.get("checkIn") or params.get("checkin")
    check_out = params.get("checkOut") or params.get("checkout")
    adults = params.get("adults") or params.get("guests")
    min_bedrooms = params.get("bedrooms") or params.get("min_bedrooms")
    html = params.get("html")
    url = search_url(params, 0)
    if isinstance(html, str) and len(html) > 800:
        rows = listings_from_html(
            html,
            check_in=str(check_in) if check_in else None,
            check_out=str(check_out) if check_out else None,
            adults=int(adults) if adults else None,
            min_guests=int(adults) if adults else None,
            min_bedrooms=int(min_bedrooms) if min_bedrooms else None,
        )
        if not rows:
            return {
                "ok": False,
                "error": "booking-html: aucune annonce avec total de séjour",
                "url": url,
                "attempts": 1,
                "blocked": False,
            }
        return _pack(rows, url, 1, "booking-html")

    max_pages = int(params.get("maxPages") or params.get("scrollCount") or MAX_PAGES)
    max_pages = max(1, min(MAX_PAGES, max_pages))
    proxy_url = str(params.get("proxy_url") or _proxy())
    listings: list[dict[str, Any]] = []
    seen: set[str] = set()
    pages = 0
    blocked = False
    last_status = 0
    try:
        for index in range(max_pages):
            page_url = search_url(params, index * PAGE_SIZE)
            status, page_html = fetch_page(page_url, proxy_url)
            last_status = status
            pages += 1
            if status in (202, 403, 429) or (status == 200 and len(page_html) < 8_000):
                blocked = True
                break
            batch = listings_from_html(
                page_html,
                check_in=str(check_in) if check_in else None,
                check_out=str(check_out) if check_out else None,
                adults=int(adults) if adults else None,
                min_guests=int(adults) if adults else None,
                min_bedrooms=int(min_bedrooms) if min_bedrooms else None,
            )
            fresh = 0
            for row in batch:
                sid = row["sourceId"]
                if sid in seen:
                    continue
                seen.add(sid)
                listings.append(row)
                fresh += 1
            if fresh == 0:
                break
            if len(batch) < PAGE_SIZE * 0.6:
                break
    except Exception as err:
        return {
            "ok": False,
            "error": f"booking-http: {err}",
            "url": url,
            "attempts": 1,
            "blocked": False,
        }
    if not listings:
        reason = (
            f"booking-http: défi anti-robot (HTTP {last_status})"
            if blocked
            else "booking-http: aucune annonce avec total de séjour"
        )
        return {
            "ok": False,
            "error": reason,
            "url": url,
            "attempts": 1,
            "blocked": blocked,
            "pagesFetched": pages,
        }
    return _pack(listings, url, pages, "booking-http")
