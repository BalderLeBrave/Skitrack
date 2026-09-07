"""Moteur 0 : Omkar Booking HTTP. Pas de barre Booking, pas de navigateur."""

from __future__ import annotations

from engines.base import EngineError, Snapshot
from logutil import Timer, event
from proxy import Proxy


class _OmkarSession:
    name = "omkar"

    def __init__(self, timeout_s: float) -> None:
        self._timeout = max(12.0, timeout_s)

    def goto(self, url: str, timeout_s: float) -> Snapshot:
        from omkar import get, listings_from_omkar, page_from_url

        t = Timer()
        query, page = page_from_url(url)
        if not query.get("query") and not query.get("dest_id"):
            raise EngineError("omkar: destination absente", blocked=False)
        try:
            body = get("/booking/hotels/search", query, timeout_s=max(self._timeout, timeout_s))
        except RuntimeError as err:
            msg = str(err)
            unavailable = any(s in msg for s in ("401", "403", "jeton", "402", "429"))
            raise EngineError(msg, blocked=not unavailable, unavailable=unavailable) from err
        listings = listings_from_omkar(
            body,
            check_in=str(query.get("checkin") or "") or None,
            check_out=str(query.get("checkout") or "") or None,
            adults=int(query["adults"]) if str(query.get("adults") or "").isdigit() else None,
            page_index=page,
            engine=self.name,
        )
        ms = t.ms()
        event("booking.omkar.page", page=page, n=len(listings), ms=ms)
        return Snapshot(html="", url=url, ms=ms, listings=listings)

    def close(self) -> None:
        return None


class OmkarEngine:
    name = "omkar"

    def available(self) -> bool:
        from omkar import token

        return bool(token())

    def open(self, *, proxy: Proxy | None, headless: bool, locale: str, timeout_s: float) -> _OmkarSession:
        if not self.available():
            raise EngineError("omkar: jeton absent", unavailable=True)
        return _OmkarSession(timeout_s)
