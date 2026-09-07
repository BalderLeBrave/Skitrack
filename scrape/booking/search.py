"""Relevé Booking — process dédié. Bascule des 3 moteurs, totaux de séjour."""

from __future__ import annotations

import os
from typing import Any

from bridge import cozy_search_url
from config import load_settings
from dest import attach_destination
from failover import run_engines
from logutil import Timer, event, setup_logging
from store import write_results
from urls import search_url


def run_search(params: dict[str, Any]) -> dict[str, Any]:
    setup_logging()
    settings = load_settings(params)
    params = attach_destination(params)
    t = Timer()
    dest = params.get("destination") or params.get("city") or ""
    event(
        "booking.search.start",
        destination=dest,
        checkIn=params.get("checkIn") or params.get("checkin"),
        checkOut=params.get("checkOut") or params.get("checkout"),
        adults=params.get("adults"),
        engines=list(settings.engines),
        maxPages=settings.max_pages,
    )
    skip_cozy = os.environ.get("SKITRACK_BOOKING_SKIP_COZY", "").strip() in ("1", "true", "yes")
    if not skip_cozy:
        from door import search as cozy_search

        try:
            adults = int(params.get("adults") or 8)
        except (TypeError, ValueError):
            adults = 8
        try:
            bedrooms = int(params.get("bedrooms") or 4)
        except (TypeError, ValueError):
            bedrooms = 4
        cozy = cozy_search(
            str(dest),
            str(params.get("checkIn") or params.get("checkin") or ""),
            str(params.get("checkOut") or params.get("checkout") or ""),
            adults=adults,
            bedrooms=bedrooms,
        )
        if cozy.get("ok") and cozy.get("results"):
            out = {
                "ok": True,
                "count": cozy["count"],
                "via": "cozy-door",
                "attempts": [{"engine": "cozy-door", "count": cozy["count"], "blocked": False}],
                "error": None,
                "results": cozy["results"],
                "providers": cozy.get("providers"),
                "msSearch": t.ms(),
                "pagesFetched": int(cozy.get("payloads") or 0),
                "source": "booking-web",
                "url": cozy_search_url(
                    str(dest),
                    str(params.get("checkIn") or params.get("checkin") or ""),
                    str(params.get("checkOut") or params.get("checkout") or ""),
                    adults=adults,
                    bedrooms=bedrooms,
                ),
            }
            if settings.output_dir and out.get("results"):
                written = write_results(
                    out["results"],
                    settings.output_dir,
                    extra={"via": out.get("via"), "msSearch": out["msSearch"], "url": out["url"]},
                )
                out["files"] = written
            event(
                "booking.search.done",
                ok=True,
                count=out["count"],
                ms=out["msSearch"],
                via="cozy-door",
                error=None,
            )
            return out
    out = run_engines(params, settings)
    out["msSearch"] = t.ms()
    out["pagesFetched"] = sum(int(a.get("pagesFetched") or 0) for a in out.get("attempts") or [])
    out["source"] = "booking-web"
    out["url"] = params.get("url") or search_url(params, 0)
    if settings.output_dir and out.get("results"):
        written = write_results(
            out["results"],
            settings.output_dir,
            extra={"via": out.get("via"), "msSearch": out["msSearch"], "url": out["url"]},
        )
        out["files"] = written
    event(
        "booking.search.done",
        ok=out.get("ok"),
        count=out.get("count") or 0,
        ms=out["msSearch"],
        via=out.get("via"),
        error=out.get("error"),
    )
    return out
