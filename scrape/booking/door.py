#!/usr/bin/env python3
"""Porte CozyCozy → masque Booking. Playwright pour intercepter getResultList
(Botasaurus Chrome-for-Testing ne livre pas le corps XHR ici).
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from access import enrich
from bridge import (
    canonical_booking_url,
    cozy_search_url,
    mask_with_booking_details,
    parse_booking_hits,
)
from store import write_results

CHROME = os.environ.get("SKITRACK_CHROME") or ""


def _chrome_bin() -> str | None:
    here = Path(__file__).resolve().parent
    pw_path = here / ".browsers" / "pw"
    if pw_path.is_dir():
        os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(pw_path))
    if CHROME and Path(CHROME).is_file():
        return CHROME
    names = (
        here / ".browsers" / "chrome-linux64" / "chrome",
        here / ".browsers" / "chrome-win64" / "chrome.exe",
        here / ".browsers" / "chrome-mac-x64" / "Google Chrome for Testing.app" / "Contents" / "MacOS" / "Google Chrome for Testing",
        here / ".browsers" / "chrome-mac-arm64" / "Google Chrome for Testing.app" / "Contents" / "MacOS" / "Google Chrome for Testing",
    )
    for path in names:
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


def _codes(payload: object) -> dict[str, int]:
    out: dict[str, int] = {}

    def walk(n: object) -> None:
        if isinstance(n, dict):
            c = str(n.get("providerCode") or "")
            if c:
                out[c] = out.get(c, 0) + 1
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)

    walk(payload)
    return out


def collect(
    destination: str,
    check_in: str,
    check_out: str,
    adults: int,
    bedrooms: int = 4,
) -> list[dict]:
    from playwright.sync_api import sync_playwright

    url = cozy_search_url(
        destination, check_in, check_out, adults=adults, bedrooms=bedrooms
    )
    payloads: list[dict] = []
    all_done = False
    with sync_playwright() as pw:
        chrome = _chrome_bin()
        browser = pw.chromium.launch(
            executable_path=chrome,
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        )
        ctx = browser.new_context(locale="fr-FR", viewport={"width": 1440, "height": 1100})
        page = ctx.new_page()

        def on_response(res) -> None:
            nonlocal all_done
            u = res.url or ""
            if "/api/getResultList" not in u and "/api/getResults" not in u:
                return
            try:
                data = res.json()
            except Exception:
                return
            if isinstance(data, dict):
                payloads.append(data)
                if data.get("allProcessed") is True:
                    all_done = True

        page.on("response", on_response)
        page.goto(url, wait_until="domcontentloaded", timeout=45_000)
        deadline = time.time() + 36
        idle = 0
        prev = 0
        while time.time() < deadline:
            page.mouse.wheel(0, 2400)
            page.wait_for_timeout(550)
            n = len(payloads)
            if n == prev:
                idle += 1
            else:
                idle = 0
                prev = n
            if all_done and idle >= 2:
                break
            if idle >= 10 and n:
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
    mask: bool = False,
    output_dir: str | None = None,
) -> dict:
    _ingest_env()
    payloads = collect(destination, check_in, check_out, adults, bedrooms=bedrooms)
    codes: dict[str, int] = {}
    hits: list[dict] = []
    seen: set[str] = set()
    for payload in payloads:
        for k, n in _codes(payload).items():
            codes[k] = codes.get(k, 0) + n
        for row in parse_booking_hits(payload):
            row["url"] = (
                canonical_booking_url(
                    row["url"],
                    check_in=check_in,
                    check_out=check_out,
                    adults=int(row.get("guests") or adults),
                    bedrooms=int(row["bedrooms"]) if row.get("bedrooms") else None,
                )
                or row["url"]
            )
            if row["sourceId"] in seen:
                continue
            seen.add(row["sourceId"])
            if mask:
                row = mask_with_booking_details(row)
            if "cozycozy" in json.dumps(row).lower():
                continue
            hits.append(row)
    hits = enrich(hits)
    out = {
        "ok": bool(hits),
        "source": "booking-web",
        "count": len(hits),
        "destination": destination,
        "checkIn": check_in,
        "checkOut": check_out,
        "payloads": len(payloads),
        "providers": codes,
        "results": hits,
    }
    if output_dir and hits:
        out["files"] = write_results(hits, output_dir, extra={"via": "cozy-door"})
    return out


if __name__ == "__main__":
    result = search()
    slim = {k: result[k] for k in result if k != "results"}
    print(json.dumps(slim, ensure_ascii=False, indent=2))
    for row in (result.get("results") or [])[:12]:
        print(f"{row.get('totalPrice')} {row.get('currency')}  {row.get('title')}  {row.get('url')}")
