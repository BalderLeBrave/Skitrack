"""Crawlbase Crawling API — Booking seulement. Jeton via env / coffre, jamais loggé."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
API = "https://api.crawlbase.com/"


def _ingest_env_file(path: Path) -> None:
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        if key and val and key not in os.environ:
            os.environ[key] = val


def _load_local_env() -> None:
    _ingest_env_file(HERE / ".env")
    _ingest_env_file(HERE.parent.parent / ".env")


def token() -> str:
    _load_local_env()
    return (
        os.environ.get("CRAWLBASE_TOKEN")
        or os.environ.get("CRAWLBASE_JS_TOKEN")
        or ""
    ).strip()


def fetch(
    url: str,
    *,
    autoparse: bool = True,
    session: str | None = None,
    timeout_s: float = 28.0,
) -> dict[str, Any]:
    tok = token()
    if not tok:
        raise RuntimeError("crawlbase: jeton absent (CRAWLBASE_TOKEN)")
    query: dict[str, str] = {"token": tok, "url": url, "format": "json"}
    if autoparse:
        query["autoparse"] = "true"
    if session:
        query["cookies_session"] = session[:32]
    req = urllib.request.Request(
        API + "?" + urllib.parse.urlencode(query),
        headers={"Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=max(8.0, timeout_s)) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", "ignore")[:240]
        raise RuntimeError(f"crawlbase HTTP {err.code}: {body}") from err
    try:
        data = json.loads(raw.decode("utf-8", "replace"))
    except json.JSONDecodeError as err:
        raise RuntimeError("crawlbase: JSON illisible") from err
    if not isinstance(data, dict):
        raise RuntimeError("crawlbase: réponse inattendue")
    return data
