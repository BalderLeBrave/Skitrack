"""Relevé Booking HTTP — process dédié, sans Playwright.

Les autres sources n’importent pas ce module. Si Booking renvoie un défi
(202 / page vide), on le dit : le connecteur Node replie sur Chromium.
Accepte aussi un HTML déjà chargé (Playwright) pour extraire cartes + GPS.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Any

from map import listings_from_html
from urls import PAGE_SIZE, search_url

MAX_PAGES = 15
# Une requête à la fois vers Booking, et cette pause entre deux pages : les
# pages s'enchaînaient sans aucun délai. La suite lancée après le relevé
# passe `entre_s` (plus long) et ne met qu'une page par appel. Le repli direct,
# lui, a 12 s avant que Node ne le tue : à 2 s entre les pages, ses trois pages
# n'y tenaient plus, et le worker tué n'écrivait rien (toutes ses annonces
# perdues). 0,5 s, comme avant.
PAGE_PAUSE_S = 0.5
DEFAULT_TIMEOUT = 25
# Une page plus courte que ça, en 200, est un défi (coquille), pas une liste.
PAGE_COURTE = 8_000


def classer_reponse(status: int, html: str) -> str | None:
    """`refus` (403, 429, 503) : on n'insiste pas. `defi` (202 ou page trop courte) :
    un autre profil de navigateur, une fois. `None` : la page se lit.
    """
    if status in (403, 429, 503):
        return "refus"
    if status == 202 or (status == 200 and len(html) < PAGE_COURTE):
        return "defi"
    return None


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


def _journal():
    """Le même journal que Node et Airbnb (`taux.py`). Absent : on continue sans."""
    try:
        dossier = str(Path(__file__).resolve().parents[1] / "airbnb")
        if dossier not in sys.path:
            sys.path.insert(0, dossier)
        import taux

        return taux
    except Exception:
        return None


def _avant_booking() -> str | None:
    taux = _journal()
    if taux is None:
        return None
    try:
        if taux.pause_s("booking") > 0:
            return "pause après un refus"
        wait = taux.pace("booking", 5.0)
        if wait > 0:
            return "pause après un refus" if taux.pause_s("booking") > 0 else "limiteur local"
    except Exception:
        return None
    return None


def _noter_refus_booking() -> None:
    taux = _journal()
    if taux is None:
        return
    try:
        taux.noter_blocage("booking", 45.0)
    except Exception:
        return


def fetch_page(url: str, proxy_url: str = "", impersonate: str = "chrome124") -> tuple[int, str]:
    from curl_cffi import requests

    proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None

    def once(target: str):
        return requests.get(
            url,
            headers=_headers(),
            proxies=proxies,
            timeout=DEFAULT_TIMEOUT,
            impersonate=target,
        )

    try:
        res = once(impersonate)
    except Exception:
        if impersonate == "chrome124":
            raise
        res = once("chrome124")
    return res.status_code, res.text or ""


def _pack(listings: list[dict[str, Any]], url: str, pages: int, via: str) -> dict[str, Any]:
    # `totalPrice` à zéro veut dire « total non publié », jamais « gratuit » :
    # ces annonces se rangent après les prix, pas en tête de liste.
    listings.sort(key=lambda r: r.get("totalPrice") or float("inf"))
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
    html = params.get("html")
    url = search_url(params, 0)
    if isinstance(html, str) and len(html) > 800:
        rows = listings_from_html(
            html,
            check_in=str(check_in) if check_in else None,
            check_out=str(check_out) if check_out else None,
            adults=int(adults) if adults else None,
        )
        if not rows:
            return {
                "ok": False,
                "error": "booking-html: aucune tuile lisible",
                "url": url,
                "attempts": 1,
                "blocked": False,
            }
        return _pack(rows, url, 1, "booking-html")

    max_pages = int(params.get("maxPages") or params.get("scrollCount") or MAX_PAGES)
    max_pages = max(1, min(MAX_PAGES, max_pages))
    start = max(0, int(params.get("offset") or 0))
    entre = params.get("entre_s")
    pause = PAGE_PAUSE_S if entre is None else max(0.0, float(entre))
    proxy_url = str(params.get("proxy_url") or _proxy())
    listings: list[dict[str, Any]] = []
    seen: set[str] = set()
    pages = 0
    blocked = False
    cause: str | None = None
    last_status = 0
    epuisee = False
    try:
        for index in range(max_pages):
            if index and pause:
                time.sleep(pause)
            garde = _avant_booking()
            if garde:
                blocked = True
                cause = "refus" if "refus" in garde else garde
                break
            page_url = search_url(params, start + index * PAGE_SIZE)
            status, page_html = fetch_page(page_url, proxy_url)
            last_status = status
            pages += 1
            sorte = classer_reponse(status, page_html)
            # Un 403 ou un 429 ne se redemande pas. Un 202, ou une coquille,
            # a droit à un autre profil — une fois — puis on s'arrête.
            if sorte == "defi":
                garde = _avant_booking()
                if garde:
                    blocked = True
                    cause = "refus" if "refus" in garde else garde
                    break
                status, page_html = fetch_page(page_url, proxy_url, "chrome131")
                last_status = status
                sorte = classer_reponse(status, page_html)
            if sorte:
                if sorte == "refus":
                    _noter_refus_booking()
                blocked = True
                cause = sorte
                break
            batch = listings_from_html(
                page_html,
                check_in=str(check_in) if check_in else None,
                check_out=str(check_out) if check_out else None,
                adults=int(adults) if adults else None,
            )
            fresh = 0
            for row in batch:
                sid = row["sourceId"]
                if sid in seen:
                    continue
                seen.add(sid)
                listings.append(row)
                fresh += 1
            if fresh == 0 or len(batch) < PAGE_SIZE * 0.6:
                epuisee = True
                break
            # Booking annonce bien un nombre d'établissements en tête de page,
            # mais aucune charge enregistrée du dépôt n'en prouve le balisage :
            # on ne peut donc pas paginer jusqu'à un compteur ici. L'arrêt
            # repose sur ce qui est observable — une page courte, une page sans
            # rien de neuf — et sur `max_pages`, qui est un garde-fou et non
            # une lecture de la source.
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
            else "booking-http: aucune tuile lisible"
        )
        return {
            "ok": False,
            "error": reason,
            "url": url,
            "attempts": 1,
            "blocked": blocked,
            "pagesFetched": pages,
            **({"arret": cause} if cause else {}),
        }
    packed = _pack(listings, url, pages, "booking-http")
    if cause:
        packed["arret"] = cause
        packed["blocked"] = True
    elif not epuisee and pages >= max_pages:
        packed["offset"] = start + pages * PAGE_SIZE
    return packed
