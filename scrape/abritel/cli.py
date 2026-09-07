#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from search import run_search  # noqa: E402


def main() -> int:
    raw = sys.stdin.read()
    try:
        params = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as err:
        json.dump({"ok": False, "error": f"JSON: {err}"}, sys.stdout)
        return 2
    if not isinstance(params, dict):
        json.dump({"ok": False, "error": "corps objet attendu"}, sys.stdout)
        return 2
    params.setdefault("destination", "Les 2 Alpes")
    params.setdefault("checkIn", "2027-02-06")
    params.setdefault("checkOut", "2027-02-13")
    params.setdefault("adults", 8)
    params.setdefault("bedrooms", 4)
    out = run_search(params)
    json.dump(out, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
