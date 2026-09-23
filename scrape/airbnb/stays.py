"""Relevé Airbnb via pyairbnb — process dédié, sans Playwright.

Les autres sources (Booking, Gîtes, Abritel) n’importent pas ce module.
"""

from __future__ import annotations

import contextlib
import io
import os
import sys
import time
from typing import Any
from urllib.parse import quote, urlencode

from map import listings_from_raw, par_prix
from pdp import enrich_listings
import session
from session import cached, install_shared_http, invalidate, next_search_cursor
from throttle import (
    MARGE_REQUETE_S,
    RateLimited,
    RythmeLocal,
    airbnb_circuit,
    call_with_retry,
    http_status_of,
    is_rate_limited,
)

# Paquet vendu à côté de ce fichier.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pyairbnb  # noqa: E402
import pyairbnb.api as airbnb_api  # noqa: E402
import pyairbnb.search as airbnb_search  # noqa: E402
from pyairbnb.utils import get_nested_value  # noqa: E402

install_shared_http()

MAX_PAGES = 80
# Une page de plus, c'est un appel de plus au même domaine : on ralentit le
# rythme plutôt que de l'accélérer, et on s'interdit de tourner indéfiniment.
PAGE_PAUSE_S = 0.4
# Échéance par défaut quand l'appelant n'en donne pas (`deadlineMs`). Elle
# couvre tout le relevé, clé et hash compris : l'ancien budget de pages ne
# partait qu'après eux, et dépassait la part de 52 s du côté de Node.
PAGE_BUDGET_S = 40.0
ENRICH_BUDGET_S = 22.0
DEFAULT_TIMEOUT = 45
# Au plus tant de StaysSearch par relevé, toutes zones confondues : sous le
# plafond de 18 appels par minute de `taux.py`, avec de la marge pour la clé,
# le hash et un second relevé qui partirait avant la fin de celui-ci.
MAX_REQUETES = 12
# Airbnb ne pagine pas au-delà d'environ 7 pages de 40 par emprise (mesuré le
# 23 septembre 2026) : au-delà de ce nombre publié, une emprise ne se lit pas
# en entier, et il faut la découper.
PLAFOND_EMPRISE = 280
# L'emprise serrée autour de la station, lue en premier. Un carré de ±12 km
# dépensait 36 à 55 % des 280 places sur d'autres domaines (Pralognan, l'Alpe
# d'Huez) ; on le lit encore, mais après.
RAYON_PROCHE_KM = 6.0
RAYON_LARGE_KM = 12.0
CURRENCY = "EUR"
LANGUAGE = "fr"
PLACE_TYPE = "Entire home/apt"


def _proxy() -> str:
    raw = os.environ.get("SKITRACK_PROXY") or os.environ.get("HTTPS_PROXY") or ""
    return raw.strip()


def zoom_for_bounds(north: float, south: float, east: float, west: float) -> int:
    width = max(1e-4, abs(east - west))
    from math import log2

    brut = log2((360 * 1100) / (256 * width))
    return max(8, min(14, round(brut)))


def bounds_from_point(lat: float, lon: float, radius_km: float = 12.0) -> dict[str, float]:
    from math import cos, pi

    dlat = radius_km / 111.0
    dlng = radius_km / (111.0 * max(0.2, cos(lat * pi / 180.0)))
    return {
        "north": lat + dlat,
        "south": lat - dlat,
        "east": lon + dlng,
        "west": lon - dlng,
    }


def build_search_url(params: dict[str, Any]) -> str:
    given = params.get("url")
    if isinstance(given, str) and given.startswith("http"):
        return given
    city = str(params.get("city") or params.get("destination") or "France").strip()
    segment = quote(city.replace(",", "--").replace(" ", "-"))
    query: dict[str, str] = {}
    bounds = params.get("bounds") if isinstance(params.get("bounds"), dict) else None
    if not bounds and isinstance(params.get("lat"), (int, float)) and isinstance(params.get("lon"), (int, float)):
        bounds = bounds_from_point(float(params["lat"]), float(params["lon"]))
    if bounds:
        north = float(bounds.get("north") or bounds.get("ne_lat") or 0)
        south = float(bounds.get("south") or bounds.get("sw_lat") or 0)
        east = float(bounds.get("east") or bounds.get("ne_lng") or bounds.get("ne_long") or 0)
        west = float(bounds.get("west") or bounds.get("sw_lng") or bounds.get("sw_long") or 0)
        query["ne_lat"] = str(north)
        query["ne_lng"] = str(east)
        query["sw_lat"] = str(south)
        query["sw_lng"] = str(west)
        query["zoom"] = str(zoom_for_bounds(north, south, east, west))
        query["search_by_map"] = "true"
    if params.get("checkIn") or params.get("checkin"):
        query["checkin"] = str(params.get("checkIn") or params.get("checkin"))
    if params.get("checkOut") or params.get("checkout"):
        query["checkout"] = str(params.get("checkOut") or params.get("checkout"))
    adults = params.get("adults") or params.get("guests")
    if adults:
        query["adults"] = str(int(adults))
    if params.get("children"):
        query["children"] = str(int(params["children"]))
    if params.get("infants"):
        query["infants"] = str(int(params["infants"]))
    if params.get("minPrice") is not None:
        query["price_min"] = str(int(params["minPrice"]))
    if params.get("maxPrice") is not None:
        query["price_max"] = str(int(params["maxPrice"]))
    bedrooms = params.get("bedrooms") or params.get("min_bedrooms")
    if bedrooms:
        query["min_bedrooms"] = str(int(bedrooms))
    query["room_types[]"] = PLACE_TYPE
    suffix = urlencode(query)
    return f"https://www.airbnb.fr/s/{segment}/homes" + (f"?{suffix}" if suffix else "")


def _reste(fin: float) -> float:
    return fin - time.time()


def _timeout(fin: float) -> float:
    """Le délai d'une requête : jamais au-delà de l'échéance du relevé."""
    return max(1.0, min(float(DEFAULT_TIMEOUT), _reste(fin) - 0.5))


def _hash(proxy_url: str, fin: float) -> str:
    def fetch() -> str:
        return call_with_retry(
            lambda: airbnb_search.fetch_stays_search_hash(proxy_url, timeout=_timeout(fin)),
            fin=fin,
        )

    return cached("hash", fetch)


def _api_key(proxy_url: str, fin: float) -> str:
    return cached(
        "key",
        lambda: call_with_retry(lambda: airbnb_api.get(proxy_url, timeout=_timeout(fin)), fin=fin),
    )


def result_count(raw: Any) -> int | None:
    """Le nombre d'annonces qu'Airbnb publie pour l'emprise, ou None.

    Il est dans le panneau de filtres de la réponse StaysSearch : c'est lui que
    la page affiche (« 273 logements »). On croyait qu'Airbnb n'en publiait
    aucun ; faute de le lire, on ne savait pas qu'une emprise dépassait ce
    qu'Airbnb laisse paginer.
    """
    n = get_nested_value(raw, "data.presentation.staysSearch.results.filters.filterPanel.resultCount", None)
    if isinstance(n, bool):
        return None
    if isinstance(n, (int, float)) and n >= 0:
        return int(n)
    if isinstance(n, str) and n.strip().isdigit():
        return int(n.strip())
    return None


def _search_pages(
    url: str,
    proxy_url: str,
    max_pages: int,
    fin: float,
    seen: set[str],
    budget: list[int],
) -> tuple[list[Any], int, bool, int | None, bool]:
    """Les pages d'une emprise, jusqu'à la fin des curseurs, l'échéance ou le budget.

    `seen` est partagé entre les emprises : une annonce déjà lue ailleurs ne
    compte pas comme neuve. `budget` est le nombre de StaysSearch qu'il reste
    au relevé entier (liste mutable). Rend les charges, le nombre de pages, le
    drapeau 429, le nombre publié pour l'emprise, et si l'emprise a été lue
    jusqu'au bout de ce qu'Airbnb laisse paginer.
    """
    raw_params = airbnb_search.url_to_raw_params(url)
    api_key = _api_key(proxy_url, fin)
    op_hash = _hash(proxy_url, fin)
    pages = 0
    raws: list[Any] = []
    cursor = ""
    rate_limited = False
    advertised: int | None = None
    epuisee = False
    call = {
        "currency": CURRENCY,
        "language": LANGUAGE,
        "proxy_url": proxy_url,
        "hash": op_hash,
        "raw_params": raw_params,
        "check_in": None,
        "check_out": None,
        "ne_lat": 0,
        "ne_long": 0,
        "sw_lat": 0,
        "sw_long": 0,
        "zoom_value": 0,
        "place_type": PLACE_TYPE,
        "price_min": 0,
        "price_max": 0,
        "amenities": [],
        "free_cancellation": False,
        "adults": 0,
        "children": 0,
        "infants": 0,
        "min_bedrooms": 0,
        "min_beds": 0,
        "min_bathrooms": 0,
    }
    # `paginationInfo` ne porte que des curseurs : on s'arrête quand il n'y en
    # a plus, ou quand une page n'apporte plus rien de neuf. Le nombre publié
    # (`result_count`) ne sert pas d'arrêt — Airbnb cesse de paginer avant de
    # l'atteindre au-delà de ~280 — mais il dit s'il faut découper l'emprise.
    pause = PAGE_PAUSE_S
    while pages < max_pages and budget[0] > 0:
        # Une requête qui ne peut pas finir avant l'échéance ne part pas.
        if _reste(fin) < MARGE_REQUETE_S:
            print(f"[airbnb] échéance après {pages} page(s) — on garde ce qui est lu", file=sys.stderr)
            break
        try:
            budget[0] -= 1
            raw = call_with_retry(
                lambda: airbnb_search.get(api_key=api_key, cursor=cursor, timeout=_timeout(fin), **call),
                fin=fin,
            )
        except RateLimited:
            rate_limited = True
            if raws:
                print(f"[airbnb] 429 après {pages} page(s) — on garde ce qui est lu", file=sys.stderr)
            break
        raws.append(raw)
        pages += 1
        if advertised is None:
            advertised = result_count(raw)
        pagination = get_nested_value(
            raw, "data.presentation.staysSearch.results.paginationInfo", {}
        ) or {}
        nxt = next_search_cursor(pagination if isinstance(pagination, dict) else {}, cursor)
        neuves = 0
        for row in listings_from_raw(raw):
            if row["id"] not in seen:
                seen.add(row["id"])
                neuves += 1
        if not nxt:
            epuisee = True
            break
        if not neuves and pages > 1:
            epuisee = True
            break
        time.sleep(pause)
        cursor = nxt
    return raws, pages, rate_limited, advertised, epuisee


def quadrants(b: dict[str, float]) -> list[dict[str, float]]:
    """Les quatre quarts d'une emprise : chacun se pagine à part, jusqu'à ~280."""
    mid_lat = (b["north"] + b["south"]) / 2
    mid_lon = (b["east"] + b["west"]) / 2
    return [
        {"north": b["north"], "south": mid_lat, "east": mid_lon, "west": b["west"]},
        {"north": b["north"], "south": mid_lat, "east": b["east"], "west": mid_lon},
        {"north": mid_lat, "south": b["south"], "east": mid_lon, "west": b["west"]},
        {"north": mid_lat, "south": b["south"], "east": b["east"], "west": mid_lon},
    ]


def emprises(params: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """Les emprises à lire, dans l'ordre, sous forme de paramètres de recherche.

    Sans coordonnées (ou avec une URL ou une emprise données), une seule
    recherche, comme avant. Avec coordonnées : l'emprise proche, puis la large.
    Les quarts de l'emprise proche s'intercalent à la demande (voir run_search).
    """
    lat, lon = params.get("lat"), params.get("lon")
    if params.get("url") or isinstance(params.get("bounds"), dict) or not (
        isinstance(lat, (int, float)) and isinstance(lon, (int, float))
    ):
        return [("unique", params)]
    rayon = float(params.get("radiusKm") or RAYON_PROCHE_KM)
    proche = bounds_from_point(float(lat), float(lon), rayon)
    out: list[tuple[str, dict[str, Any]]] = [("proche", {**params, "bounds": proche})]
    if rayon < RAYON_LARGE_KM:
        out.append(("large", {**params, "bounds": bounds_from_point(float(lat), float(lon), RAYON_LARGE_KM)}))
    return out


def run_search(params: dict[str, Any]) -> dict[str, Any]:
    check_in = params.get("checkIn") or params.get("checkin")
    check_out = params.get("checkOut") or params.get("checkout")
    adults = params.get("adults") or params.get("guests")
    min_bedrooms = params.get("bedrooms") or params.get("min_bedrooms")
    max_pages = int(params.get("maxPages") or params.get("scrollCount") or MAX_PAGES)
    max_pages = max(1, min(MAX_PAGES, max_pages))
    deadline_ms = params.get("deadlineMs")
    fin = (
        float(deadline_ms) / 1000.0
        if isinstance(deadline_ms, (int, float)) and deadline_ms > 0
        else time.time() + PAGE_BUDGET_S
    )
    session.echeance = fin
    zones = emprises(params)
    url = build_search_url(zones[0][1])
    if airbnb_circuit.open():
        return {
            "ok": False,
            "error": "HTTP 429",
            "rateLimited": True,
            "url": url,
            "attempts": 0,
        }
    proxy_url = str(params.get("proxy_url") or _proxy())
    sink = io.StringIO()
    started = time.perf_counter()
    rate_limited = False
    raws: list[Any] = []
    pages = 0
    advertised: int | None = None
    lues: list[str] = []
    seen: set[str] = set()
    budget = [MAX_REQUETES]
    try:
        with contextlib.redirect_stdout(sink):
            file = list(zones)
            while file and not rate_limited and budget[0] > 0 and _reste(fin) >= MARGE_REQUETE_S:
                nom, zone = file.pop(0)
                avant = len(seen)
                try:
                    r, p, rate_limited, publie, epuisee = _search_pages(
                        build_search_url(zone), proxy_url, max_pages, fin, seen, budget
                    )
                except Exception as err:
                    # Une emprise suivante qui échoue ne jette pas ce que les
                    # précédentes ont lu ; la première, elle, remonte comme avant.
                    if not raws:
                        raise
                    print(f"[airbnb] emprise {nom} : {err} — on garde ce qui est lu", file=sys.stderr)
                    break
                raws.extend(r)
                pages += p
                lues.append(f"{nom}:{p}p/{len(seen) - avant}+" + (f"/{publie}" if publie is not None else ""))
                if nom in ("proche", "unique"):
                    advertised = publie
                # L'emprise proche publie plus qu'Airbnb ne laisse paginer : ses
                # quarts passent avant l'emprise large, parce qu'ils sont dans
                # le domaine et elle en partie non.
                if nom == "proche" and epuisee and publie is not None and publie > PLAFOND_EMPRISE:
                    file[0:0] = [
                        (f"quart{i + 1}", {**zone, "bounds": q}) for i, q in enumerate(quadrants(zone["bounds"]))
                    ]
            print(f"[airbnb] emprises {' '.join(lues)} — {len(seen)} annonces", file=sys.stderr)
    except RateLimited as err:
        local = isinstance(err, RythmeLocal)
        quoi = "limiteur local" if local else f"HTTP {err.status}"
        print(f"[airbnb] {quoi} — pause {err.retry_after_s:.0f}s", file=sys.stderr)
        return {
            "ok": False,
            "error": "limiteur local : trop d'appels Airbnb récents" if local else "HTTP 429",
            "rateLimited": True,
            "url": url,
            "attempts": 1,
        }
    except Exception as err:
        if is_rate_limited(err):
            print(f"[airbnb] HTTP {http_status_of(err) or 429}", file=sys.stderr)
            return {
                "ok": False,
                "error": f"HTTP {http_status_of(err) or 429}",
                "rateLimited": True,
                "url": url,
                "attempts": 1,
            }
        invalidate()
        return {"ok": False, "error": f"pyairbnb: {err}", "url": url, "attempts": 1}
    ms_search = int((time.perf_counter() - started) * 1000)

    listings: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raws:
        for row in listings_from_raw(
            raw,
            check_in=str(check_in) if check_in else None,
            check_out=str(check_out) if check_out else None,
            adults=int(adults) if adults else None,
            min_guests=int(adults) if adults else None,
            min_bedrooms=int(min_bedrooms) if min_bedrooms else None,
        ):
            if row["id"] in seen:
                continue
            seen.add(row["id"])
            listings.append(row)
    listings.sort(key=par_prix)
    if not listings:
        return {
            "ok": False,
            "error": "HTTP 429" if rate_limited else "pyairbnb: aucune annonce",
            "rateLimited": rate_limited,
            "url": url,
            "attempts": 1,
        }
    enriched = 0
    ms_enrich = 0
    # Un 429 en pagination ouvre le coupe-circuit : on n'enchaîne pas 40
    # fiches PDP sur le même refus. skipEnrich reste honoré.
    max_enrich = int(params.get("maxEnrich") or 0) or 40
    if not params.get("skipEnrich") and not rate_limited and not airbnb_circuit.open():
        try:
            enrich_started = time.perf_counter()
            listings, enriched = enrich_listings(
                listings,
                check_in=str(check_in) if check_in else None,
                check_out=str(check_out) if check_out else None,
                adults=int(adults) if adults else None,
                proxy_url=proxy_url,
                min_guests=int(adults) if adults else None,
                max_n=max_enrich,
                budget_s=ENRICH_BUDGET_S,
            )
            ms_enrich = int((time.perf_counter() - enrich_started) * 1000)
            listings.sort(key=par_prix)
        except RateLimited:
            rate_limited = True
            enriched = 0
        except Exception:
            enriched = 0
    if not listings:
        return {
            "ok": False,
            "error": "pyairbnb: aucune annonce",
            "rateLimited": rate_limited,
            "url": url,
            "attempts": 1,
        }
    payload = {
        "source": "airbnb",
        "destination": params.get("city") or params.get("destination"),
        "checkIn": check_in,
        "checkOut": check_out,
        "listings": [row for row in listings],
    }
    return {
        "ok": True,
        "payload": payload,
        "url": url,
        "count": len(listings),
        "attempts": 1,
        "via": "pyairbnb+stl" if enriched else "pyairbnb",
        "pagesFetched": pages,
        "advertised": advertised,
        "isolated": True,
        "stlEnriched": enriched,
        "msSearch": ms_search,
        "msQuote": ms_enrich,
        "rateLimited": rate_limited,
    }


# Réexport pour que le sidecar puisse `from stays import run_search, pyairbnb`.
__all__ = ["run_search", "build_search_url", "bounds_from_point", "pyairbnb"]
