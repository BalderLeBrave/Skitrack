#!/usr/bin/env python3
"""Entrée stdin JSON → stdout JSON. Un process, une source : Airbnb.

Deux modes. Par défaut, un relevé (`stays.run_search`). Avec
`"mode": "fiches"`, la lecture des fiches PDP d'une liste d'identifiants
(`pdp.run_fiches`), que la complétion de l'écran Prix demande par tranches.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from stays import run_search  # noqa: E402
from pdp import run_fiches  # noqa: E402


def emit(out: dict, stream=None) -> None:
    """Écrit le JSON en UTF-8, quel que soit l'encodage de la console.

    Sous Windows, la sortie d'un Python lancé par tube est en cp1252 : un
    libellé Airbnb portant une espace fine (U+202F) levait UnicodeEncodeError
    au milieu du JSON, et Node, qui recevait un objet tronqué, jetait les
    272 annonces lues pour « json illisible ».
    """
    stream = stream or sys.stdout
    stream.flush()
    stream.buffer.write(json.dumps(out, ensure_ascii=False).encode("utf-8") + b"\n")
    stream.buffer.flush()


def main() -> int:
    raw = sys.stdin.buffer.read().decode("utf-8")
    try:
        params = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as err:
        emit({"ok": False, "error": f"JSON: {err}"})
        return 2
    if not isinstance(params, dict):
        emit({"ok": False, "error": "corps objet attendu"})
        return 2
    out = run_fiches(params) if params.get("mode") == "fiches" else run_search(params)
    emit(out)
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
