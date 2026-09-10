#!/usr/bin/env python3
"""Construit stations.data.json + skiinfo.snapshot.json depuis Skiinfo + IGN RGE ALTI."""
from __future__ import annotations

import json
from pathlib import Path

SNAP = Path("/tmp/skiinfo/snapshot.json")
DEM = Path("/tmp/skiinfo/dem.json")
OUT_DIR = Path("/workspace/src/lib")

ID_MAP = {"alpe-dhuez": "alpe-d-huez"}

# IGN géocodage : pin village / front de neige, pas un sommet / jumeau / fond de vallée.
GPS_FIX = {
    "valmeinier": {"lat": 45.18495, "lon": 6.48170, "demM": 1541},
    "oz-en-oisans": {"lat": 45.12887, "lon": 6.07081, "demM": 1333},  # Poutran
    "gavarnie-gedre": {"lat": 42.73005, "lon": -0.03155, "demM": 1825},  # station de ski
    "les-aillons-margeriaz": {"lat": 45.64289, "lon": 6.06200, "demM": 1395},  # Route de Margériaz
    "isola-2000": {"lat": 44.18301, "lon": 7.16049, "demM": 2028},  # Front de Neige
    "chalmazel": {"lat": 45.73830, "lon": 3.82436, "demM": 1147},  # Col de la Loge
    "camurac": {"lat": 42.77636, "lon": 1.92742, "demM": 1614},  # Col du Teil
    "le-mont-dore": {"lat": 45.56932, "lon": 2.80185, "demM": 1250},  # commune IGN ~ village ski
}

FEATURED = {
    "les-2-alpes": {
        "name": "Les 2 Alpes",
        "photo": "/stations/les-2-alpes.jpg",
        "fmId": 1076,
        "villageM": 1645,
        "minM": 1284,
        "maxM": 3511,
        "lat": 45.009,
        "lon": 6.122,
        "grain": "station",
    },
    "chamonix": {
        "name": "Chamonix-Mont-Blanc",
        "photo": "/stations/chamonix.jpg",
        "fmId": 1023,
        "villageM": 1075,
        "minM": 1046,
        "maxM": 2505,
        "lat": 45.923,
        "lon": 6.869,
        "grain": "valley",
    },
    "val-thorens": {
        "name": "Val Thorens",
        "photo": "/stations/val-thorens.jpg",
        "fmId": 1146,
        "villageM": 2321,
        "minM": 1110,
        "maxM": 3223,
        "lat": 45.298,
        "lon": 6.58,
        "grain": "station",
    },
    "tignes": {
        "name": "Tignes",
        "photo": "/stations/tignes.jpg",
        "fmId": 1139,
        "villageM": 2171,
        "minM": 1559,
        "maxM": 3456,
        "lat": 45.469,
        "lon": 6.907,
        "grain": "station",
    },
    "meribel": {
        "name": "Méribel",
        "photo": "/stations/meribel.jpg",
        "fmId": 1101,
        "villageM": 1413,
        "minM": 1110,
        "maxM": 3223,
        "lat": 45.397,
        "lon": 6.565,
        "grain": "station",
    },
    "val-disere": {
        "name": "Val d'Isère",
        "photo": "/stations/val-disere.jpg",
        "fmId": 1145,
        "villageM": 1829,
        "minM": 1559,
        "maxM": 3456,
        "lat": 45.448,
        "lon": 6.98,
        "grain": "station",
    },
    "alpe-d-huez": {
        "name": "Alpe d'Huez",
        "photo": "/stations/alpe-d-huez.jpg",
        "fmId": 1004,
        "villageM": 1807,
        "minM": 1124,
        "maxM": 3314,
        "lat": 45.09,
        "lon": 6.071,
        "grain": "station",
    },
    "la-clusaz": {
        "name": "La Clusaz",
        "photo": "/stations/la-clusaz.jpg",
        "fmId": 1049,
        "villageM": 1104,
        "minM": 1030,
        "maxM": 2476,
        "lat": 45.904,
        "lon": 6.423,
        "grain": "station",
    },
}

FEATURED_ORDER = [
    "les-2-alpes",
    "chamonix",
    "val-thorens",
    "tignes",
    "meribel",
    "val-disere",
    "alpe-d-huez",
    "la-clusaz",
]


def pct0(v):
    return 0 if v is None else int(v)


def pin_kind(dem: int | None, base: int | None, summit: int | None) -> str:
    if dem is None:
        return "inconnu"
    if summit is not None and abs(dem - summit) <= 150:
        return "sommet"
    if base is not None and abs(dem - base) <= 150:
        return "base"
    return "autre"


def main() -> None:
    raw = json.loads(SNAP.read_text())
    dem_rows = {r["id"]: r["demM"] for r in json.loads(DEM.read_text())}
    skiinfo = {}
    stations = {}
    skipped = []
    gps_seen: dict[tuple[float, float], str] = {}

    for row in raw["rows"]:
        if not row.get("fr"):
            skipped.append(row["id"])
            continue
        sid = ID_MAP.get(row["id"], row["id"])
        pct = {
            "green": pct0(row["pct"]["green"]),
            "blue": pct0(row["pct"]["blue"]),
            "red": pct0(row["pct"]["red"]),
            "black": pct0(row["pct"]["black"]),
        }
        has_mix = bool(row.get("n")) and sum(pct.values()) > 0
        grain = FEATURED.get(sid, {}).get("grain", "station")
        ski_min = row.get("minM")
        ski_max = row.get("maxM")
        skiinfo[sid] = {
            "n": int(row["n"]) if row.get("n") else None,
            "km": row["km"],
            "pct": pct,
            "longestKm": row.get("longestKm"),
            "grain": grain,
            "url": row["url"].replace("/station-de-ski", "/plans-des-pistes"),
            "at": "2026-09-09",
            "hasMix": has_mix,
            "minM": ski_min,
            "maxM": ski_max,
        }
        feat = FEATURED.get(sid, {})
        fix = GPS_FIX.get(sid, {})
        lat = feat.get("lat") if feat.get("lat") is not None else fix.get("lat", row["lat"])
        lon = feat.get("lon") if feat.get("lon") is not None else fix.get("lon", row["lon"])
        dem = fix.get("demM", dem_rows.get(sid))
        kind = pin_kind(dem, ski_min, ski_max)
        if feat:
            village = feat["villageM"]
        elif kind == "sommet":
            village = ski_min or dem
        elif kind == "base" and dem is not None:
            village = dem
        elif (
            kind == "autre"
            and dem is not None
            and ski_min is not None
            and ski_max is not None
            and ski_min < dem < ski_max
        ):
            village = dem
        else:
            village = ski_min or dem or 0
        key = (round(lat, 4), round(lon, 4))
        dup = key in gps_seen
        if not dup:
            gps_seen[key] = sid
        stations[sid] = {
            "id": sid,
            "name": feat.get("name") or row["name"],
            "massif": row["massif"],
            "villageM": village,
            "minM": ski_min if ski_min is not None else village,
            "maxM": ski_max if ski_max is not None else village,
            "photo": feat.get("photo"),
            "fmId": feat.get("fmId"),
            "fmVillageM": feat.get("villageM"),
            "fmMinM": feat.get("minM"),
            "fmMaxM": feat.get("maxM"),
            "demM": dem,
            "pinKind": kind,
            "gpsDup": dup,
            "lat": lat,
            "lon": lon,
            "skiinfoId": sid,
        }

    ordered = []
    for sid in FEATURED_ORDER:
        ordered.append(stations.pop(sid))
    ordered.extend(sorted(stations.values(), key=lambda s: (s["massif"], s["name"].casefold())))

    (OUT_DIR / "skiinfo.snapshot.json").write_text(
        json.dumps({"at": "2026-09-09", "rows": skiinfo}, ensure_ascii=False, separators=(",", ":"))
    )
    (OUT_DIR / "stations.data.json").write_text(
        json.dumps(ordered, ensure_ascii=False, separators=(",", ":"))
    )
    ign = {s["id"]: s["demM"] for s in ordered}
    (OUT_DIR / "alt.ign.json").write_text(json.dumps({"at": "2026-09-09", "source": "IGN RGE ALTI", "m": ign}, ensure_ascii=False, separators=(",", ":")))
    print("stations", len(ordered), "skipped CH", skipped)
    print("pin", {k: sum(1 for s in ordered if s["pinKind"] == k) for k in ("base", "sommet", "autre", "inconnu")})
    print("gpsDup", [s["id"] for s in ordered if s["gpsDup"]])


if __name__ == "__main__":
    main()
