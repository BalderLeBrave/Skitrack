#!/usr/bin/env python3
"""Témoin OpenSkiMap (OSM / OpenSnowMap) — France downhill. Pas injecté dans le mix."""
from __future__ import annotations

import json
import math
import re
import unicodedata
from pathlib import Path

SRC = Path("/tmp/ski_areas.geojson")
STATIONS = Path("/workspace/src/lib/stations.data.json")
SKIINFO = Path("/workspace/src/lib/skiinfo.snapshot.json")
OUT = Path("/workspace/src/lib/openskimap.snapshot.json")

DIFF = {"novice": "green", "easy": "blue", "intermediate": "red", "advanced": "black"}
OSM_NAME = {
    "chamonix": "Brévent/Flégère (Chamonix)",
    "les-houches": "Les Houches - Saint-Gervais",
}


def cam(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def dist_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = a
    lat2, lon2 = b
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def parse_area(p: dict) -> dict | None:
    places = p.get("places") or []
    if not any(x.get("iso3166_1Alpha2") == "FR" for x in places):
        return None
    if "downhill" not in (p.get("activities") or []):
        return None
    st = p.get("statistics") or {}
    by = ((st.get("runs") or {}).get("byActivity") or {}).get("downhill") or {}
    by = by.get("byDifficulty") or {}
    counts: dict[str, int] = {}
    kms: dict[str, float] = {}
    n = 0
    km = 0.0
    for k, col in DIFF.items():
        b = by.get(k) or {}
        c = int(b.get("count") or 0)
        l = float(b.get("lengthInKm") or 0)
        counts[col] = c
        kms[col] = round(l, 1)
        n += c
        km += l
    other = by.get("other") or {}
    lifts = (st.get("lifts") or {}).get("byType") or {}
    n_lifts = sum(int((v or {}).get("count") or 0) for v in lifts.values())
    center = (p.get("viewportHint") or {}).get("center")
    lat = lon = None
    if center and len(center) == 2:
        lon, lat = float(center[0]), float(center[1])
    name = p.get("name") or ""
    min_e = st.get("minElevation")
    max_e = st.get("maxElevation")
    return {
        "osmId": p.get("id"),
        "name": name,
        "key": cam(name) if name else "",
        "n": n,
        "km": round(km, 1),
        "counts": counts,
        "kms": kms,
        "nOther": int(other.get("count") or 0),
        "minM": round(min_e) if min_e is not None else None,
        "maxM": round(max_e) if max_e is not None else None,
        "lifts": n_lifts,
        "lat": lat,
        "lon": lon,
    }


def verdict(n_osm: int, km_osm: float, n_ski: int | None, km_ski: float | None) -> str:
    if n_ski and n_osm > n_ski * 1.4:
        return "segments"
    if km_ski and km_osm > km_ski * 1.4:
        return "grain_domaine"
    if km_ski and km_ski > 0 and km_osm < km_ski * 0.6:
        return "km_court"
    if n_ski and n_ski > 0 and abs(n_osm - n_ski) / n_ski > 0.25:
        return "ecart_n"
    return "ok"


def match(station: dict, areas: list[dict]) -> dict | None:
    forced = OSM_NAME.get(station["id"])
    if forced:
        hit = next((a for a in areas if a["name"] == forced), None)
        if hit:
            return hit
    key = cam(station["name"])
    cands: list[tuple[float, float, dict]] = []
    for a in areas:
        if not a["name"] or a["lat"] is None:
            continue
        d = dist_km((station["lat"], station["lon"]), (a["lat"], a["lon"]))
        score = 0.0
        if a["key"] == key or a["key"] == station["id"]:
            score = 120
        elif key in a["key"] or a["key"] in key:
            score = 70
        if d < 8:
            score = max(score, 80 - d * 3)
        if score >= 55:
            cands.append((score, d, a))
    if not cands:
        return None
    cands.sort(key=lambda x: (-x[0], x[1]))
    return cands[0][2]


def main() -> None:
    geo = json.loads(SRC.read_text())
    areas = []
    for f in geo["features"]:
        a = parse_area(f["properties"])
        if a:
            areas.append(a)
    stations = json.loads(STATIONS.read_text())
    ski = json.loads(SKIINFO.read_text())["rows"]
    rows: dict[str, dict] = {}
    for s in stations:
        a = match(s, areas)
        si = ski.get(s["id"]) or {}
        if not a:
            rows[s["id"]] = {"verdict": "osm_absent"}
            continue
        n_ski = si.get("n")
        km_ski = si.get("km")
        d = None
        if a["lat"] is not None:
            d = round(dist_km((s["lat"], s["lon"]), (a["lat"], a["lon"])), 1)
        rows[s["id"]] = {
            "osmId": a["osmId"],
            "name": a["name"],
            "n": a["n"],
            "km": a["km"],
            "counts": a["counts"],
            "kms": a["kms"],
            "nOther": a["nOther"],
            "minM": a["minM"],
            "maxM": a["maxM"],
            "lifts": a["lifts"],
            "distKm": d,
            "verdict": verdict(a["n"], a["km"], n_ski, km_ski),
        }
    OUT.write_text(
        json.dumps({"at": "2026-09-07", "source": "OpenSkiMap ski_areas.geojson", "rows": rows}, ensure_ascii=False, separators=(",", ":"))
    )
    from collections import Counter

    print("areas FR downhill", len(areas), "stations", len(rows), Counter(r["verdict"] for r in rows.values()))


if __name__ == "__main__":
    main()
