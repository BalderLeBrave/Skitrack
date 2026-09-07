"""Proxy résidentiel Bright Data, dérivé du WS Scraping Browser. Isolé de Node."""

from __future__ import annotations

import os
import re
from urllib.parse import quote, unquote, urlparse


def residential_from_ws(
    ws: str,
    *,
    zone: str | None = None,
    country: str = "fr",
    port: str = "33335",
) -> str | None:
    try:
        u = urlparse(ws.strip())
    except ValueError:
        return None
    user = unquote(u.username or "")
    password = unquote(u.password or "")
    if not user or not password:
        return None
    if not re.match(r"^brd-customer-", user, re.I):
        return None
    m = re.match(r"^(brd-customer-.+-zone-)([^\s-]+)", user, re.I)
    if not m:
        return None
    z = (zone or "").strip() or m.group(2)
    if not (zone or "").strip() and re.search(r"scraping[_-]?browser", z, re.I):
        z = "residential"
    cc = (country or "fr").strip().lower() or "fr"
    host = u.hostname or "brd.superproxy.io"
    login = f"{m.group(1)}{z}-country-{cc}"
    return f"http://{quote(login, safe='')}:{quote(password, safe='')}@{host}:{port}"


def residential_from_env(env: dict[str, str] | None = None) -> str | None:
    e = env if env is not None else os.environ
    direct = (e.get("BRIGHTDATA_RESIDENTIAL") or e.get("SKITRACK_PROXY") or "").strip()
    if direct and "brd.superproxy.io" in direct:
        return direct
    ws = (e.get("BRIGHTDATA_BROWSER_WS") or e.get("BOOKING_BROWSER_WS") or "").strip()
    if not ws:
        return None
    return residential_from_ws(
        ws,
        zone=e.get("BRIGHTDATA_RESIDENTIAL_ZONE") or "",
        country=e.get("BRIGHTDATA_RESIDENTIAL_COUNTRY") or "fr",
        port=e.get("BRIGHTDATA_RESIDENTIAL_PORT") or "33335",
    )
