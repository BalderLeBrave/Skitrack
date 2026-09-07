"""Provider Airbnb — pyairbnb (HTTP StaysSearch), isolé de Playwright.

Booking / VRBO gardent leur Chromium. Un sélecteur Booking ne peut pas
casser ce module : il n'importe ni playwright ni les extracteurs web.
"""
from __future__ import annotations

import sys
from pathlib import Path

from .base import BaseProvider, LodgingResult, LodgingSearchParams

_AIRBNB_ROOT = Path(__file__).resolve().parents[3] / "scrape" / "airbnb"
if str(_AIRBNB_ROOT) not in sys.path:
    sys.path.insert(0, str(_AIRBNB_ROOT))


class AirbnbProvider(BaseProvider):
    name = "airbnb"
    base_url = "https://www.airbnb.fr"

    def __init__(self, proxy_manager=None, captcha_solver=None):
        super().__init__(proxy_manager, captcha_solver)

    async def scrape(
        self,
        params: LodgingSearchParams,
        respect_robots: bool = False,
    ) -> list[LodgingResult]:
        from stays import run_search

        proxy_url = ""
        if self.proxy_manager:
            proxy = self.proxy_manager.get_random_proxy()
            if proxy:
                proxy_url = proxy if isinstance(proxy, str) else str(proxy)

        payload = {
            "city": params.destination,
            "checkIn": params.checkin.isoformat() if params.checkin else None,
            "checkOut": params.checkout.isoformat() if params.checkout else None,
            "adults": params.guests,
            "lat": params.latitude,
            "lon": params.longitude,
            "proxy_url": proxy_url,
            "maxPages": 8,
        }
        if params.latitude is not None and params.longitude is not None:
            payload["lat"] = params.latitude
            payload["lon"] = params.longitude

        out = run_search(payload)
        results: list[LodgingResult] = []
        if out.get("ok"):
            listings = ((out.get("payload") or {}).get("listings")) or []
            for row in listings:
                if len(results) >= params.max_results:
                    break
                total = None
                label = row.get("priceLabel") or ""
                digits = "".join(ch for ch in label if ch.isdigit())
                if digits:
                    try:
                        total = float(digits)
                    except ValueError:
                        total = None
                if total is None:
                    continue
                results.append(
                    LodgingResult(
                        title=str(row.get("name") or "")[:200],
                        price_per_night=total,
                        currency="EUR",
                        rating=None,
                        url=str(row.get("url") or ""),
                        image_url=row.get("image"),
                        source="airbnb",
                        location=params.destination,
                    )
                )

        if not results:
                raise RuntimeError(out.get("error") or "pyairbnb: aucune annonce avec total de séjour")

        self.logger.info("Total extrait: %s logements Airbnb (pyairbnb)", len(results))
        return results
