#!/usr/bin/env python3
"""Porte CozyCozy → Abritel. Intercepte getResultList jusqu’à allProcessed."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from parse import parse_abritel_hits
from store import write_results
from urls import cozy_search_url

CHROME = os.environ.get("SKITRACK_CHROME") or ""


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
    all_done = False
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path=_chrome_bin(),
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        )
        page = browser.new_context(locale="fr-FR", viewport={"width": 1440, "height": 1100}).new_page()

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
        deadline = time.time() + 42
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
            if idle >= 12 and n:
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
    payloads = collect(destination, check_in, check_out, adults, bedrooms=bedrooms)
    hits: list[dict] = []
    seen: set[str] = set()
    for payload in payloads:
        for row in parse_abritel_hits(payload):
            if row["sourceId"] in seen:
                continue
            if bedrooms and row.get("bedrooms") is not None and int(row["bedrooms"]) < bedrooms:
                continue
            if adults and row.get("guests") is not None and int(row["guests"]) < adults:
                continue
            seen.add(row["sourceId"])
            hits.append(row)
    out = {
        "ok": bool(hits),
        "source": "vrbo-web",
        "count": len(hits),
        "via": "cozy-door",
        "destination": destination,
        "checkIn": check_in,
        "checkOut": check_out,
        "payloads": len(payloads),
        "results": hits,
        "error": None if hits else "aucune fiche Abritel au total séjour",
    }
    if output_dir and hits:
        out["files"] = write_results(hits, output_dir, extra={"via": "cozy-door"})
    return out


if __name__ == "__main__":
    result = search()
    print(json.dumps({k: result[k] for k in result if k != "results"}, ensure_ascii=False, indent=2))
    for row in (result.get("results") or [])[:12]:
        print(row.get("totalPrice"), row.get("sourceId"), row.get("title"), row.get("url"))
