"""Empreinte navigateur, TLS et délais — partagés par les scrapers furtifs.

Ne réimplémente pas les workers : Airbnb passe par curl_cffi (scrape/airbnb),
Booking/Abritel par Playwright stealth (scrape/booking, scrape/abritel).
Ce module factorise ce que chaque worker recopiait.
"""

from __future__ import annotations

import asyncio
import random
from typing import Any

CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

CHROME_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": CHROME_UA,
}


def impersonate_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = dict(CHROME_HEADERS)
    if extra:
        headers.update(extra)
    return headers


async def human_pause(lo: float = 0.35, hi: float = 1.4) -> None:
    await asyncio.sleep(random.uniform(lo, hi))


def stealth_playwright(context: Any) -> Any:
    """Applique playwright-stealth si le paquet est là ; sinon no-op."""
    try:
        from playwright_stealth import Stealth

        stealth = Stealth()
        apply = getattr(stealth, "apply_stealth_async", None)
        if apply:
            return apply(context)
    except Exception:
        pass
    try:
        from playwright_stealth import stealth_async

        return stealth_async(context)
    except Exception:
        return context


def curl_session(impersonate: str = "chrome131"):
    """Session curl_cffi imitant TLS Chrome. None si le paquet manque."""
    try:
        from curl_cffi import requests as curl_requests

        return curl_requests.Session(impersonate=impersonate)
    except Exception:
        return None


class StickyProxyPool:
    """Un proxy résidentiel par session de recherche station, collant jusqu'à rotation.

    Sans liste configurée, `for_session` rend None : le scraper parle en direct.
    La rotation n'intervient qu'après un blocage (403/429/captcha), jamais à
    chaque requête — sinon on casse le sticky cookie Cloudflare.
    """

    def __init__(self, proxies: list[str] | None = None):
        self._proxies = [p for p in (proxies or []) if p]
        self._bind: dict[str, str] = {}

    def for_session(self, session_key: str) -> str | None:
        if not self._proxies:
            return None
        bound = self._bind.get(session_key)
        if bound:
            return bound
        chosen = self._proxies[hash(session_key) % len(self._proxies)]
        self._bind[session_key] = chosen
        return chosen

    def rotate(self, session_key: str) -> str | None:
        if not self._proxies:
            self._bind.pop(session_key, None)
            return None
        current = self._bind.get(session_key)
        rest = [p for p in self._proxies if p != current] or self._proxies
        chosen = random.choice(rest)
        self._bind[session_key] = chosen
        return chosen

    def playwright_kwargs(self, session_key: str) -> dict[str, str]:
        proxy = self.for_session(session_key)
        return {"proxy": {"server": proxy}} if proxy else {}

