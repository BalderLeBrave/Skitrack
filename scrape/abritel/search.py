"""Entrée worker Abritel — isolée de Booking / Gîtes."""

from __future__ import annotations

from typing import Any

from door import search


def run_search(params: dict[str, Any]) -> dict[str, Any]:
    dest = str(params.get("destination") or params.get("city") or "Les 2 Alpes")
    check_in = str(params.get("checkIn") or params.get("checkin") or "")
    check_out = str(params.get("checkOut") or params.get("checkout") or "")
    try:
        adults = int(params.get("adults") or 8)
    except (TypeError, ValueError):
        adults = 8
    try:
        bedrooms = int(params.get("bedrooms") or 0)
    except (TypeError, ValueError):
        bedrooms = 0
    return search(
        dest,
        check_in,
        check_out,
        adults,
        bedrooms,
        output_dir=params.get("outputDir") or params.get("output_dir"),
    )
