#!/usr/bin/env python3
from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from parse import classify, keep_gite, parse_stay_total, quote_blocked, tiles_from_html  # noqa: E402
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
        self.assertIn("36172", url)
        self.assertIn("travelers=8", url)

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

    def test_ident_suffix(self) -> None:
        self.assertEqual(classify(ident="gites38_b2026.1.253122.G"), "gite")
        self.assertEqual(classify(ident="gites38_b2026.1.549050.H"), "chambre_hotes")
        self.assertEqual(classify(ident="gites38_b2026.1.253115.GS"), "groupe")
        self.assertTrue(keep_gite(ident="x.G"))
        self.assertFalse(keep_gite(url="https://www.gites-de-france.com/fr/isere/chambre-d-hotes-x"))

    def test_stay_total_not_weekly(self) -> None:
        self.assertEqual(parse_stay_total(COPAINS), 4261.52)
        self.assertTrue(quote_blocked(CLOSED))
        self.assertFalse(quote_blocked(COPAINS))


if __name__ == "__main__":
    unittest.main()
