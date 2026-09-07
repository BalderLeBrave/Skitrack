#!/usr/bin/env python3
"""Fiche Booking : prix, chambres, personnes, lieu, disponibilité."""

from __future__ import annotations

import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from bridge import parse_booking_hits  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
ENTRY = HERE / "fixtures" / "cozy_booking_entry.json"


class FieldsTests(unittest.TestCase):
    def test_captured_entry_has_full_card(self) -> None:
        raw = json.loads(ENTRY.read_text(encoding="utf-8"))
        payload = {"results": [raw["entry"]]}
        rows = parse_booking_hits(payload)
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual(r["title"], "Chamois Lodge")
        self.assertEqual(r["totalPrice"], 5760.72)
        self.assertEqual(r["currency"], "EUR")
        self.assertEqual(r["guests"], 8)
        self.assertEqual(r["bedrooms"], 4)
        self.assertEqual(r["beds"], 5)
        self.assertEqual(r["city"], "Les Deux Alpes")
        self.assertEqual(r["location"], "Les Deux Alpes")
        self.assertAlmostEqual(r["latitude"], 45.00688552856445)
        self.assertAlmostEqual(r["longitude"], 6.121705055236816)
        self.assertEqual(r["availabilityStatus"], "available")
        self.assertEqual(r["checkIn"], "2027-02-06")
        self.assertEqual(r["checkOut"], "2027-02-13")
        self.assertTrue(r["instantBooking"])
        self.assertEqual(r["propertyType"], "hôtel")
        self.assertIn("Chambre", r["unitType"])
        self.assertEqual(r["rating"], 9.0)
        self.assertEqual(r["reviewCount"], 245)
        self.assertTrue(r["images"][0].startswith("https://"))
        self.assertIn("no_rooms=4", r["url"])
        self.assertIn("group_adults=8", r["url"])
        self.assertNotIn("aid=", r["url"])


if __name__ == "__main__":
    unittest.main()
