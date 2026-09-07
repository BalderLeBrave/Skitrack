#!/usr/bin/env python3
from __future__ import annotations

import os
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from config import ENGINE_ORDER, load_settings  # noqa: E402
from delays import crawl_pause, human_pause  # noqa: E402
from headers import browser_headers  # noqa: E402
from proxy import ProxyPool, load_bundled_open, load_proxies, parse_proxy  # noqa: E402
from urls import search_url  # noqa: E402


class ConfigTests(unittest.TestCase):
    def test_engine_order(self) -> None:
        self.assertEqual(ENGINE_ORDER[0], "omkar")
        self.assertEqual(ENGINE_ORDER[1], "crawlbase")
        self.assertEqual(ENGINE_ORDER[2], "scrapingbee")
        self.assertEqual(ENGINE_ORDER[3], "invisible_playwright")
        self.assertEqual(ENGINE_ORDER[4], "camoufox")
        self.assertEqual(ENGINE_ORDER[5], "seleniumbase_uc")

    def test_url_stay_total(self) -> None:
        first = search_url({"destination": "Les 2 Alpes", "checkIn": "2027-02-06", "checkOut": "2027-02-13", "adults": 8}, 0)
        url = search_url({"destination": "Les 2 Alpes", "checkIn": "2027-02-06", "checkOut": "2027-02-13", "adults": 8}, 25)
        self.assertIn("sb_price_type=total", url)
        self.assertIn("privacy_type%3D3", url)
        self.assertIn("offset=25", url)
        self.assertIn("ss=Les+2+Alpes", url)
        self.assertIn("src=index", first)
        self.assertIn("src=searchresults", url)
        self.assertNotIn("offset=", first)

    def test_headers_fr(self) -> None:
        h = browser_headers()
        self.assertIn("fr-FR", h["Accept-Language"])
        self.assertNotIn("Pragma", h)
        self.assertNotIn("Cache-Control", h)
        self.assertNotIn("Sec-Fetch-Site", h)

    def test_proxy_parse(self) -> None:
        p = parse_proxy("http://user:pass@gate.example:7777")
        self.assertIsNotNone(p)
        assert p is not None
        self.assertEqual(p.username, "user")
        self.assertEqual(p.as_playwright()["server"], "http://gate.example:7777")

    def test_brightdata_residential_fr(self) -> None:
        from brightdata import residential_from_ws
        from proxy import with_country, with_sticky

        url = residential_from_ws(
            "wss://brd-customer-abc-zone-scraping_browser:secret@brd.superproxy.io:9222"
        )
        self.assertIsNotNone(url)
        assert url is not None
        self.assertIn("brd.superproxy.io:33335", url)
        self.assertIn("zone-residential", url)
        self.assertIn("country-fr", url)
        self.assertNotIn("scraping_browser", url)
        p = parse_proxy(url)
        assert p is not None
        sticky = with_sticky(with_country(p, "fr"), "deadbeef12")
        self.assertIn("session-deadbeef12", sticky.username or "")

    def test_crawl_delay(self) -> None:
        slept: list[float] = []
        settings = load_settings({"crawlDelaySeconds": 1.5, "jitterMin": 0.4, "jitterMax": 0.4})
        n = crawl_pause(settings, sleep=slept.append)
        self.assertGreaterEqual(n, 1.9)
        self.assertEqual(slept[0], n)
        api: list[float] = []
        human_pause(sleep=api.append, engine="crawlbase")
        self.assertLess(api[0], 0.5)
        browser: list[float] = []
        human_pause(sleep=browser.append, engine="camoufox")
        self.assertGreaterEqual(browser[0], 0.7)

    def test_dead_proxy_skipped(self) -> None:
        a = parse_proxy("http://10.0.0.1:8080")
        b = parse_proxy("http://10.0.0.2:8080")
        assert a and b
        pool = ProxyPool([a, b])
        first = pool.next()
        assert first is not None
        pool.mark_dead(first)
        second = pool.next()
        assert second is not None
        self.assertNotEqual(second.host(), first.host())

    def test_bundled_open_list(self) -> None:
        os.environ["SKITRACK_PROXYSCRAPE_REFRESH"] = "0"
        bundled = load_bundled_open(cap=10)
        self.assertGreaterEqual(len(bundled), 2)
        self.assertTrue(
            any(p.host() in {"51.178.49.241", "213.199.47.140", "37.59.110.73"} for p in bundled[:8]),
            [p.host() for p in bundled[:8]],
        )
        prev_ps = os.environ.get("SKITRACK_PROXYSCRAPE")
        os.environ["SKITRACK_PROXYSCRAPE"] = "0"
        try:
            iplocate = load_bundled_open(cap=10)
            self.assertTrue(
                any(p.host() == "15.224.107.208" for p in iplocate[:4]),
                [p.host() for p in iplocate[:4]],
            )
        finally:
            if prev_ps is None:
                os.environ.pop("SKITRACK_PROXYSCRAPE", None)
            else:
                os.environ["SKITRACK_PROXYSCRAPE"] = prev_ps
        prev = os.environ.get("SKITRACK_PROXY_FREE")
        os.environ["SKITRACK_PROXY_FREE"] = "0"
        try:
            self.assertEqual(load_bundled_open(), [])
        finally:
            if prev is None:
                os.environ.pop("SKITRACK_PROXY_FREE", None)
            else:
                os.environ["SKITRACK_PROXY_FREE"] = prev
        listed = load_proxies()
        self.assertGreaterEqual(len(listed), 2)
        self.assertEqual(listed[0].kind, "open")



if __name__ == "__main__":
    unittest.main()
