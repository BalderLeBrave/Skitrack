"""Moteur 1 : invisible_playwright (Firefox patché). Empreinte native, session chaude."""

from __future__ import annotations

from engines.base import BrowserSession, EngineError
from engines.browse import BrowseSession
from engines.page import prime_page
from logutil import event
from profile_store import profile_dir
from proxy import Proxy


class _InvisibleSession(BrowseSession):
    name = "invisible_playwright"

    def __init__(self, browser: object, page: object) -> None:
        super().__init__(page)
        self._browser = browser

    def close(self) -> None:
        try:
            close = getattr(self._browser, "close", None)
            if callable(close):
                close()
        except Exception:
            pass


class InvisibleEngine:
    name = "invisible_playwright"

    def available(self) -> bool:
        try:
            from invisible_playwright import InvisiblePlaywright  # noqa: F401
        except Exception:
            return False
        return True

    def open(self, *, proxy: Proxy | None, headless: bool, locale: str, timeout_s: float) -> BrowserSession:
        try:
            from invisible_playwright import InvisiblePlaywright
        except Exception as err:
            raise EngineError(f"invisible_playwright indisponible: {err}", unavailable=True) from err
        udir = str(profile_dir(self.name))
        base: dict = {}
        if proxy:
            base["proxy"] = proxy.as_playwright()
        attempts = (
            dict(base, user_data_dir=udir, headless=headless, locale=locale or "fr-FR"),
            dict(base, headless=headless, locale=locale or "fr-FR"),
            dict(base, headless=headless),
            dict(base, humanize=True),
            dict(base),
        )
        browser = None
        last_err: Exception | None = None
        ctx = None
        for attempt in attempts:
            try:
                ctx = InvisiblePlaywright(**attempt)
                browser = ctx.__enter__()
                break
            except TypeError as err:
                last_err = err
                continue
            except Exception as err:
                last_err = err
                break
        if browser is None:
            raise EngineError(f"invisible_playwright lancement: {last_err}", unavailable=True) from last_err
        try:
            page = browser.new_page()
            prime_page(page, locale or "fr-FR")
        except Exception as err:
            try:
                browser.close()
            except Exception:
                pass
            raise EngineError(f"invisible_playwright page: {err}") from err
        event("booking.engine.open", engine=self.name, proxy=proxy.host() if proxy else None, locale=locale)
        session = _InvisibleSession(browser, page)
        orig_close = session.close

        def close() -> None:
            orig_close()
            try:
                if ctx is not None:
                    ctx.__exit__(None, None, None)
            except Exception:
                pass

        session.close = close  # type: ignore[method-assign]
        return session
