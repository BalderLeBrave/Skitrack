"""Altitude du logement (IGN) et accès pistes. Indépendant des autres sources.

Distance aux pistes : sidecar Skitrack si dispo, sinon Overpass OSM, sinon
uniquement ce que l’annonce publie (skis aux pieds / pied des pistes).
On n’invente pas un mètre.
"""

from __future__ import annotations

import json
import math
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

EARTH_M = 6_371_008.8
SKI_IN_DIST_M = 150.0
SKI_IN_CLIMB_M = 15.0
SHUTTLE_M = 1_200.0
SKI_IN_RE = re.compile(
    r"skis?\s*aux\s*pieds|ski-in|ski\s*in\s*ski\s*out|pied\s+des\s+pistes|"
    r"au\s+pied\s+des\s+pistes|ski\s+aux\s+pieds|acc[eè]s\s+pistes",
    re.I,
)
SURFACE_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*m(?:²|2)\b", re.I)
IGN_URL = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json"
OPEN_METEO = "https://api.open-meteo.com/v1/elevation"
SIDECAR = os.environ.get("SKITRACK_SIDECAR_URL", "http://127.0.0.1:8000").rstrip("/")


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_M * math.asin(min(1.0, math.sqrt(a)))


def published_ski_in(*texts: str | None) -> bool:
    blob = " ".join(t for t in texts if t)
    return bool(blob and SKI_IN_RE.search(blob))


def surface_m2(text: str | None) -> float | None:
    if not text:
        return None
    m = SURFACE_RE.search(text)
    if not m:
        return None
    return float(m.group(1).replace(",", "."))


def _metres_per_degree(lat: float) -> tuple[float, float]:
    lat_m = math.pi * EARTH_M / 180.0
    return lat_m, lat_m * math.cos(math.radians(lat))


def nearest_dist_m(lat: float, lon: float, lines: list[list[tuple[float, float]]]) -> float | None:
    if not lines:
        return None
    per_lat, per_lon = _metres_per_degree(lat)
    px, py = lon * per_lon, lat * per_lat
    best = None
    for line in lines:
        for i, (lat_a, lon_a) in enumerate(line):
            ax, ay = lon_a * per_lon, lat_a * per_lat
            if i + 1 >= len(line):
                d = math.hypot(px - ax, py - ay)
            else:
                lat_b, lon_b = line[i + 1]
                bx, by = lon_b * per_lon, lat_b * per_lat
                dx, dy = bx - ax, by - ay
                length = dx * dx + dy * dy
                t = 0.0 if length == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if best is None or d < best:
                best = d
    return best


def elevations_ign(points: list[tuple[float, float]]) -> list[float | None]:
    if not points:
        return []
    lons = "|".join(f"{lon:.6f}" for _, lon in points)
    lats = "|".join(f"{lat:.6f}" for lat, _ in points)
    url = IGN_URL + "?" + urllib.parse.urlencode(
        {"lon": lons, "lat": lats, "resource": "ign_rge_alti_wld", "delimiter": "|", "zonly": "true"}
    )
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=12) as res:
        data = json.loads(res.read().decode("utf-8"))
    raw = data.get("elevations") if isinstance(data, dict) else None
    out: list[float | None] = []
    if isinstance(raw, list):
        for z in raw:
            if isinstance(z, dict):
                z = z.get("z")
            if isinstance(z, (int, float)) and z > -1000:
                out.append(float(z))
            else:
                out.append(None)
    while len(out) < len(points):
        out.append(None)
    return out[: len(points)]


def elevations_open_meteo(points: list[tuple[float, float]]) -> list[float | None]:
    if not points:
        return []
    lats = ",".join(f"{lat:.6f}" for lat, _ in points)
    lons = ",".join(f"{lon:.6f}" for _, lon in points)
    url = OPEN_METEO + "?" + urllib.parse.urlencode({"latitude": lats, "longitude": lons})
    with urllib.request.urlopen(url, timeout=12) as res:
        data = json.loads(res.read().decode("utf-8"))
    els = data.get("elevation") if isinstance(data, dict) else None
    if not isinstance(els, list):
        return [None] * len(points)
    out: list[float | None] = []
    for z in els:
        out.append(float(z) if isinstance(z, (int, float)) else None)
    while len(out) < len(points):
        out.append(None)
    return out[: len(points)]


def elevations(points: list[tuple[float, float]]) -> list[float | None]:
    try:
        got = elevations_ign(points)
        if any(z is not None for z in got):
            return got
    except (OSError, TimeoutError, json.JSONDecodeError, urllib.error.URLError):
        pass
    try:
        return elevations_open_meteo(points)
    except (OSError, TimeoutError, json.JSONDecodeError, urllib.error.URLError):
        return [None] * len(points)


def _overpass_lines(lat: float, lon: float, radius_m: int = 2200) -> tuple[list, list]:
    q = (
        f"[out:json][timeout:10];("
        f'way["piste:type"](around:{radius_m},{lat:.5f},{lon:.5f});'
        f'way["aerialway"](around:{radius_m},{lat:.5f},{lon:.5f});'
        f");out geom;"
    )
    body = urllib.parse.urlencode({"data": q}).encode()
    hosts = (
        os.environ.get("SKITRACK_OVERPASS_URL") or "https://overpass-api.de/api/interpreter",
    )
    if os.environ.get("SKITRACK_SKIP_OVERPASS", "").strip() in ("1", "true", "yes"):
        return [], []
    pistes: list[list[tuple[float, float]]] = []
    lifts: list[list[tuple[float, float]]] = []
    for host in hosts:
        try:
            req = urllib.request.Request(host, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
            raw = urllib.request.urlopen(req, timeout=12).read()
            data = json.loads(raw.decode("utf-8"))
        except (OSError, TimeoutError, json.JSONDecodeError, urllib.error.URLError):
            continue
        for el in data.get("elements") or []:
            geom = el.get("geometry") or []
            line = [(float(p["lat"]), float(p["lon"])) for p in geom if "lat" in p and "lon" in p]
            if len(line) < 2:
                continue
            tags = el.get("tags") or {}
            if tags.get("piste:type"):
                pistes.append(line)
            elif tags.get("aerialway"):
                lifts.append(line)
        if pistes or lifts:
            return pistes, lifts
    return pistes, lifts


def _sidecar(points: list[tuple[str, float, float]], domain_id: int | None) -> dict[str, dict]:
    if not domain_id:
        return {}
    payload = {
        "domain_id": domain_id,
        "with_elevation": True,
        "lodgings": [{"ref": ref, "lat": lat, "lon": lon} for ref, lat, lon in points],
    }
    req = urllib.request.Request(
        SIDECAR + "/api/lodgings/access",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            data = json.loads(res.read().decode("utf-8"))
    except (OSError, TimeoutError, json.JSONDecodeError, urllib.error.HTTPError):
        return {}
    out: dict[str, dict] = {}
    for row in data.get("results") or []:
        if isinstance(row, dict) and row.get("ref"):
            out[str(row["ref"])] = row
    return out


def _classify(dist: float | None, climb: float | None, ski_in_text: bool) -> str | None:
    if ski_in_text or (
        dist is not None
        and dist <= SKI_IN_DIST_M
        and (climb is None or abs(climb) <= SKI_IN_CLIMB_M)
    ):
        return "skis_aux_pieds"
    if dist is not None and dist <= SHUTTLE_M:
        return "navette"
    if dist is not None:
        return "voiture"
    if ski_in_text:
        return "skis_aux_pieds"
    return None


def enrich(listings: list[dict[str, Any]], *, domain_id: int | None = None) -> list[dict[str, Any]]:
    geo: list[tuple[str, float, float, int]] = []
    for i, row in enumerate(listings):
        lat, lon = row.get("latitude"), row.get("longitude")
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            geo.append((str(row.get("sourceId") or i), float(lat), float(lon), i))
        ski = published_ski_in(row.get("title"), row.get("unitType"), row.get("propertyType"), row.get("location"))
        row["skiIn"] = bool(ski)
        if ski:
            row["accessType"] = "skis_aux_pieds"
        surf = surface_m2(str(row.get("unitType") or "") + " " + str(row.get("propertyType") or ""))
        if surf:
            row["areaSqm"] = surf

    if not geo:
        return listings

    alts = elevations([(lat, lon) for _, lat, lon, _ in geo])
    for (ref, lat, lon, idx), alt in zip(geo, alts):
        if alt is not None:
            listings[idx]["altitudeM"] = round(alt)
            listings[idx]["altitudeSource"] = "ign"

    side = _sidecar([(ref, lat, lon) for ref, lat, lon, _ in geo], domain_id)
    pistes: list[list[tuple[float, float]]] = []
    lifts: list[list[tuple[float, float]]] = []
    if not side:
        lat0, lon0 = geo[0][1], geo[0][2]
        pistes, lifts = _overpass_lines(lat0, lon0)

    for ref, lat, lon, idx in geo:
        row = listings[idx]
        metric = side.get(ref) or {}
        dist_slope = metric.get("dist_to_nearest_slope_m")
        dist_lift = metric.get("dist_to_nearest_lift_m")
        dist = metric.get("dist_to_slopes_m")
        den = metric.get("denivele_m")
        if dist_slope is None and pistes:
            dist_slope = nearest_dist_m(lat, lon, pistes)
        if dist_lift is None and lifts:
            dist_lift = nearest_dist_m(lat, lon, lifts)
        if dist is None:
            cands = [d for d in (dist_slope, dist_lift) if isinstance(d, (int, float))]
            dist = min(cands) if cands else None
        if isinstance(dist_slope, (int, float)):
            row["distToSlopeM"] = int(round(dist_slope))
        if isinstance(dist_lift, (int, float)):
            row["distToLiftM"] = int(round(dist_lift))
        if isinstance(dist, (int, float)):
            row["distToSlopesM"] = int(round(dist))
            row["walkMinutes"] = max(1, int(round(dist / 50.0)))
        if isinstance(den, (int, float)):
            row["deniveleM"] = int(round(den))
        elif isinstance(dist, (int, float)) and row.get("altitudeM") and dist <= 3000:
            # pas de dénivelé inventé sans point d'accès altimétré
            pass
        if metric.get("altitude_m") and "altitudeM" not in row:
            row["altitudeM"] = int(round(float(metric["altitude_m"])))
            row["altitudeSource"] = "sidecar"
        ski_text = bool(row.get("skiIn"))
        access = metric.get("slope_access_type") or _classify(
            float(dist) if isinstance(dist, (int, float)) else None,
            float(den) if isinstance(den, (int, float)) else None,
            ski_text,
        )
        if access:
            row["accessType"] = access
            row["skiIn"] = access == "skis_aux_pieds"
        if isinstance(dist, (int, float)):
            if dist_slope is not None and dist == dist_slope:
                row["accessPoint"] = "piste"
            elif dist_lift is not None and dist == dist_lift:
                row["accessPoint"] = "remontee"
    return listings
