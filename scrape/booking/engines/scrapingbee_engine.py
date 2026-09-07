"""Moteur ScrapingBee via booking-scraper-api. Pas de navigateur local."""

from __future__ import annotations

from engines.base import EngineError, Snapshot
from logutil import Timer, event
from map import listings_from_bee, looks_blocked
from proxy import Proxy


class _BeeSession:
    name = "scrapingbee"

    def __init__(self, api_key: str, timeout_s: float) -> None:
        self._key = api_key
        self._timeout = max(20.0, timeout_s)

    def goto(self, url: str, timeout_s: float) -> Snapshot:
        from booking_scraper_api import BookingScraper

        t = Timer()
        wait = int(max(self._timeout, timeout_s))
        scraper = BookingScraper(self._key, timeout=wait)
        kwargs = {
            "country_code": "fr",
            "wait": 4000,
            "premium_proxy": True,
            "render_js": True,
        }
        try:
            raw = scraper.scrape(url, **kwargs)
        except Exception as err:
            msg = str(err)
            unavailable = any(code in msg for code in ("401", "403", "api_key", "Unauthorized"))
            raise EngineError(f"scrapingbee: {err}", blocked=not unavailable, unavailable=unavailable) from err
        ms = t.ms()
        event("booking.scrapingbee.page", ms=ms, url=url[:80], kind=type(raw).__name__)
        if isinstance(raw, dict):
            listings = listings_from_bee(raw, url=url, engine=self.name)
            if listings:
                return Snapshot(html="", url=url, ms=ms, listings=listings)
            return Snapshot(html="", url=url, ms=ms, listings=[])
        html = raw if isinstance(raw, str) else ""
        if looks_blocked(html, url):
            try:
                raw2 = scraper.scrape(url, stealth_proxy=True, country_code="fr", wait=5000, render_js=True)
            except Exception as err:
                raise EngineError(f"scrapingbee stealth: {err}", blocked=True) from err
            if isinstance(raw2, dict):
                listings = listings_from_bee(raw2, url=url, engine=self.name)
                return Snapshot(html="", url=url, ms=t.ms(), listings=listings)
            html = raw2 if isinstance(raw2, str) else html
            if looks_blocked(html, url):
                return Snapshot(html=html, url=url, blocked=True, reason="challenge", ms=t.ms())
        return Snapshot(html=html, url=url, ms=ms)

    def close(self) -> None:
        return None


class ScrapingBeeEngine:
    name = "scrapingbee"

    def available(self) -> bool:
        from bee import token

        if not token():
            return False
        try:
            from booking_scraper_api import BookingScraper  # noqa: F401
        except Exception:
            return False
        return True

    def open(self, *, proxy: Proxy | None, headless: bool, locale: str, timeout_s: float) -> _BeeSession:
        from bee import token

        key = token()
        if not key:
            raise EngineError("scrapingbee: jeton absent", unavailable=True)
        return _BeeSession(key, timeout_s)
