#!/usr/bin/env python3
from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from bridge import canonical_booking_url, cozy_search_url, parse_booking_hits  # noqa: E402


PAYLOAD = {
    "entries": [
        {
            "name": "Duplex 8 pers. Les 2 Alpes",
            "accommodationId": 111,
            "title": "Appartement",
            "subTitleDetails": {"guestCapacity": 8, "bedRoomCount": 3},
            "cityName": "Les Deux Alpes",
            "locationText": "Les Deux Alpes",
            "ratingScore": 90,
            "ratingCount": 56,
            "instantBooking": True,
            "coordinates": {"latitude": 45.01, "longitude": 6.12},
            "highlightedResults": [
                {
                    "providerCode": "booking",
                    "providerName": "Booking.com",
                    "deeplinkUrl": "https://www.booking.com/hotel/fr/duplex-neige.html?aid=123&label=cozy",
                    "totalPrice": {"value": 2926.13, "currencyCode": "EUR", "indicative": False},
                    "externalId": "duplex-neige",
                    "fromDate": "2027-02-06",
                    "toDate": "2027-02-13",
                    "text": "Hébergement entier",
                },
                {
                    "providerCode": "airbnb",
                    "providerName": "Airbnb",
                    "deeplinkUrl": "https://www.airbnb.fr/rooms/1",
                    "totalPrice": {"value": 4000, "currencyCode": "EUR", "indicative": False},
                },
            ],
        }
    ]
}


class BridgeTests(unittest.TestCase):
    def test_cozy_url_d2a(self) -> None:
        url = cozy_search_url("Les 2 Alpes", "2027-02-06", "2027-02-13", adults=8)
        self.assertIn("Les%20Deux%20Alpes", url)
        self.assertIn("2027-02-06", url)
        self.assertIn("0-8-0", url)

    def test_canonical_strips_affiliate(self) -> None:
        url = canonical_booking_url(
            "https://www.booking.com/hotel/fr/x.html?aid=1&label=cozy&sid=abc",
            check_in="2027-02-06",
            check_out="2027-02-13",
            adults=8,
        )
        self.assertIsNotNone(url)
        assert url is not None
        self.assertIn("checkin=2027-02-06", url)
        self.assertNotIn("aid=", url)
        self.assertNotIn("label=", url)
        self.assertNotIn("cozy", url.lower())

    def test_parse_keeps_booking_only(self) -> None:
        rows = parse_booking_hits(PAYLOAD)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["source"], "booking-web")
        self.assertEqual(rows[0]["totalPrice"], 2926.13)
        self.assertEqual(rows[0]["guests"], 8)
        self.assertEqual(rows[0]["bedrooms"], 3)
        self.assertEqual(rows[0]["city"], "Les Deux Alpes")
        self.assertEqual(rows[0]["location"], "Les Deux Alpes")
        self.assertEqual(rows[0]["availabilityStatus"], "available")
        self.assertEqual(rows[0]["rating"], 9.0)
        self.assertTrue(rows[0]["instantBooking"])
        self.assertEqual(rows[0]["checkIn"], "2027-02-06")
        self.assertEqual(rows[0]["latitude"], 45.01)
        self.assertIn("booking.com/hotel/fr/duplex-neige", rows[0]["url"])
        self.assertNotIn("cozycozy", rows[0]["url"].lower())
    def test_parse_walks_nested_results(self) -> None:
        payload = {
            "results": [
                {
                    "name": "Chamois Lodge",
                    "highlightedResults": [
                        {
                            "providerCode": "booking",
                            "providerName": "booking.com",
                            "deeplinkUrl": "https://www.booking.com/hotel/fr/le-chamois-les-deux-alpes.html?aid=1",
                            "totalPrice": {"value": 5760.72, "currencyCode": "EUR", "indicative": False},
                            "externalId": "320986",
                            "text": "4× Chambre (2 personnes)",
                        }
                    ],
                }
            ]
        }
        rows = parse_booking_hits(payload)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["sourceId"], "320986")
        self.assertEqual(rows[0]["totalPrice"], 5760.72)
        self.assertEqual(rows[0]["guests"], 8)
        self.assertEqual(rows[0]["bedrooms"], 4)


if __name__ == "__main__":
    unittest.main()
