#!/usr/bin/env python3
from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from omkar import listings_from_omkar, page_from_url  # noqa: E402


BODY = {
    "count": 188,
    "results": [
        {
            "id": 1,
            "name": "Les Bleuets - Centre station",
            "link": "https://www.booking.com/hotel/fr/les-bleuets.html?aid=1",
            "accommodation_type": "apartment",
            "price": {"total": 2948.09, "currency": "EUR"},
            "location": {"latitude": 45.0, "longitude": 6.1, "city": "Les Deux Alpes"},
            "is_sold_out": False,
        },
        {
            "id": 2,
            "name": "Hôtel du Centre",
            "link": "https://www.booking.com/hotel/fr/hotel-centre.html",
            "accommodation_type": "hotel",
            "price": {"total": 4000, "currency": "EUR"},
        },
        {
            "id": 3,
            "name": "Sans total",
            "link": "https://www.booking.com/hotel/fr/x.html",
            "accommodation_type": "apartment",
            "price": {"total": None, "currency": "EUR"},
        },
    ],
}


class OmkarMapTests(unittest.TestCase):
    def test_keeps_apartment_drops_hotel_and_empty_price(self) -> None:
        rows = listings_from_omkar(BODY, check_in="2027-02-06", check_out="2027-02-13", adults=8)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["source"], "booking-web")
        self.assertEqual(rows[0]["totalPrice"], 2948.09)
        self.assertEqual(rows[0]["priceConfidence"], "total_confirmed")
        self.assertEqual(rows[0]["advertisedTotal"], 188)
        self.assertIn("checkin=2027-02-06", rows[0]["url"])
        self.assertIn("booking.com/hotel/fr/les-bleuets", rows[0]["url"])

    def test_page_from_search_url(self) -> None:
        q, page = page_from_url(
            "https://www.booking.com/searchresults.fr.html?ss=Les+2+Alpes&dest_id=900187201"
            "&dest_type=landmark&group_adults=8&checkin=2027-02-06&checkout=2027-02-13&offset=25"
        )
        self.assertEqual(page, 2)
        self.assertEqual(q["dest_id"], "900187201")
        self.assertEqual(q["adults"], "8")
        self.assertEqual(q["sort_by"], "homes_first")


if __name__ == "__main__":
    unittest.main()
