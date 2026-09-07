"""Moteurs Booking, chargés à la demande (pas d’import croisé Airbnb)."""

from __future__ import annotations

from collections.abc import Callable

from config import ENGINE_ORDER
from engines.base import Engine, EngineError

Loader = Callable[[], Engine]


def _load_omkar() -> Engine:
    from engines.omkar_engine import OmkarEngine

    return OmkarEngine()


def _load_crawlbase() -> Engine:
    from engines.crawlbase_engine import CrawlbaseEngine

    return CrawlbaseEngine()


def _load_scrapingbee() -> Engine:
    from engines.scrapingbee_engine import ScrapingBeeEngine

    return ScrapingBeeEngine()


def _load_invisible() -> Engine:
    from engines.invisible import InvisibleEngine

    return InvisibleEngine()


def _load_camoufox() -> Engine:
    from engines.camoufox_engine import CamoufoxEngine

    return CamoufoxEngine()


def _load_selenium() -> Engine:
    from engines.seleniumbase_uc import SeleniumBaseEngine

    return SeleniumBaseEngine()


LOADERS: dict[str, Loader] = {
    "omkar": _load_omkar,
    "crawlbase": _load_crawlbase,
    "scrapingbee": _load_scrapingbee,
    "invisible_playwright": _load_invisible,
    "camoufox": _load_camoufox,
    "seleniumbase_uc": _load_selenium,
}


def load_engine(name: str) -> Engine:
    loader = LOADERS.get(name)
    if not loader:
        raise EngineError(f"moteur inconnu: {name}", unavailable=True)
    return loader()


def ordered_engines(names: tuple[str, ...] | list[str] | None = None) -> list[Engine]:
    wanted = tuple(names) if names else ENGINE_ORDER
    out: list[Engine] = []
    for name in wanted:
        if name not in LOADERS:
            continue
        try:
            engine = load_engine(name)
        except Exception:
            continue
        out.append(engine)
    return out
