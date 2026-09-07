#!/usr/bin/env python3
from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from itea import quote  # noqa: E402


class IteaLiveTests(unittest.TestCase):
    def test_copains_stay_total(self) -> None:
        q = quote("38G253122", "2027-02-06", "2027-02-13", 8)
        self.assertTrue(q.get("available"), q)
        self.assertEqual(q.get("totalPrice"), 4261.52)
        self.assertTrue(str(q.get("ident") or "").endswith(".G"))


if __name__ == "__main__":
    unittest.main()
