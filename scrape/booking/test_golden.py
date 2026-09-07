#!/usr/bin/env python3
"""Contrat : 40 fiches Booking CozyCozy (D2A 4 chambres / 8 pers.)."""

from __future__ import annotations

import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from bridge import parse_booking_hits  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
FIXTURE = HERE / "fixtures" / "cozy_booking_d2a_4_8.json"


class GoldenCozyBookingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.data = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.listings = self.data["listings"]

    def test_fixture_is_complete(self) -> None:
        self.assertEqual(self.data["count"], 40)
        self.assertEqual(len(self.listings), 40)
        ids = [str(x["id"]) for x in self.listings]
        self.assertEqual(len(set(ids)), 40)

    def test_parser_returns_every_cozy_booking_hit(self) -> None:
        payload = {
            "results": [
                {
                    "name": row["title"],
                    "title": "logement",
                    "cityName": "Les Deux Alpes",
                    "locationText": "Les Deux Alpes",
                    "subTitleDetails": {
                        "guestCapacity": 8,
                        "bedRoomCount": 4,
                        "bedCount": 5,
                    },
                    "coordinates": {"latitude": 45.01, "longitude": 6.12},
                    "ratingScore": 90,
                    "highlightedResults": [
                        {
                            "providerCode": "booking",
                            "providerName": "booking.com",
                            "deeplinkUrl": f"https://www.booking.com/hotel/fr/{row['id']}.html?aid=1",
                            "totalPrice": {
                                "value": row["total"],
                                "currencyCode": "EUR",
                                "indicative": False,
                            },
                            "externalId": str(row["id"]),
                            "text": row.get("text") or "Hébergement entier",
                            "fromDate": "2027-02-06",
                            "toDate": "2027-02-13",
                        }
                    ],
                }
                for row in self.listings
            ]
        }
        parsed = parse_booking_hits(payload)
        got = {str(r["sourceId"]): r["totalPrice"] for r in parsed}
        want = {str(r["id"]): r["total"] for r in self.listings}
        self.assertEqual(got, want)
        self.assertTrue(all(r["source"] == "booking-web" for r in parsed))
        self.assertTrue(all("aid=" not in r["url"] for r in parsed))
        for r in parsed:
            self.assertEqual(r["guests"], 8)
            self.assertEqual(r["bedrooms"], 4)
            self.assertEqual(r["city"], "Les Deux Alpes")
            self.assertEqual(r["availabilityStatus"], "available")
            self.assertIn("checkin=2027-02-06", r["url"])


if __name__ == "__main__":
    unittest.main()
