"""Réglages du relevé Booking. Aucune autre source n’importe ce module."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG_PATH = Path(os.environ.get("SKITRACK_BOOKING_CONFIG") or HERE / "config.json")

ENGINE_ORDER = ("omkar", "crawlbase", "scrapingbee", "invisible_playwright", "camoufox", "seleniumbase_uc")
PAGE_SIZE = 25
MAX_PAGES = 15


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


@dataclass
class Settings:
    engines: tuple[str, ...] = ENGINE_ORDER
    max_pages: int = MAX_PAGES
    page_size: int = PAGE_SIZE
    crawl_delay_seconds: float = 0.9
    jitter_min: float = 0.2
    jitter_max: float = 0.8
    retries_per_engine: int = 1
    timeout_seconds: float = 18.0
    probe_timeout_seconds: float = 8.0
    page_timeout_seconds: float = 18.0
    headless: bool = True
    locale: str = "fr-FR"
    output_dir: str = ""
    entire_home_only: bool = True
    stay_total_only: bool = True
    warmup: bool = True
    extra: dict[str, object] = field(default_factory=dict)

    def clamp(self) -> "Settings":
        self.max_pages = max(1, min(MAX_PAGES, int(self.max_pages)))
        self.page_size = max(1, min(50, int(self.page_size)))
        self.crawl_delay_seconds = max(0.35, float(self.crawl_delay_seconds))
        self.jitter_min = max(0.0, float(self.jitter_min))
        self.jitter_max = max(self.jitter_min, float(self.jitter_max))
        self.retries_per_engine = max(1, min(3, int(self.retries_per_engine)))
        self.probe_timeout_seconds = max(4.0, min(15.0, float(self.probe_timeout_seconds)))
        self.page_timeout_seconds = max(8.0, min(40.0, float(self.page_timeout_seconds)))
        self.timeout_seconds = self.page_timeout_seconds
        return self


def _from_mapping(raw: dict) -> Settings:
    engines = raw.get("engines") or ENGINE_ORDER
    if isinstance(engines, str):
        engines = [e.strip() for e in engines.split(",") if e.strip()]
    return Settings(
        engines=tuple(str(e) for e in engines if str(e) in ENGINE_ORDER) or ENGINE_ORDER,
        max_pages=int(raw.get("maxPages") or raw.get("max_pages") or MAX_PAGES),
        page_size=int(raw.get("pageSize") or raw.get("page_size") or PAGE_SIZE),
        crawl_delay_seconds=float(raw.get("crawlDelaySeconds") or raw.get("crawl_delay_seconds") or 0.9),
        jitter_min=float(raw.get("jitterMin") or raw.get("jitter_min") or 0.2),
        jitter_max=float(raw.get("jitterMax") or raw.get("jitter_max") or 0.8),
        retries_per_engine=int(raw.get("retriesPerEngine") or raw.get("retries_per_engine") or 1),
        timeout_seconds=float(raw.get("timeoutSeconds") or raw.get("timeout_seconds") or 18),
        probe_timeout_seconds=float(raw.get("probeTimeoutSeconds") or raw.get("probe_timeout_seconds") or 8),
        page_timeout_seconds=float(
            raw.get("pageTimeoutSeconds")
            or raw.get("page_timeout_seconds")
            or raw.get("timeoutSeconds")
            or raw.get("timeout_seconds")
            or 18
        ),
        headless=bool(raw.get("headless") if "headless" in raw else True),
        locale=str(raw.get("locale") or "fr-FR"),
        output_dir=str(raw.get("outputDir") or raw.get("output_dir") or ""),
        entire_home_only=bool(raw.get("entireHomeOnly") if "entireHomeOnly" in raw or "entire_home_only" in raw else True),
        stay_total_only=bool(raw.get("stayTotalOnly") if "stayTotalOnly" in raw or "stay_total_only" in raw else True),
        warmup=bool(raw.get("warmup") if "warmup" in raw else True),
    ).clamp()


def load_file() -> dict:
    if not CONFIG_PATH.is_file():
        return {}
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def load_settings(params: dict | None = None) -> Settings:
    merged: dict = {}
    merged.update(load_file())
    env_engines = os.environ.get("SKITRACK_BOOKING_ENGINES", "").strip()
    if env_engines:
        merged["engines"] = env_engines
    if os.environ.get("SKITRACK_BOOKING_CRAWL_DELAY"):
        merged["crawlDelaySeconds"] = _env_float("SKITRACK_BOOKING_CRAWL_DELAY", 1.5)
    if os.environ.get("SKITRACK_BOOKING_MAX_PAGES"):
        merged["maxPages"] = _env_int("SKITRACK_BOOKING_MAX_PAGES", MAX_PAGES)
    if os.environ.get("SKITRACK_BOOKING_TIMEOUT"):
        merged["timeoutSeconds"] = _env_float("SKITRACK_BOOKING_TIMEOUT", 18)
    if os.environ.get("SKITRACK_BOOKING_HEADLESS"):
        merged["headless"] = _env_bool("SKITRACK_BOOKING_HEADLESS", True)
    if os.environ.get("SKITRACK_BOOKING_OUT"):
        merged["outputDir"] = os.environ["SKITRACK_BOOKING_OUT"].strip()
    if params:
        merged.update({k: v for k, v in params.items() if v is not None})
        if params.get("maxPages") is not None:
            merged["maxPages"] = params["maxPages"]
        if params.get("timeoutMs") is not None:
            merged["timeoutSeconds"] = float(params["timeoutMs"]) / 1000.0
        if params.get("outDir") or params.get("outputDir"):
            merged["outputDir"] = params.get("outDir") or params.get("outputDir")
    return _from_mapping(merged)
