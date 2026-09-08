"""Comptage des pistes alpines par couleur européenne (OpenSkiMap).

Une piste = un `source_id` OpenSkiMap (run), activité downhill, après
dédoublonnage. Expert / freeride / non coté ne sont **pas** recasés en noir.
"""

from __future__ import annotations

import datetime as dt
from collections import Counter
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import DomainSlope, SkiDomain

OSM_TO_UI = {
    "novice": "green",
    "easy": "blue",
    "intermediate": "red",
    "advanced": "black",
    "expert": "expert",
    "extreme": "expert",
    "freeride": "freeride",
}

FR_TO_UI = {
    "vert": "green",
    "bleu": "blue",
    "rouge": "red",
    "noir": "black",
    "autre": "unknown",
}

CLASSIC = ("green", "blue", "red", "black")
COLOR_KEYS = (*CLASSIC, "expert", "freeride", "unknown", "park")
UNTAGGED_RATIO_PARTIAL = 0.4
ALPINE_COVERAGE_PARTIAL = 0.6


def difficulty_ui(raw: str | None) -> str:
    if not raw:
        return "unknown"
    key = raw.strip().lower()
    return OSM_TO_UI.get(key, FR_TO_UI.get(key, "unknown"))


def empty_counts() -> dict[str, int]:
    return {k: 0 for k in COLOR_KEYS}


def normalize_counts(raw: dict[str, Any] | None) -> dict[str, int]:
    out = empty_counts()
    if not raw:
        return out
    for key, value in raw.items():
        ui = difficulty_ui(str(key)) if key not in COLOR_KEYS else key
        if ui not in out:
            ui = "unknown"
        try:
            n = int(value or 0)
        except (TypeError, ValueError):
            continue
        if n > 0:
            out[ui] = out[ui] + n
    return out


def normalize_km(raw: dict[str, Any] | None) -> dict[str, float]:
    out = {k: 0.0 for k in COLOR_KEYS}
    if not raw:
        return out
    for key, value in raw.items():
        ui = difficulty_ui(str(key)) if key not in COLOR_KEYS else key
        if ui not in out:
            ui = "unknown"
        try:
            n = float(value or 0)
        except (TypeError, ValueError):
            continue
        if n > 0:
            out[ui] = round(out[ui] + n, 2)
    return out


def alpine_classic_total(counts: dict[str, int]) -> int:
    return sum(int(counts.get(k) or 0) for k in CLASSIC)


def quality_of(counts: dict[str, int], *, alpine: int | None = None) -> str:
    total = sum(int(v or 0) for v in counts.values())
    classic = alpine if alpine is not None else alpine_classic_total(counts)
    if total <= 0 and classic <= 0:
        return "empty"
    tagged = total - int(counts.get("unknown") or 0)
    alpine_n = alpine if alpine is not None else total
    if alpine_n > 0 and tagged / alpine_n < ALPINE_COVERAGE_PARTIAL:
        return "partial"
    if total > 0 and (counts.get("unknown") or 0) / total > UNTAGGED_RATIO_PARTIAL:
        return "partial"
    return "complete"


def compact_counts(counts: dict[str, int]) -> dict[str, int]:
    return {k: int(v) for k, v in counts.items() if int(v or 0) > 0}


def compact_km(km: dict[str, float]) -> dict[str, float]:
    return {k: float(v) for k, v in km.items() if float(v or 0) > 0}


def build_report(
    counts: dict[str, int],
    km: dict[str, float] | None = None,
    *,
    source: str = "openskimap",
    osm_total: int | None = None,
    quality: str | None = None,
) -> dict[str, Any]:
    compact = compact_counts(counts)
    classic = alpine_classic_total(counts)
    total = sum(compact.values())
    q = quality or quality_of(counts)
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return {
        "quality": q,
        "source": source,
        "count_total": total,
        "count_alpine_classic": classic,
        "osm_total": osm_total if osm_total is not None else total,
        "computed_at": now,
        "km": compact_km(km or {}),
    }


def apply_report(domain: SkiDomain, counts: dict[str, int], km: dict[str, float] | None, report: dict[str, Any]) -> None:
    domain.slopes_count_by_color = compact_counts(counts) or None
    if km is not None:
        packed = compact_km(km)
        domain.slopes_km_by_color = packed or None
        domain.slopes_km_total = round(sum(packed.values()), 1) if packed else domain.slopes_km_total
    domain.slopes_report = report


def recount_domain_from_slopes(session: Session, domain: SkiDomain) -> None:
    """Agrège `domain_slope` (1 source_id = 1 piste). Écrase les stats ski_area."""
    rows = session.execute(select(DomainSlope).where(DomainSlope.domain_id == domain.id)).scalars()
    counts: Counter[str] = Counter()
    km: dict[str, float] = {k: 0.0 for k in COLOR_KEYS}
    seen: set[str] = set()
    for row in rows:
        sid = (row.source_id or "").strip()
        if sid and sid in seen:
            continue
        if sid:
            seen.add(sid)
        ui = difficulty_ui(row.difficulty)
        counts[ui] += 1
        if row.length_m and row.length_m > 0:
            km[ui] = round(km[ui] + float(row.length_m) / 1000.0, 2)
    if not counts:
        report = build_report(empty_counts(), {}, osm_total=0, quality="empty")
        apply_report(domain, empty_counts(), {}, report)
        return
    full = empty_counts()
    full.update(counts)
    osm_total = sum(full.values())
    report = build_report(full, km, osm_total=osm_total)
    apply_report(domain, full, km, report)


def recount_touched(session: Session, domain_ids: set[int]) -> int:
    n = 0
    for domain_id in domain_ids:
        domain = session.get(SkiDomain, domain_id)
        if domain is None:
            continue
        recount_domain_from_slopes(session, domain)
        n += 1
    return n


def overlay_curated_slopes(domain: SkiDomain, block: dict[str, Any]) -> None:
    """Écrase l'affichage par un décompte brochure. L'OSM reste dans osm_total."""
    counts = normalize_counts(block.get("counts") if isinstance(block.get("counts"), dict) else None)
    km_raw = block.get("km") if isinstance(block.get("km"), dict) else None
    km = normalize_km(km_raw) if km_raw else None
    previous = domain.slopes_report if isinstance(domain.slopes_report, dict) else {}
    osm_total = previous.get("osm_total") or sum((domain.slopes_count_by_color or {}).values())
    report = build_report(counts, km, source="curated", osm_total=int(osm_total or 0), quality="curated")
    if block.get("as_of"):
        report["as_of"] = str(block["as_of"])
    if block.get("url"):
        report["url"] = str(block["url"])
    if block.get("note"):
        report["note"] = str(block["note"])
    if previous.get("computed_at"):
        report["osm_computed_at"] = previous["computed_at"]
    apply_report(domain, counts, km, report)
    domain.curated = True
