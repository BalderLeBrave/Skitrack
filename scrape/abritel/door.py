#!/usr/bin/env python3
"""Porte CozyCozy → Abritel. Scroll calé sur les XHR, empreinte navigateur masquée."""

from __future__ import annotations

import json
import os
import random
import time
from pathlib import Path
from urllib.parse import urlparse

from parse import parse_abritel_hits
from stealth import HEADERS, LAUNCH_ARGS, USER_AGENT, attach
from store import write_results
from urls import cozy_search_url

CHROME = os.environ.get("SKITRACK_CHROME") or ""
SKIP_TYPES = {"image", "media", "font"}
SKIP_HOST = (
    "googletagmanager.com",
    "google-analytics.com",
    "doubleclick.net",
    "facebook.net",
    "hotjar.com",
    "sentry.io",
    "scorecardresearch.com",
)


def _chrome_bin() -> str | None:
    here = Path(__file__).resolve().parent
    pw_path = here / ".browsers" / "pw"
    if pw_path.is_dir():
        os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(pw_path))
    if CHROME and Path(CHROME).is_file():
        return CHROME
    for path in (
        here / ".browsers" / "chrome-linux64" / "chrome",
        here / ".browsers" / "chrome-win64" / "chrome.exe",
    ):
        if path.is_file():
            return str(path)
    return None


def _ingest_env() -> None:
    here = Path(__file__).resolve().parent
    for path in (here / ".env", here.parent / ".env", here.parents[1] / ".env"):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"')
            if k and v and k not in os.environ:
                os.environ[k] = v


def _block(route) -> None:
    req = route.request
    if req.resource_type in SKIP_TYPES:
        route.abort()
        return
    host = (urlparse(req.url).hostname or "").lower()
    if any(h in host for h in SKIP_HOST):
        route.abort()
        return
    route.continue_()


def collect(
    destination: str,
    check_in: str,
    check_out: str,
    adults: int,
    bedrooms: int = 0,
) -> list[dict]:
    from playwright.sync_api import sync_playwright

    url = cozy_search_url(
        destination, check_in, check_out, adults=adults, bedrooms=bedrooms
    )
    payloads: list[dict] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path=_chrome_bin(),
            headless=True,
            args=LAUNCH_ARGS,
            ignore_default_args=["--enable-automation"],
        )
        ctx = browser.new_context(
            locale="fr-FR",
            timezone_id="Europe/Paris",
            viewport={"width": 1440, "height": 900},
            user_agent=USER_AGENT,
            extra_http_headers=HEADERS,
            service_workers="block",
        )
        attach(ctx)
        page = ctx.new_page()
        page.route("**/*", _block)

        def on_response(res) -> None:
            u = res.url or ""
            if "/api/getResultList" not in u and "/api/getResults" not in u:
                return
            try:
                data = res.json()
            except Exception:
                return
            if isinstance(data, dict):
                payloads.append(data)

        page.on("response", on_response)
        page.goto(url, wait_until="domcontentloaded", timeout=25_000)
        page.mouse.move(720, 420)
        deadline = time.time() + 20
        idle = 0
        prev = 0
        while time.time() < deadline:
            page.mouse.wheel(0, random.randint(3000, 4000))
            grew = False
            wait_end = time.time() + 0.22
            while time.time() < wait_end:
                if len(payloads) > prev:
                    grew = True
                    break
                page.wait_for_timeout(30)
            n = len(payloads)
            if grew:
                idle = 0
                prev = n
                continue
            idle += 1
            prev = n
            if idle >= 12 and n >= 2:
                break
        browser.close()
    return payloads


def search(
    destination: str = "Les 2 Alpes",
    check_in: str = "2027-02-06",
    check_out: str = "2027-02-13",
    adults: int = 8,
    bedrooms: int = 4,
    *,
    output_dir: str | None = None,
) -> dict:
    _ingest_env()
    t0 = time.perf_counter()
    payloads = collect(destination, check_in, check_out, adults, bedrooms=bedrooms)
    hits: list[dict] = []
    seen: set[str] = set()
    for payload in payloads:
        for row in parse_abritel_hits(payload):
            key = row.get("listingKey") or row["sourceId"]
            if key in seen:
                continue
            if bedrooms and row.get("bedrooms") is not None and int(row["bedrooms"]) < bedrooms:
                continue
            if adults and row.get("guests") is not None and int(row["guests"]) < adults:
                continue
            seen.add(key)
            hits.append(row)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    out = {
        "ok": bool(hits),
        "source": "vrbo-web",
        "count": len(hits),
        "via": "cozy-door",
        "destination": destination,
        "checkIn": check_in,
        "checkOut": check_out,
        "payloads": len(payloads),
        "elapsedMs": elapsed_ms,
        "results": hits,
        "error": None if hits else "aucune fiche Abritel au total séjour",
    }
    if output_dir and hits:
        out["files"] = write_results(hits, output_dir, extra={"via": "cozy-door", "elapsedMs": elapsed_ms})
    return out


if __name__ == "__main__":
    result = search()
    print(json.dumps({k: result[k] for k in result if k != "results"}, ensure_ascii=False, indent=2))
    for row in (result.get("results") or [])[:12]:
        print(row.get("totalPrice"), row.get("sourceId"), row.get("title"), row.get("url"))
