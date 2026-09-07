"""Moteur 0 : Crawlbase (HTTP, autoparse). Pas de navigateur local, pas de proxy ouvert."""

from __future__ import annotations

from engines.base import EngineError, Snapshot
from logutil import Timer, event
from map import listings_from_autoparse, looks_blocked
from proxy import Proxy


def _sid(proxy: Proxy | None) -> str:
    if proxy and proxy.username:
        return proxy.username[-32:]
    return "skitrackbooking"


class _CrawlbaseSession:
    name = "crawlbase"

    def __init__(self, session: str, timeout_s: float) -> None:
        self._session = session
        self._timeout = max(12.0, timeout_s)

    def goto(self, url: str, timeout_s: float) -> Snapshot:
        from crawlbase import fetch

        t = Timer()
        wait = max(self._timeout, timeout_s)
        try:
            data = fetch(url, autoparse=True, session=self._session, timeout_s=wait)
        except RuntimeError as err:
            msg = str(err)
            blocked = "401" not in msg and "jeton" not in msg
            unavailable = "401" in msg or "jeton" in msg or "403" in msg
            raise EngineError(msg, blocked=blocked, unavailable=unavailable) from err
        ms = t.ms()
        final = str(data.get("url") or url)
        pc = int(data.get("pc_status") or 0)
        orig = int(data.get("original_status") or 0)
        body = data.get("body")
        event("booking.crawlbase.page", pc=pc, orig=orig, ms=ms, url=final[:80])
        if pc in (401, 403):
            raise EngineError("crawlbase: jeton refusé", unavailable=True)
        if isinstance(body, dict):
            listings = listings_from_autoparse(body, url=url, engine=self.name)
            if listings:
                return Snapshot(html="", url=final, ms=ms, listings=listings)
            if orig in (301, 302) and "index." in final:
                return Snapshot(html="", url=final, blocked=True, reason="redirect-accueil", ms=ms, listings=[])
            return Snapshot(html="", url=final, ms=ms, listings=[])
        html = body if isinstance(body, str) else ""
        if looks_blocked(html, final) or orig in (403, 429, 503):
            return Snapshot(html=html, url=final, blocked=True, reason=f"http-{orig or pc}", ms=ms)
        return Snapshot(html=html, url=final, ms=ms)

    def close(self) -> None:
        return None


class CrawlbaseEngine:
    name = "crawlbase"

    def available(self) -> bool:
        from crawlbase import token

        return bool(token())

    def open(self, *, proxy: Proxy | None, headless: bool, locale: str, timeout_s: float) -> _CrawlbaseSession:
        if not self.available():
            raise EngineError("crawlbase: jeton absent", unavailable=True)
        return _CrawlbaseSession(_sid(proxy), timeout_s)
