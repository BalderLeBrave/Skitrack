#!/usr/bin/env python3
from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from access import enrich, haversine_m, nearest_dist_m, published_ski_in, surface_m2  # noqa: E402


class AccessTests(unittest.TestCase):
    def test_ski_in_phrases(self) -> None:
        self.assertTrue(published_ski_in("T2 au pied des pistes"))
        self.assertTrue(published_ski_in("Chalet skis aux pieds"))
        self.assertFalse(published_ski_in("Appartement centre station"))

    def test_surface(self) -> None:
        self.assertEqual(surface_m2("85 m²"), 85.0)

    def test_nearest_segment(self) -> None:
        line = [(45.0, 6.12), (45.001, 6.12)]
        d = nearest_dist_m(45.0005, 6.12001, [line])
        self.assertIsNotNone(d)
        assert d is not None
        self.assertLess(d, 30)

    def test_haversine_same_point(self) -> None:
        self.assertEqual(haversine_m(45.0, 6.0, 45.0, 6.0), 0.0)

    def test_enrich_marks_ski_in_from_text(self) -> None:
        rows = enrich(
            [
                {
                    "sourceId": "1",
                    "title": "Chalet skis aux pieds",
                    "unitType": "Hébergement entier",
                    "latitude": 45.0069,
                    "longitude": 6.1217,
                }
            ]
        )
        self.assertTrue(rows[0]["skiIn"])
        self.assertEqual(rows[0]["accessType"], "skis_aux_pieds")


if __name__ == "__main__":
    unittest.main()
