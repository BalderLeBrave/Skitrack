#!/usr/bin/env python3
from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from parse import advertised_count, classify, geo_index_from_html, keep_gite, last_page_index, osm_pin_from_html, parse_stay_total, quote_blocked, tiles_from_html  # noqa: E402
from urls import iso_to_fr, search_url, towns_id  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
HTML = (HERE / "fixtures" / "serp_tiles.html").read_text(encoding="utf-8")
COPAINS = '<span class="sp_montantPrixTotal" data-prix="4261.52">4261,52 &euro;</span>'
CLOSED = '{"contactSiNonVendable":"centrale","prixLoc":"4070 &euro;"}'


class GitesParseTests(unittest.TestCase):
    def test_towns_d2a(self) -> None:
        self.assertEqual(towns_id("Les 2 Alpes"), "50301")
        url = search_url("Les 2 Alpes", "2027-02-06", "2027-02-13", adults=8)
        self.assertIn("towns=50301", url)
        self.assertIn("adults=8", url)
        self.assertIn("arrival=2027-02-06", url)
        self.assertIn("departure=2027-02-13", url)
        self.assertNotIn("travelers=", url)
        self.assertNotIn("date-start", url)

    def test_iso_fr(self) -> None:
        self.assertEqual(iso_to_fr("2027-02-06"), "06/02/2027")

    def test_tiles_keep_gites_only(self) -> None:
        tiles = tiles_from_html(HTML)
        ids = {t["sourceId"] for t in tiles}
        self.assertIn("38G253122", ids)
        self.assertIn("38G20200", ids)
        self.assertNotIn("38G253115", ids)
        self.assertNotIn("38G549050", ids)
        copains = next(t for t in tiles if t["sourceId"] == "38G253122")
        self.assertEqual(copains["guests"], 8)
        self.assertEqual(copains["bedrooms"], 4)
        self.assertAlmostEqual(copains["latitude"], 45.0106)
        self.assertAlmostEqual(copains["longitude"], 6.1226)
        self.assertIn("Église", copains["address"])
        self.assertEqual(copains["city"], "Les Deux Alpes")
        maradri = next(t for t in tiles if t["sourceId"] == "38G20200")
        self.assertNotIn("latitude", maradri)

    def test_itea_widget_location_geo(self) -> None:
        """Fiche ITEA : le point OSM est dans location.geo, pas geo racine."""
        html = """
<script type="application/ld+json">
{
  "@type": "LodgingBusiness",
  "url": "/location-vacances/Gite-Les-Deux-Alpes-38G253122.html",
  "address": {"@type": "PostalAddress", "addressLocality": "LES DEUX ALPES"},
  "location": {
    "@type": "Place",
    "geo": {"@type": "GeoCoordinates", "latitude": "45.03657800", "longitude": "6.13102100"}
  }
}
</script>
"""
        idx = geo_index_from_html(html)
        hit = idx["38G253122"]
        self.assertAlmostEqual(hit["lat"], 45.036578)
        self.assertAlmostEqual(hit["lon"], 6.131021)
        self.assertEqual(hit["city"], "LES DEUX ALPES")

    def test_drupal_fiche_osm_map_pin(self) -> None:
        """Fiche Drupal : JSON-LD Product sans geo. Le pin OSM est data-lat/lng."""
        html = """
<link rel="canonical" href="https://www.gites-de-france.com/fr/isere/chalet-les-copains-38g253122">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Gîte - Chalet les Copains"}]}
</script>
<section id="location">
  <div data-lat="45.036578" data-lng="6.131021" data-map-info="{}" id="map-accommodation"></div>
</section>
"""
        lat, lon = osm_pin_from_html(html)
        self.assertAlmostEqual(lat, 45.036578)
        self.assertAlmostEqual(lon, 6.131021)
        idx = geo_index_from_html(html)
        hit = idx["38G253122"]
        self.assertAlmostEqual(hit["lat"], 45.036578)
        self.assertAlmostEqual(hit["lon"], 6.131021)

    def test_osm_pin_overrides_jsonld_on_fiche(self) -> None:
        html = """
<script type="application/ld+json">
{"@type":"LodgingBusiness","url":"/gite-38g253122.html",
 "geo":{"latitude":45.0106,"longitude":6.1226}}
</script>
<div data-lat="45.036578" data-lng="6.131021" id="map-accommodation"></div>
"""
        hit = geo_index_from_html(html)["38G253122"]
        self.assertAlmostEqual(hit["lat"], 45.036578)
        self.assertAlmostEqual(hit["lon"], 6.131021)

    def test_ident_suffix(self) -> None:
        self.assertEqual(classify(ident="gites38_b2026.1.253122.G"), "gite")
        self.assertEqual(classify(ident="gites38_b2026.1.549050.H"), "chambre_hotes")
        self.assertEqual(classify(ident="gites38_b2026.1.253115.GS"), "groupe")
        self.assertTrue(keep_gite(ident="x.G"))
        self.assertFalse(keep_gite(url="https://www.gites-de-france.com/fr/isere/chambre-d-hotes-x"))

    def test_pager(self) -> None:
        html = '24 Résultats <a href="/fr/search?page=1">2</a> <a href="/fr/search?towns=50301&page=2">3</a>'
        self.assertEqual(advertised_count(html), 24)
        self.assertEqual(last_page_index(html), 2)
        self.assertEqual(parse_stay_total(COPAINS), 4261.52)
        self.assertTrue(quote_blocked(CLOSED))
        self.assertFalse(quote_blocked(COPAINS))


if __name__ == "__main__":
    unittest.main()
