#!/usr/bin/env python3
from __future__ import annotations

import json
import pathlib
import sys
import unittest
from typing import Any
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from engines.base import Snapshot  # noqa: E402
from failover import run_engines  # noqa: E402
from proxy import ProxyPool  # noqa: E402
from config import Settings  # noqa: E402


class _FakeResp:
    def __init__(self, payload: dict) -> None:
        self._raw = json.dumps(payload).encode()

    def read(self) -> bytes:
        return self._raw

    def __enter__(self) -> "_FakeResp":
        return self

    def __exit__(self, *args: object) -> None:
        return None


class CrawlbaseTests(unittest.TestCase):
    def test_maps_autoparse_via_failover(self) -> None:
        payload = {
            "pc_status": 200,
            "original_status": 200,
            "url": "https://www.booking.com/searchresults.fr.html?ss=Les+2+Alpes&checkin=2027-02-06&checkout=2027-02-13&group_adults=8",
            "body": {
                "propertyCount": 25,
                "properties": [
                    {
                        "name": "Chalet 8 pers.",
                        "url": "https://www.booking.com/hotel/fr/chalet-ok.fr.html",
                        "price": "€ 1 990",
                        "priceAmount": 1990,
                    }
                ],
            },
        }

        class _Sess:
            name = "crawlbase"

            def goto(self, url: str, timeout_s: float) -> Snapshot:
                from map import listings_from_autoparse

                rows = listings_from_autoparse(payload["body"], url=url, engine="crawlbase")
                return Snapshot(html="", url=url, ms=9, listings=rows)

            def close(self) -> None:
                return None

        class _Eng:
            name = "crawlbase"

            def available(self) -> bool:
                return True

            def open(self, **_: Any) -> _Sess:
                return _Sess()

        out = run_engines(
            {
                "destination": "Les 2 Alpes",
                "checkIn": "2027-02-06",
                "checkOut": "2027-02-13",
                "adults": 8,
            },
            Settings(max_pages=1, retries_per_engine=1, crawl_delay_seconds=0.4, jitter_min=0, jitter_max=0).clamp(),
            pool=ProxyPool([]),
            sleep=lambda _: None,
            engines=[_Eng()],
        )
        self.assertTrue(out["ok"], out)
        self.assertEqual(out["via"], "crawlbase")
        self.assertEqual(out["results"][0]["totalPrice"], 1990)

    def test_query_uses_autoparse(self) -> None:
        import crawlbase

        seen: list[str] = []

        def fake_urlopen(req: Any, timeout: float = 0):  # noqa: ARG001
            seen.append(req.full_url)
            return _FakeResp(
                {
                    "pc_status": 200,
                    "original_status": 200,
                    "url": "https://www.booking.com/searchresults.fr.html",
                    "body": {"properties": []},
                }
            )

        prev_tok = __import__("os").environ.get("CRAWLBASE_TOKEN")
        __import__("os").environ["CRAWLBASE_TOKEN"] = "test-token"
        orig = crawlbase.urllib.request.urlopen
        crawlbase.urllib.request.urlopen = fake_urlopen  # type: ignore[method-assign]
        try:
            data = crawlbase.fetch("https://www.booking.com/searchresults.fr.html")
            self.assertEqual(data["pc_status"], 200)
            q = parse_qs(urlparse(seen[0]).query)
            self.assertEqual(q.get("autoparse"), ["true"])
            self.assertEqual(q.get("token"), ["test-token"])
            self.assertNotIn("token=test-token", json.dumps(data))
        finally:
            crawlbase.urllib.request.urlopen = orig  # type: ignore[method-assign]
            if prev_tok is None:
                __import__("os").environ.pop("CRAWLBASE_TOKEN", None)
            else:
                __import__("os").environ["CRAWLBASE_TOKEN"] = prev_tok


if __name__ == "__main__":
    unittest.main()
