"""Liste publique ProxyScrape (api.proxyscrape.com/v4). Isolé de Node / Airbnb."""

from __future__ import annotations

import os
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / "proxies" / "proxyscrape.txt"
TTL = 30 * 60
BASE = "https://api.proxyscrape.com/v4/free-proxy-list/get"
QUERIES = (
    "request=display_proxies&proxy_format=protocolipport&format=text&country=FR&timeout=8000",
    "request=display_proxies&proxy_format=protocolipport&format=text&country=DE,NL,BE,CH,AT,ES,IT,PT,GB,IE&timeout=7000&limit=500",
    "request=display_proxies&proxy_format=protocolipport&format=text&protocol=socks5&country=FR,DE,NL,BE,CH,GB&timeout=7000",
    "request=display_proxies&proxy_format=protocolipport&format=text&protocol=http&ssl=yes&timeout=5000&anonymity=elite,anonymous&limit=300",
)


def _enabled() -> bool:
    return os.environ.get("SKITRACK_PROXYSCRAPE", "1").strip().lower() not in ("0", "false", "off", "no")


def _pull(query: str) -> str:
    url = f"{BASE}?{query}"
    req = urllib.request.Request(url, headers={"User-Agent": "skitrack-booking/1"})
    with urllib.request.urlopen(req, timeout=12) as resp:
        return resp.read().decode("utf-8", "ignore")


def _normalize(text: str) -> list[str]:
    out: list[str] = []
    if not text or text.lower().startswith("invalid"):
        return out
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.lower().startswith("invalid"):
            continue
        if "://" not in line:
            line = f"http://{line}"
        out.append(line)
    return out


def refresh() -> list[str]:
    seen: set[str] = set()
    lines: list[str] = []
    for query in QUERIES:
        try:
            chunk = _normalize(_pull(query))
        except Exception:
            continue
        for item in chunk:
            if item in seen:
                continue
            seen.add(item)
            lines.append(item)
    if lines:
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return lines


def load_cached(*, refresh_stale: bool = True) -> list[str]:
    if not _enabled():
        return []
    age = 10**9
    if CACHE.is_file():
        try:
            age = time.time() - CACHE.stat().st_mtime
        except OSError:
            age = 10**9
    if refresh_stale and age > TTL:
        fresh = refresh()
        if fresh:
            return fresh
    if not CACHE.is_file():
        return []
    try:
        return _normalize(CACHE.read_text(encoding="utf-8", errors="ignore"))
    except OSError:
        return []
