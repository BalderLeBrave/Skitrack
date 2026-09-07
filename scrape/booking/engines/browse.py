"""Session Playwright-like : accueil d’abord, même referer, pas d’en-têtes forcés.

Camoufox / invisible_playwright posent déjà TLS + UA. Les écraser (User-Agent
générique, Sec-Fetch-Site: none, Cache-Control: no-cache) est exactement ce
que Booking détecte. Ici on ne touche pas à l’empreinte : on se comporte
comme quelqu’un qui arrive de Google, accepte les cookies, puis cherche.
"""

from __future__ import annotations

from engines.base import EngineError, Snapshot
from engines.page import settle, wander
from logutil import Timer, event
from map import looks_blocked

HOME = "https://www.booking.com/index.fr.html"
LANDING = "https://www.google.fr/"


class BrowseSession:
    name = "browse"

    def __init__(self, page: object) -> None:
        self._page = page
        self._referer = LANDING
        self._warmed = False

    def warmup(self, timeout_s: float) -> Snapshot:
        if self._warmed:
            return Snapshot(html="", url=HOME, ms=0)
        snap = self.goto(HOME, timeout_s)
        self._warmed = True
        if snap.blocked:
            raise EngineError(f"{self.name}: accueil bloqué", blocked=True)
        event("booking.engine.warmup", engine=self.name, ms=snap.ms, url=snap.url)
        return snap

    def goto(self, url: str, timeout_s: float) -> Snapshot:
        page = self._page
        t = Timer()
        timeout_ms = int(max(4.0, timeout_s) * 1000)
        try:
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms, referer=self._referer)
            except TypeError:
                page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        except Exception as err:
            raise EngineError(f"{self.name}: navigation {err}") from err
        settle(page, timeout_s, expect_cards="searchresults" in url)
        wander(page)
        html = ""
        final = url
        try:
            html = page.content() or ""
            final = page.url or url
        except Exception as err:
            raise EngineError(f"{self.name}: lecture {err}", blocked=True) from err
        self._referer = final
        blocked = looks_blocked(html, final)
        snap = Snapshot(html=html, url=final, blocked=blocked, reason="challenge" if blocked else None, ms=t.ms())
        event("booking.page", engine=self.name, url=final, ms=snap.ms, blocked=blocked, bytes=len(html))
        return snap
