"""Façade production du relevé Booking — un process, une source.

Ce n’est **pas** un second Chromium CDP. Booking 2026 détecte `navigator.webdriver`
injecté à la main, les UA aléatoires et `set_extra_http_headers`. Ici :

1. Stealth = moteurs déjà isolés (Crawlbase / ScrapingBee / Camoufox / UC).
2. dest_id via autocomplete Omkar + cache (sinon accueil `errorc_searchstring_not_found`).
3. Circuit breaker + rotation proxy = failover.py / proxy.py.
4. DOM = map.py (totaux de séjour, logement entier).
5. Export JSON/CSV horodaté = store.py.

Les 5 piliers sont dans ce module + dest.py / urls.py / failover.py / map.py.
"""

from __future__ import annotations

import logging
from typing import Any

from dest import Destination, attach_destination, resolve_destination
from logutil import event, setup_logging
from search import run_search
from store import write_results
from urls import search_url


class BookingScraperEngine:
    def __init__(self, config: dict[str, Any] | None = None) -> None:
        setup_logging()
        self.config = dict(config or {})
        self.log = logging.getLogger("skitrack.booking")
        self.last: dict[str, Any] | None = None

    def resolve_dest(self, destination: str, *, refresh: bool = False) -> Destination | None:
        dest = resolve_destination(destination, refresh=refresh)
        event(
            "booking.dest",
            query=destination,
            dest_id=dest.dest_id if dest else None,
            dest_type=dest.dest_type if dest else None,
            source=dest.source if dest else None,
        )
        if not dest:
            self.log.warning("dest_id introuvable pour %s — Booking renverra l’accueil", destination)
        return dest

    def search_url(self, **params: Any) -> str:
        return search_url(attach_destination(params), 0)

    def search(
        self,
        destination: str,
        check_in: str,
        check_out: str,
        *,
        adults: int = 8,
        children: int = 0,
        output_dir: str | None = None,
        **extra: Any,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "destination": destination,
            "checkIn": check_in,
            "checkOut": check_out,
            "adults": adults,
            "children": children,
            **self.config,
            **extra,
        }
        if output_dir:
            params["outputDir"] = output_dir
        dest = self.resolve_dest(destination)
        if dest:
            params.update(dest.as_params())
        self.log.info(
            "search %s %s→%s dest_id=%s",
            destination,
            check_in,
            check_out,
            dest.dest_id if dest else "none",
        )
        out = run_search(params)
        self.last = out
        return out

    def save(self, listings: list[dict[str, Any]], output_dir: str, extra: dict[str, Any] | None = None) -> dict[str, str]:
        return write_results(listings, output_dir, extra=extra)


if __name__ == "__main__":
    engine = BookingScraperEngine()
    result = engine.search("Les 2 Alpes", "2027-02-06", "2027-02-13", adults=8)
    print(
        {
            "ok": result.get("ok"),
            "count": result.get("count"),
            "via": result.get("via"),
            "url": result.get("url"),
            "error": result.get("error"),
        }
    )
