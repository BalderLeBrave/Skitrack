"""Rotation de proxys résidentiels / mobiles. Isolé du proxy Node."""

from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass
from urllib.parse import quote, urlparse

from pathlib import Path

from brightdata import residential_from_env
from proxyscrape import load_cached as load_proxyscrape

HERE = Path(__file__).resolve().parent
PROXIES_DIR = Path(os.environ.get("SKITRACK_BOOKING_PROXIES") or HERE / "proxies")
EU_CC = ("FR", "BE", "CH", "LU", "DE", "NL", "AT", "IT", "ES", "PT", "GB", "IE")
FREE_CAP = 120

RESIDENTIAL_HINT = re.compile(
    r"brd\.superproxy|oxylabs|smartproxy|iproyal|soax\.|packetstream|proxy-seller|luminati",
    re.I,
)


@dataclass(frozen=True)
class Proxy:
    raw: str
    server: str
    username: str | None = None
    password: str | None = None
    kind: str = "residential"

    def as_url(self) -> str:
        if self.username and self.password:
            host = self.server.split("://", 1)[-1]
            scheme = self.server.split("://", 1)[0] if "://" in self.server else "http"
            return f"{scheme}://{quote(self.username, safe='')}:{quote(self.password, safe='')}@{host}"
        return self.raw

    def as_playwright(self) -> dict[str, str]:
        out: dict[str, str] = {"server": self.server}
        if self.username:
            out["username"] = self.username
        if self.password:
            out["password"] = self.password
        return out

    def host(self) -> str:
        try:
            return urlparse(self.server if "://" in self.server else f"http://{self.server}").hostname or "?"
        except ValueError:
            return "?"


def parse_proxy(raw: str, kind: str = "residential") -> Proxy | None:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        u = urlparse(text if "://" in text else f"http://{text}")
    except ValueError:
        return None
    if not u.hostname:
        return None
    scheme = u.scheme or "http"
    port = f":{u.port}" if u.port else ""
    server = f"{scheme}://{u.hostname}{port}"
    user = u.username
    password = u.password
    return Proxy(raw=text, server=server, username=user, password=password, kind=kind)


def _split_list(raw: str) -> list[str]:
    return [part.strip() for part in raw.replace("\n", ",").split(",") if part.strip()]


def with_country(proxy: Proxy, country: str = "fr") -> Proxy:
    if not proxy.username or not re.match(r"^brd-customer-", proxy.username, re.I):
        return proxy
    if re.search(r"-country-", proxy.username, re.I):
        return proxy
    cc = (country or "fr").lower()
    user = f"{proxy.username}-country-{cc}"
    return Proxy(raw=proxy.raw, server=proxy.server, username=user, password=proxy.password, kind=proxy.kind)


def with_sticky(proxy: Proxy, session: str) -> Proxy:
    if not proxy.username or not re.match(r"^brd-customer-", proxy.username, re.I):
        return proxy
    if re.search(r"-session-", proxy.username, re.I):
        return proxy
    token = re.sub(r"[^a-zA-Z0-9]", "", session)[:12] or "ski"
    user = f"{proxy.username}-session-{token}"
    return Proxy(raw=proxy.raw, server=proxy.server, username=user, password=proxy.password, kind=proxy.kind)


def sticky_id(params: dict) -> str:
    raw = "|".join(
        str(params.get(k) or "")
        for k in ("destination", "checkIn", "checkin", "checkOut", "checkout", "adults")
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:10]


def _looks_residential(raw: str) -> bool:
    return bool(RESIDENTIAL_HINT.search(raw or ""))


def _lines_from(path: Path) -> list[str]:
    if not path.is_file():
        return []
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return []
    out: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        out.append(line if "://" in line else f"http://{line}")
    return out


def load_bundled_open(*, cap: int = FREE_CAP) -> list[Proxy]:
    """Listes ouvertes vendues avec Booking (pas des résidentiels)."""
    flag = os.environ.get("SKITRACK_PROXY_FREE", "1").strip().lower()
    if flag in ("0", "false", "off", "no"):
        return []
    try:
        cap = max(1, min(400, int(os.environ.get("SKITRACK_PROXY_FREE_CAP") or cap)))
    except ValueError:
        cap = FREE_CAP
    files: list[Path] = [PROXIES_DIR / "countries" / cc / "proxies.txt" for cc in EU_CC]
    files.append(PROXIES_DIR / "protocols" / "https.txt")
    files.append(PROXIES_DIR / "protocols" / "socks5.txt")
    files.append(PROXIES_DIR / "all-proxies.txt")
    seen: set[str] = set()
    out: list[Proxy] = []
    refresh = os.environ.get("SKITRACK_PROXYSCRAPE_REFRESH", "1").strip().lower() not in ("0", "false", "off")
    for raw in load_proxyscrape(refresh_stale=refresh):
        if raw in seen:
            continue
        item = parse_proxy(raw, "open")
        if not item:
            continue
        seen.add(raw)
        out.append(item)
        if len(out) >= cap:
            return out
    for path in files:
        for raw in _lines_from(path):
            if raw in seen:
                continue
            item = parse_proxy(raw, "open")
            if not item:
                continue
            seen.add(raw)
            out.append(item)
            if len(out) >= cap:
                return out
    return out


def load_proxies() -> list[Proxy]:
    mobile: list[Proxy] = []
    residential: list[Proxy] = []
    one_m = os.environ.get("SKITRACK_MOBILE_PROXY", "").strip()
    if one_m:
        p = parse_proxy(one_m, "mobile")
        if p:
            mobile.append(p)
    for item in _split_list(os.environ.get("SKITRACK_MOBILE_PROXY_LIST", "")):
        p = parse_proxy(item, "mobile")
        if p:
            mobile.append(p)
    one = os.environ.get("SKITRACK_PROXY", "").strip()
    if not one:
        fallback = os.environ.get("HTTPS_PROXY", "").strip()
        if fallback and _looks_residential(fallback):
            one = fallback
    if one:
        p = parse_proxy(one, "residential")
        if p:
            residential.append(p)
    for item in _split_list(os.environ.get("SKITRACK_PROXY_LIST", "")):
        p = parse_proxy(item, "residential")
        if p:
            residential.append(p)
    if not residential:
        derived = residential_from_env()
        if derived:
            p = parse_proxy(derived, "residential")
            if p:
                residential.append(p)
    open_list = load_bundled_open()
    mode = (os.environ.get("SKITRACK_PROXY_MODE") or "residential").strip().lower()
    if mode == "mobile":
        return mobile or open_list
    if mode == "prefer_mobile":
        return mobile + residential + open_list
    if mode == "rotate_all":
        return mobile + residential + open_list
    if residential:
        return residential
    return open_list or mobile


class ProxyPool:
    def __init__(self, items: list[Proxy] | None = None) -> None:
        self._items = items if items is not None else load_proxies()
        self._cursor = 0
        self._dead: set[str] = set()

    def __bool__(self) -> bool:
        return bool(self._items)

    def __len__(self) -> int:
        return len(self._items)

    def mark_dead(self, proxy: Proxy | None) -> None:
        if proxy:
            self._dead.add(proxy.host())

    def next(self) -> Proxy | None:
        if not self._items:
            return None
        n = len(self._items)
        for _ in range(n):
            item = self._items[self._cursor % n]
            self._cursor += 1
            if item.host() in self._dead:
                continue
            return item
        self._dead.clear()
        item = self._items[self._cursor % n]
        self._cursor += 1
        return item
