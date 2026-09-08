"""Scraping furtif + normalisation vers CanonicalListing.

Les workers isolés (`scrape/airbnb`, `scrape/booking`, …) restent la source
d'extraction. Ce paquet :
* partage empreinte TLS / Playwright stealth / délais ;
* convertit chaque brut en `CanonicalListing` ;
* n'invente jamais une altitude ou une distance.
"""

from .canonical import CanonicalListing, FieldQuality
from .normalize import normalize
from .stealth import StickyProxyPool, curl_session, human_pause, impersonate_headers, stealth_playwright

__all__ = [
    "CanonicalListing",
    "FieldQuality",
    "StickyProxyPool",
    "curl_session",
    "human_pause",
    "impersonate_headers",
    "normalize",
    "stealth_playwright",
]
