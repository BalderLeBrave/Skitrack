#!/usr/bin/env python3
"""Parseur Booking : totaux de séjour, pas de nuit, pas d’hôtel, pas Gîtes."""

from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from map import is_dropped_listing, listings_from_autoparse, listings_from_bee, listings_from_html, stay_total_from_label  # noqa: E402

APOLLO = """
<script type="application/json" data-capla-store-data="apollo">
{"basicPropertyData":{"pageName":"chalet-neige","location":{"latitude":45.0106,"longitude":6.1226},"occupancy":{"maxPersons":8},"numberOfBedrooms":3,"accommodationTypeName":"Appartement"}}
</script>
"""

CARD = """
<div data-testid="property-card" data-hotel-id="4242">
  <a href="https://www.booking.com/hotel/fr/chalet-neige.fr.html?aid=1">
    <div data-testid="title">Chalet Neige</div>
  </a>
  <div data-testid="price-and-discounted-price">1 245 €</div>
  <div data-testid="recommended-units">Appartement entier • 3 chambres • 8 personnes • 72 m²</div>
  <img src="https://cf.bstatic.com/xdata/images/hotel/square600/abc.jpg">
</div>
"""

HOTEL = """
<div data-testid="property-card" data-hotel-id="9">
  <a href="https://www.booking.com/hotel/fr/grand-hotel.fr.html">
    <div data-testid="title">Grand Hotel des Neiges</div>
  </a>
  <div data-testid="price-and-discounted-price">890 €</div>
  <div data-testid="recommended-units">Hôtel • 1 chambre</div>
</div>
"""

FROM_PRICE = """
<div data-testid="property-card" data-hotel-id="7">
  <a href="https://www.booking.com/hotel/fr/from.fr.html">
    <div data-testid="title">Studio indicatif</div>
  </a>
  <div data-testid="price-and-discounted-price">À partir de 1 200 €</div>
  <div data-testid="recommended-units">Studio • 4 personnes</div>
</div>
"""

NIGHT = """
<div data-testid="property-card" data-hotel-id="8">
  <a href="https://www.booking.com/hotel/fr/night.fr.html">
    <div data-testid="title">Nuitée des pistes</div>
  </a>
  <div data-testid="price-and-discounted-price">180 € /nuit</div>
  <div data-testid="recommended-units">Appartement entier • 2 chambres</div>
</div>
"""

PAGE = f"<html><h1>Les 2 Alpes : 87 établissements trouvés</h1>{APOLLO}{CARD}{HOTEL}{FROM_PRICE}{NIGHT}</html>"


class MapTests(unittest.TestCase):
    def test_stay_total(self) -> None:
        self.assertEqual(stay_total_from_label("1 245 €"), 1245)
        self.assertIsNone(stay_total_from_label("À partir de 1 200 €"))
        self.assertIsNone(stay_total_from_label("180 € /nuit"))
        self.assertEqual(stay_total_from_label("2 215 € au total"), 2215)

    def test_hotel_dropped(self) -> None:
        self.assertTrue(is_dropped_listing("Hôtel"))
        self.assertFalse(is_dropped_listing("Appartement entier"))
        self.assertFalse(is_dropped_listing(None))

    def test_page(self) -> None:
        rows = listings_from_html(
            PAGE,
            check_in="2027-02-06",
            check_out="2027-02-13",
            adults=8,
            page_index=1,
            engine="invisible_playwright",
        )
        self.assertEqual(len(rows), 1, rows)
        row = rows[0]
        self.assertEqual(row["source"], "booking-web")
        self.assertEqual(row["sourceId"], "4242")
        self.assertEqual(row["totalPrice"], 1245)
        self.assertEqual(row["priceConfidence"], "total_confirmed")
        self.assertEqual(row["guests"], 8)
        self.assertEqual(row["bedrooms"], 3)
        self.assertEqual(row["areaSqm"], 72)
        self.assertEqual(row["latitude"], 45.0106)
        self.assertIn("checkin=2027-02-06", row["url"])
        self.assertEqual(row["advertisedTotal"], 87)
        self.assertEqual(row["engine"], "invisible_playwright")

    def test_apollo_only(self) -> None:
        html = """
        <html><body><h1>Les 2 Alpes : 12 établissements trouvés</h1>
        <script type="application/json" data-capla-store-data="apollo">
        {"basicPropertyData":{
          "pageName":"chalet-apollo",
          "name":"Chalet Apollo",
          "location":{"latitude":45.01,"longitude":6.12},
          "occupancy":{"maxPersons":8},
          "numberOfBedrooms":4,
          "accommodationTypeName":"Chalet",
          "displayPrice":{"amount":3210,"currency":"EUR"}
        }}
        </script>
        </body></html>
        """
        rows = listings_from_html(html, check_in="2027-02-06", check_out="2027-02-13", adults=8)
        self.assertEqual(len(rows), 1, rows)
        self.assertEqual(rows[0]["title"], "Chalet Apollo")
        self.assertEqual(rows[0]["totalPrice"], 3210)
        self.assertEqual(rows[0]["guests"], 8)
        self.assertEqual(rows[0]["bedrooms"], 4)
        self.assertIn("chalet-apollo", rows[0]["url"])

    def test_challenge_is_blocked(self) -> None:
        from map import looks_blocked

        self.assertTrue(looks_blocked("<html><div id='challenge-running'>Just a moment</div></html>"))
        self.assertFalse(looks_blocked(PAGE))

    def test_no_gites_airbnb(self) -> None:
        src = pathlib.Path(__file__).with_name("map.py").read_text(encoding="utf-8")
        self.assertNotRegex(src, r"g2f-accommodation|StaySearchResult|pyairbnb|gites-de-france")

    def test_autoparse_stay_total(self) -> None:
        body = {
            "propertyCount": 25,
            "properties": [
                {
                    "name": "Duplex 8 pers. Les 2 Alpes",
                    "url": "https://www.booking.com/hotel/fr/duplex-neige.fr.html",
                    "price": "€ 2 100",
                    "priceAmount": 2100,
                    "image": "https://cf.bstatic.com/xdata/images/hotel/square240/a.jpg?k=1",
                },
                {
                    "name": "Studio à partir de 90 €",
                    "url": "https://www.booking.com/hotel/fr/studio.fr.html",
                    "price": "à partir de 90 €",
                    "priceAmount": 90,
                },
                {
                    "name": "Hôtel des Neiges",
                    "url": "https://www.booking.com/hotel/fr/hotel-neiges.fr.html",
                    "price": "€ 800",
                    "priceAmount": 800,
                },
            ],
        }
        url = (
            "https://www.booking.com/searchresults.fr.html?ss=Les+2+Alpes"
            "&group_adults=8&checkin=2027-02-06&checkout=2027-02-13"
        )
        rows = listings_from_autoparse(body, url=url, engine="crawlbase")
        self.assertEqual(len(rows), 1, rows)
        self.assertEqual(rows[0]["totalPrice"], 2100)
        self.assertEqual(rows[0]["guests"], 8)
        self.assertEqual(rows[0]["priceConfidence"], "total_confirmed")
        self.assertEqual(rows[0]["engine"], "crawlbase")
        self.assertIn("checkin=2027-02-06", rows[0]["url"])

    def test_bee_hotels(self) -> None:
        body = {
            "hotels": [
                {
                    "name": "Chalet 8 pers. Neige",
                    "url": "https://www.booking.com/hotel/fr/chalet-bee.fr.html",
                    "price": "€ 1 880",
                    "location": "Les 2 Alpes",
                }
            ]
        }
        url = "https://www.booking.com/searchresults.fr.html?ss=Les+2+Alpes&group_adults=8&checkin=2027-02-06&checkout=2027-02-13"
        rows = listings_from_bee(body, url=url)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["totalPrice"], 1880)
        self.assertEqual(rows[0]["engine"], "scrapingbee")
        self.assertEqual(rows[0]["guests"], 8)



if __name__ == "__main__":
    unittest.main()
