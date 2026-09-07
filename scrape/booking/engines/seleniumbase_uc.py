"""Moteur 3 : SeleniumBase UC (repli Chromium). Session chaude, captcha seulement si défi."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from engines.base import BrowserSession, EngineError, Snapshot
from engines.browse import HOME
from engines.page import CARD_SEL
from logutil import Timer, event
from map import looks_blocked
from profile_store import profile_dir
from proxy import Proxy

HERE = Path(__file__).resolve().parents[1]


def chrome_bin() -> str | None:
    for key in ("SKITRACK_CHROME", "CHROME_BIN", "CHROMIUM_BIN"):
        env = os.environ.get(key, "").strip()
        if env and Path(env).is_file():
            return env
    local = HERE / ".browsers" / "chrome-linux64" / "chrome"
    if local.is_file():
        return str(local)
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        found = shutil.which(name)
        if found:
            return found
    return None


def _proxy_arg(proxy: Proxy | None) -> str | None:
    if not proxy:
        return None
    if proxy.username and proxy.password:
        host = proxy.server.split("://", 1)[-1]
        scheme = proxy.server.split("://", 1)[0] if "://" in proxy.server else "http"
        return f"{scheme}://{proxy.username}:{proxy.password}@{host}"
    return proxy.as_url()


class _UcSession:
    name = "seleniumbase_uc"

    def __init__(self, sb: object) -> None:
        self._sb = sb
        self._warmed = False

    def warmup(self, timeout_s: float) -> Snapshot:
        if self._warmed:
            return Snapshot(html="", url=HOME, ms=0)
        snap = self.goto(HOME, timeout_s)
        self._warmed = True
        if snap.blocked:
            raise EngineError("seleniumbase_uc: accueil bloqué", blocked=True)
        event("booking.engine.warmup", engine=self.name, ms=snap.ms)
        return snap

    def goto(self, url: str, timeout_s: float) -> Snapshot:
        sb = self._sb
        t = Timer()
        try:
            opener = getattr(sb, "uc_open_with_reconnect", None)
            if callable(opener):
                opener(url, 3)
            else:
                sb.open(url)
        except Exception as err:
            raise EngineError(f"seleniumbase_uc: navigation {err}") from err
        try:
            sb.click("#onetrust-accept-btn-handler", timeout=1)
        except Exception:
            pass
        expect_cards = "searchresults" in url
        if expect_cards:
            try:
                if hasattr(sb, "wait_for_element"):
                    sb.wait_for_element(CARD_SEL, timeout=min(6, timeout_s))
            except Exception:
                pass
            try:
                sb.execute_script("window.scrollTo(0, Math.floor(document.body.scrollHeight/2));")
            except Exception:
                pass
            try:
                sb.scroll_to_bottom()
            except Exception:
                pass
        html = ""
        final = url
        try:
            html = sb.get_page_source() or ""
            final = getattr(sb, "get_current_url", lambda: url)() or url
        except Exception as err:
            raise EngineError(f"seleniumbase_uc: lecture {err}", blocked=True) from err
        if looks_blocked(html, final):
            try:
                clicker = getattr(sb, "uc_gui_click_captcha", None)
                if callable(clicker):
                    clicker()
                    html = sb.get_page_source() or html
                    final = getattr(sb, "get_current_url", lambda: final)() or final
            except Exception:
                pass
        blocked = looks_blocked(html, final)
        snap = Snapshot(html=html, url=final, blocked=blocked, reason="challenge" if blocked else None, ms=t.ms())
        event("booking.page", engine=self.name, url=final, ms=snap.ms, blocked=blocked, bytes=len(html))
        return snap

    def close(self) -> None:
        try:
            self._sb.__exit__(None, None, None)
        except Exception:
            try:
                self._sb.quit()
            except Exception:
                pass


class SeleniumBaseEngine:
    name = "seleniumbase_uc"

    def available(self) -> bool:
        try:
            from seleniumbase import SB  # noqa: F401
        except Exception:
            return False
        return chrome_bin() is not None

    def open(self, *, proxy: Proxy | None, headless: bool, locale: str, timeout_s: float) -> BrowserSession:
        try:
            from seleniumbase import SB
        except Exception as err:
            raise EngineError(f"seleniumbase_uc indisponible: {err}", unavailable=True) from err
        binary = chrome_bin()
        if not binary:
            raise EngineError("seleniumbase_uc: Chromium absent", unavailable=True)
        os.environ.setdefault("CHROME_BIN", binary)
        kwargs: dict = {
            "uc": True,
            "locale": (locale or "fr-FR")[:2],
            "xvfb": bool(headless),
            "user_data_dir": str(profile_dir(self.name)),
            "binary_location": binary,
        }
        arg = _proxy_arg(proxy)
        if arg:
            kwargs["proxy"] = arg
        try:
            sb = SB(**kwargs)
            sb.__enter__()
        except TypeError:
            kwargs.pop("user_data_dir", None)
            kwargs.pop("binary_location", None)
            try:
                sb = SB(**kwargs)
                sb.__enter__()
            except Exception as err:
                raise EngineError(f"seleniumbase_uc lancement: {err}", unavailable=True) from err
        except Exception as err:
            raise EngineError(f"seleniumbase_uc lancement: {err}", unavailable=True) from err
        event("booking.engine.open", engine=self.name, proxy=proxy.host() if proxy else None, locale=locale)
        return _UcSession(sb)
