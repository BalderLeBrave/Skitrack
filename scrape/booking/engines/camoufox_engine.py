"""Moteur 2 : Camoufox. On ne touche pas à son empreinte Firefox."""

from __future__ import annotations

from engines.base import BrowserSession, EngineError
from engines.browse import BrowseSession
from engines.page import prime_page
from logutil import event
from profile_store import profile_dir
from proxy import Proxy


class _CamoufoxSession(BrowseSession):
    name = "camoufox"

    def __init__(self, cm: object, browser: object, page: object) -> None:
        super().__init__(page)
        self._cm = cm
        self._browser = browser

    def close(self) -> None:
        try:
            self._cm.__exit__(None, None, None)
        except Exception:
            try:
                close = getattr(self._browser, "close", None)
                if callable(close):
                    close()
            except Exception:
                pass


class CamoufoxEngine:
    name = "camoufox"

    def available(self) -> bool:
        try:
            from camoufox.sync_api import Camoufox  # noqa: F401
        except Exception:
            return False
        return True

    def open(self, *, proxy: Proxy | None, headless: bool, locale: str, timeout_s: float) -> BrowserSession:
        try:
            from camoufox.sync_api import Camoufox
        except Exception as err:
            raise EngineError(f"camoufox indisponible: {err}", unavailable=True) from err
        udir = str(profile_dir(self.name))
        base: dict = {
            "headless": "virtual" if headless else False,
            "humanize": True,
            "locale": locale or "fr-FR",
            "os": "windows",
            "geoip": True,
        }
        if proxy:
            base["proxy"] = proxy.as_playwright()
        attempts = (
            dict(base, user_data_dir=udir, persistent_context=True),
            dict(base, user_data_dir=udir),
            dict(base),
            dict({k: v for k, v in base.items() if k != "geoip"}, geoip=bool(proxy)),
        )
        cm = None
        browser = None
        last_err: Exception | None = None
        for kwargs in attempts:
            try:
                cm = Camoufox(**kwargs)
                browser = cm.__enter__()
                break
            except TypeError as err:
                last_err = err
                if proxy and "proxy" in kwargs:
                    kwargs = dict(kwargs)
                    kwargs["proxy"] = proxy.as_url()
                    try:
                        cm = Camoufox(**kwargs)
                        browser = cm.__enter__()
                        break
                    except Exception as err2:
                        last_err = err2
                        continue
                continue
            except Exception as err:
                last_err = err
                continue
        if browser is None or cm is None:
            raise EngineError(f"camoufox lancement: {last_err}", unavailable=True) from last_err
        try:
            new_page = getattr(browser, "new_page", None)
            page = new_page() if callable(new_page) else browser
            prime_page(page, locale or "fr-FR")
        except Exception as err:
            try:
                cm.__exit__(None, None, None)
            except Exception:
                pass
            raise EngineError(f"camoufox page: {err}") from err
        event("booking.engine.open", engine=self.name, proxy=proxy.host() if proxy else None, locale=locale)
        return _CamoufoxSession(cm, browser, page)
