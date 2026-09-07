#!/usr/bin/env python3
from __future__ import annotations

import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from parse import parse_abritel_hits  # noqa: E402
from stealth import STEALTH_JS, USER_AGENT  # noqa: E402
from urls import canonical_abritel_url, cozy_search_url, is_abritel_family  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
PAYLOAD = json.loads((HERE / "fixtures" / "cozy_abritel_duplex.json").read_text(encoding="utf-8"))


class AbritelParseTests(unittest.TestCase):
    def test_cozy_path(self) -> None:
        url = cozy_search_url("Les 2 Alpes", "2027-02-06", "2027-02-13", adults=8, bedrooms=4)
        self.assertIn("Les%20Deux%20Alpes", url)
        self.assertIn("/4-8-0/results", url)

    def test_canonical(self) -> None:
        raw = "https://prf.hn/click/camref:x/destination:https://www.abritel.fr/location-vacances/p6410325a?mpd=EUR&mpe=1"
        url = canonical_abritel_url(raw, check_in="2027-02-13", check_out="2027-02-20", adults=8)
        self.assertTrue(url.startswith("https://www.abritel.fr/location-vacances/p6410325a"))
        self.assertIn("startDate=2027-02-13", url)
        self.assertIn("adults=8", url)
        self.assertNotIn("mpd=", url)
        self.assertNotIn("camref", url)

    def test_family(self) -> None:
        self.assertTrue(is_abritel_family("abritel", "abritel.fr", ""))
        self.assertTrue(is_abritel_family("vrbo", "", "https://www.vrbo.com/x"))
        self.assertFalse(is_abritel_family("booking", "booking.com", ""))

    def test_stealth_hides_webdriver(self) -> None:
        self.assertIn("webdriver", STEALTH_JS)
        self.assertIn("Chrome/", USER_AGENT)

    def test_payload(self) -> None:
        hits = parse_abritel_hits(PAYLOAD)
        self.assertEqual(len(hits), 1)
        h = hits[0]
        self.assertEqual(h["totalPrice"], 3363.28)
        self.assertEqual(h["guests"], 8)
        self.assertEqual(h["bedrooms"], 4)
        self.assertEqual(h["priceConfidence"], "total_confirmed")
        self.assertIn("p6410325a", h["url"])
        self.assertNotIn("airbnb", h["url"])
        self.assertTrue(h["url"].startswith("https://www.abritel.fr/"))


if __name__ == "__main__":
    unittest.main()
