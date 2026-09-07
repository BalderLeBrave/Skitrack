"""Bascule automatique : invisible_playwright → Camoufox → SeleniumBase UC.

Défi → moteur suivant tout de suite. On ne réessaie un défi que s’il reste
un autre proxy. Le moteur qui a marché est tenté en premier la fois suivante.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from config import Settings
from delays import crawl_pause, human_pause, retry_backoff
from engines import ordered_engines
from engines.base import Engine, EngineError, Snapshot
from logutil import Timer, event
from map import listings_from_html, looks_blocked
from proxy import Proxy, ProxyPool, sticky_id, with_country, with_sticky
from state import EngineState
from urls import PAGE_SIZE, search_url


def _open_session(engine: Engine, proxy: Proxy | None, settings: Settings):
    return engine.open(
        proxy=proxy,
        headless=settings.headless,
        locale=settings.locale,
        timeout_s=settings.page_timeout_seconds,
    )


def walk_with_engine(
    engine: Engine,
    params: dict[str, Any],
    settings: Settings,
    proxy: Proxy | None,
    seen: set[str],
    sleep: Callable[[float], None],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    session = _open_session(engine, proxy, settings)
    listings: list[dict[str, Any]] = []
    pages = 0
    blocked = False
    last_reason = ""
    advertised: int | None = None
    try:
        warm = getattr(session, "warmup", None)
        if callable(warm) and getattr(settings, "warmup", True):
            try:
                warm(settings.probe_timeout_seconds)
            except EngineError as err:
                blocked = bool(err.blocked)
                last_reason = str(err)
                event("booking.engine.fail", engine=engine.name, page=0, error=str(err), blocked=blocked)
                meta = {
                    "engine": engine.name,
                    "pagesFetched": 0,
                    "blocked": blocked,
                    "reason": last_reason,
                    "advertised": None,
                    "proxy": proxy.host() if proxy else None,
                }
                return listings, meta
        for index in range(settings.max_pages):
            if index:
                crawl_pause(settings, sleep=sleep)
            url = search_url(params, index * (settings.page_size or PAGE_SIZE))
            timeout = settings.probe_timeout_seconds if index == 0 else settings.page_timeout_seconds
            t = Timer()
            try:
                snap: Snapshot = session.goto(url, timeout)
            except EngineError as err:
                blocked = bool(err.blocked)
                last_reason = str(err)
                event(
                    "booking.engine.fail",
                    engine=engine.name,
                    page=index + 1,
                    error=str(err),
                    blocked=blocked,
                )
                break
            pages += 1
            if snap.listings:
                batch = snap.listings
                for row in batch:
                    row.setdefault("engine", engine.name)
                    if not row.get("searchPageIndex"):
                        row["searchPageIndex"] = index + 1
            elif snap.blocked or looks_blocked(snap.html, snap.url):
                blocked = True
                last_reason = snap.reason or "challenge"
                event(
                    "booking.engine.blocked",
                    engine=engine.name,
                    page=index + 1,
                    ms=snap.ms or t.ms(),
                    reason=last_reason,
                )
                break
            else:
                batch = listings_from_html(
                    snap.html,
                    check_in=params.get("checkIn") or params.get("checkin"),
                    check_out=params.get("checkOut") or params.get("checkout"),
                    adults=int(params["adults"]) if params.get("adults") else None,
                    min_guests=int(params["adults"]) if params.get("adults") else None,
                    min_bedrooms=int(params["bedrooms"]) if params.get("bedrooms") else None,
                    page_index=index + 1,
                    engine=engine.name,
                )
            if batch and advertised is None:
                advertised = batch[0].get("advertisedTotal")
            fresh = 0
            for row in batch:
                sid = str(row.get("sourceId") or "")
                if not sid or sid in seen:
                    continue
                seen.add(sid)
                listings.append(row)
                fresh += 1
            event(
                "booking.page.parsed",
                engine=engine.name,
                page=index + 1,
                ms=snap.ms,
                cards=len(batch),
                fresh=fresh,
                total=len(listings),
            )
            if not batch:
                break
            human_pause(sleep=sleep, engine=engine.name)
            if advertised is not None and len(listings) >= advertised:
                break
            short = len(batch) < 8
            last_page = advertised is not None and advertised <= settings.page_size
            if short and (advertised is None or last_page or len(listings) >= advertised):
                break
    finally:
        try:
            session.close()
        except Exception:
            pass
    meta = {
        "engine": engine.name,
        "pagesFetched": pages,
        "blocked": blocked,
        "reason": last_reason,
        "advertised": advertised,
        "proxy": proxy.host() if proxy else None,
    }
    return listings, meta


def _rank_engines(engines: list[Engine], state: EngineState) -> list[Engine]:
    by_name = {e.name: e for e in engines}
    ordered: list[Engine] = []
    for name in state.rank([e.name for e in engines]):
        eng = by_name.get(name)
        if eng and eng not in ordered:
            ordered.append(eng)
    for eng in engines:
        if eng not in ordered:
            ordered.append(eng)
    return ordered


def run_engines(
    params: dict[str, Any],
    settings: Settings,
    *,
    pool: ProxyPool | None = None,
    sleep: Callable[[float], None] | None = None,
    engines: list[Engine] | None = None,
    state: EngineState | None = None,
) -> dict[str, Any]:
    sleep_fn = sleep or __import__("time").sleep
    pool = pool if pool is not None else ProxyPool()
    engines = engines if engines is not None else ordered_engines(settings.engines)
    state = state if state is not None else EngineState()
    engines = _rank_engines(engines, state)
    session_key = sticky_id(params)
    seen: set[str] = set()
    listings: list[dict[str, Any]] = []
    attempts: list[dict[str, Any]] = []
    via = ""

    if not engines:
        return {
            "ok": False,
            "error": "booking-stealth: aucun moteur chargé",
            "results": [],
            "attempts": [],
        }

    for engine in engines:
        if not engine.available():
            event("booking.engine.skip", engine=engine.name, reason="unavailable")
            attempts.append({"engine": engine.name, "skipped": True, "reason": "unavailable"})
            continue
        recovered = False
        for attempt in range(settings.retries_per_engine):
            proxy = None
            if engine.name not in ("crawlbase", "scrapingbee"):
                proxy = pool.next()
                if proxy:
                    proxy = with_sticky(with_country(proxy, "fr"), session_key)
            event(
                "booking.engine.try",
                engine=engine.name,
                attempt=attempt + 1,
                proxy=proxy.host() if proxy else None,
                lastGood=state.last_good(),
            )
            try:
                batch, meta = walk_with_engine(engine, params, settings, proxy, seen, sleep_fn)
            except EngineError as err:
                attempts.append(
                    {
                        "engine": engine.name,
                        "attempt": attempt + 1,
                        "error": str(err),
                        "blocked": err.blocked,
                        "unavailable": err.unavailable,
                    }
                )
                if err.unavailable:
                    break
                if err.blocked:
                    state.mark_blocked(engine.name)
                    pool.mark_dead(proxy)
                    break
                if attempt + 1 < settings.retries_per_engine:
                    retry_backoff(attempt, sleep=sleep_fn)
                    continue
                break
            except Exception as err:
                attempts.append({"engine": engine.name, "attempt": attempt + 1, "error": str(err)})
                if attempt + 1 < settings.retries_per_engine:
                    retry_backoff(attempt, sleep=sleep_fn)
                    continue
                break
            attempts.append({"engine": engine.name, "attempt": attempt + 1, **meta, "count": len(batch)})
            if batch:
                listings.extend(batch)
                via = engine.name
                recovered = True
                state.mark_good(engine.name)
                break
            if meta.get("blocked"):
                state.mark_blocked(engine.name)
                pool.mark_dead(proxy)
                has_other_proxy = len(pool) > 1 and attempt + 1 < settings.retries_per_engine
                if has_other_proxy:
                    retry_backoff(attempt, sleep=sleep_fn)
                    continue
                break
            break
        if recovered and listings:
            break

    return {
        "ok": bool(listings),
        "results": listings,
        "count": len(listings),
        "via": via or None,
        "attempts": attempts,
        "error": None if listings else _error_from(attempts),
    }


def _error_from(attempts: list[dict[str, Any]]) -> str:
    if not attempts:
        return "booking-stealth: aucun moteur"
    last = attempts[-1]
    if last.get("skipped") and all(a.get("skipped") for a in attempts):
        return "booking-stealth: moteurs indisponibles (binaires absents)"
    if last.get("blocked") or last.get("reason") == "challenge":
        return "booking-stealth: défi anti-robot sur tous les moteurs"
    return str(last.get("error") or last.get("reason") or "booking-stealth: aucune annonce")
