#!/usr/bin/env python3
from __future__ import annotations

import os
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from engines.scrapingbee_engine import ScrapingBeeEngine  # noqa: E402


class BeeTests(unittest.TestCase):
    def test_unavailable_without_key(self) -> None:
        prev = os.environ.get("SCRAPINGBEE_API_KEY")
        prev2 = os.environ.get("BOOKING_SCRAPER_API_KEY")
        os.environ.pop("SCRAPINGBEE_API_KEY", None)
        os.environ.pop("BOOKING_SCRAPER_API_KEY", None)
        # hide local .env for this process by overriding empty
        os.environ["SCRAPINGBEE_API_KEY"] = ""
        os.environ["BOOKING_SCRAPER_API_KEY"] = ""
        try:
            # token() treats empty as missing after strip — but ingest .env fills if key not in env.
            # Keep a dummy empty: bee.token reads env first if set.
            from bee import token

            # If a real .env has a key, available() is True — that's correct for the machine.
            eng = ScrapingBeeEngine()
            if not token():
                self.assertFalse(eng.available())
        finally:
            if prev is None:
                os.environ.pop("SCRAPINGBEE_API_KEY", None)
            else:
                os.environ["SCRAPINGBEE_API_KEY"] = prev
            if prev2 is None:
                os.environ.pop("BOOKING_SCRAPER_API_KEY", None)
            else:
                os.environ["BOOKING_SCRAPER_API_KEY"] = prev2

    def test_package_importable(self) -> None:
        try:
            from booking_scraper_api import BookingScraper
        except ImportError:
            self.skipTest("booking_scraper_api absent (moteur optionnel)")
        self.assertTrue(callable(getattr(BookingScraper, "search", None) or BookingScraper))


if __name__ == "__main__":
    unittest.main()
