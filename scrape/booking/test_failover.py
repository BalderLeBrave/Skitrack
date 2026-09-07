#!/usr/bin/env python3
"""Bascule : défi → moteur suivant tout de suite ; le moteur fiable d’abord."""

from __future__ import annotations

import pathlib
import sys
import unittest
from typing import Any

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from config import Settings  # noqa: E402
from engines.base import EngineError, Snapshot  # noqa: E402
from failover import run_engines  # noqa: E402
from proxy import ProxyPool  # noqa: E402
from state import EngineState  # noqa: E402

CARD = """
<html><body>
<div data-testid="property-card" data-hotel-id="1">
  <a href="https://www.booking.com/hotel/fr/ok.fr.html">
    <div data-testid="title">Chalet OK</div>
  </a>
  <div data-testid="price-and-discounted-price">2 100 €</div>
  <div data-testid="recommended-units">Chalet • 4 chambres • 8 personnes</div>
</div>
</body></html>
"""


class _Sess:
    def __init__(self, html: str, name: str, blocked: bool = False) -> None:
        self.name = name
        self._html = html
        self._blocked = blocked
        self.closed = False
        self.warms = 0

    def warmup(self, timeout_s: float) -> Snapshot:
        self.warms += 1
        if self._blocked:
            raise EngineError(f"{self.name} warmup", blocked=True)
        return Snapshot(html="<html>accueil</html>", url="https://www.booking.com/index.fr.html", ms=4)

    def goto(self, url: str, timeout_s: float) -> Snapshot:
        if self._blocked:
            raise EngineError(f"{self.name} challenge", blocked=True)
        return Snapshot(html=self._html, url=url, blocked=False, ms=12)

    def close(self) -> None:
        self.closed = True


class _Eng:
    def __init__(self, name: str, html: str = "", *, available: bool = True, blocked: bool = False) -> None:
        self.name = name
        self._html = html
        self._available = available
        self._blocked = blocked
        self.opens = 0
        self.last: _Sess | None = None

    def available(self) -> bool:
        return self._available

    def open(self, **_: Any) -> _Sess:
        self.opens += 1
        self.last = _Sess(self._html, self.name, blocked=self._blocked)
        return self.last



def _settings(**kwargs: Any) -> Settings:
    base = dict(max_pages=1, retries_per_engine=1, crawl_delay_seconds=0.4, jitter_min=0, jitter_max=0)
    base.update(kwargs)
    return Settings(**base).clamp()


class FailoverTests(unittest.TestCase):
    def test_order_and_skip(self) -> None:
        first = _Eng("invisible_playwright", blocked=True)
        second = _Eng("camoufox", CARD)
        third = _Eng("seleniumbase_uc", CARD)
        out = run_engines(
            {"destination": "Les 2 Alpes", "checkIn": "2027-02-06", "checkOut": "2027-02-13", "adults": 8},
            _settings(),
            pool=ProxyPool([]),
            sleep=lambda _: None,
            engines=[first, second, third],
            state=EngineState(path=None, data={}),
        )
        self.assertTrue(out["ok"])
        self.assertEqual(out["via"], "camoufox")
        self.assertEqual(out["count"], 1)
        self.assertEqual(first.opens, 1)
        self.assertEqual(second.opens, 1)
        self.assertEqual(third.opens, 0)

    def test_unavailable_then_success(self) -> None:
        missing = _Eng("invisible_playwright", available=False)
        ok = _Eng("camoufox", CARD)
        out = run_engines(
            {"destination": "Les 2 Alpes", "adults": 8, "checkIn": "2027-02-06", "checkOut": "2027-02-13"},
            _settings(),
            pool=ProxyPool([]),
            sleep=lambda _: None,
            engines=[missing, ok],
            state=EngineState(path=None, data={}),
        )
        self.assertEqual(out["via"], "camoufox")
        self.assertEqual(missing.opens, 0)

    def test_blocked_not_retried_without_proxy(self) -> None:
        first = _Eng("invisible_playwright", blocked=True)
        second = _Eng("camoufox", CARD)
        slept: list[float] = []
        out = run_engines(
            {"destination": "Les 2 Alpes", "checkIn": "2027-02-06", "checkOut": "2027-02-13", "adults": 8},
            _settings(retries_per_engine=2),
            pool=ProxyPool([]),
            sleep=slept.append,
            engines=[first, second],
            state=EngineState(path=None, data={}),
        )
        self.assertEqual(out["via"], "camoufox")
        self.assertEqual(first.opens, 1)
        self.assertLessEqual(len(slept), 1)

    def test_last_good_tried_first(self) -> None:
        first = _Eng("invisible_playwright", CARD)
        second = _Eng("camoufox", CARD)
        state = EngineState(path=None, data={"lastGood": "camoufox"})
        out = run_engines(
            {"destination": "Les 2 Alpes", "checkIn": "2027-02-06", "checkOut": "2027-02-13", "adults": 8},
            _settings(),
            pool=ProxyPool([]),
            sleep=lambda _: None,
            engines=[first, second],
            state=state,
        )
        self.assertEqual(out["via"], "camoufox")
        self.assertEqual(second.opens, 1)
        self.assertEqual(first.opens, 0)

    def test_warmup_before_search(self) -> None:
        ok = _Eng("camoufox", CARD)
        out = run_engines(
            {"destination": "Les 2 Alpes", "checkIn": "2027-02-06", "checkOut": "2027-02-13", "adults": 8},
            _settings(),
            pool=ProxyPool([]),
            sleep=lambda _: None,
            engines=[ok],
            state=EngineState(path=None, data={}),
        )
        self.assertTrue(out["ok"])
        self.assertEqual(ok.opens, 1)
        self.assertIsNotNone(ok.last)
        self.assertEqual(ok.last.warms, 1)


if __name__ == "__main__":
    unittest.main()
