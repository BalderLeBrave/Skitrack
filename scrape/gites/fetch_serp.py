"""SERP Drupal derrière Cloudflare : Crawlbase, Botasaurus, Playwright."""

from __future__ import annotations

import os
import urllib.parse
import urllib.request
from pathlib import Path

CHROME = os.environ.get("SKITRACK_CHROME") or ""


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


def _ok(html: str) -> bool:
    if not html or "Attention Required" in html or "Just a moment" in html:
        return False
    return "js-search-tile" in html or "g2f-accommodationTile" in html


def _crawlbase(url: str) -> str:
    _ingest_env()
    tok = (os.environ.get("CRAWLBASE_JS_TOKEN") or os.environ.get("CRAWLBASE_TOKEN") or "").strip()
    if not tok:
        return ""
    api = "https://api.crawlbase.com/?" + urllib.parse.urlencode(
        {"token": tok, "url": url, "page_wait": 2500}
    )
    req = urllib.request.Request(api, headers={"Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=45) as res:
        return res.read().decode("utf-8", errors="replace")


def _playwright(url: str) -> str:
    from playwright.sync_api import sync_playwright

    exe = CHROME if CHROME and Path(CHROME).is_file() else None
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path=exe,
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        )
        page = browser.new_context(locale="fr-FR", viewport={"width": 1440, "height": 1100}).new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=45_000)
        page.wait_for_timeout(2500)
        html = page.content()
        browser.close()
    return html


def _botasaurus(url: str) -> str:
    from botasaurus.browser import Driver, Wait, browser

    @browser(headless=True, block_images=True, add_arguments=["--no-sandbox"])
    def run(driver: Driver, _data):
        driver.get(url, wait=Wait.SHORT)
        driver.sleep(2)
        return driver.page_html

    out = run()
    if isinstance(out, list):
        return str(out[0] or "")
    return str(out or "")


def fetch_serp(url: str) -> tuple[str, str]:
    prefer = os.environ.get("SKITRACK_GITES_ENGINE", "").strip().lower()
    order = ["crawlbase", "botasaurus", "playwright"]
    if prefer in order:
        order = [prefer] + [x for x in order if x != prefer]
    last = ""
    for name in order:
        try:
            if name == "crawlbase":
                html = _crawlbase(url)
            elif name == "botasaurus":
                html = _botasaurus(url)
            else:
                html = _playwright(url)
        except Exception:
            continue
        last = html
        if _ok(html):
            return html, name
    return last, "blocked"
