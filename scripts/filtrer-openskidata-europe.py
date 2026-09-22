"""Découpe les quatre jeux openskidata.org au périmètre européen de Skitrack.

    python scripts/filtrer-openskidata-europe.py <dossier des .geojson> <dossier de sortie>

Lit en flux (`ijson`) `runs.geojson`, `lifts.geojson`, `ski_areas.geojson` et
`spots.geojson` tels que les publie https://openskidata.org — 844 Mo pour les
pistes du monde, trop pour un `JSON.parse` — et n'écrit que ce que la
tuilage demande : les objets des cinquante pays du périmètre, avec les seules
propriétés que le formateur d'OpenSkiMap lit (`MapboxGLFormatter.ts` du
dépôt openskidata-processor). Tout le reste — profils d'altitude, sources,
sites web, statistiques détaillées — reste dans le fichier d'origine.

## Le périmètre

Un objet est retenu si l'une de ses `places` porte un code ISO 3166-2 dont
le pays est dans `PERIMETRE` — la même liste que `build-monde.py`. Un objet
sans `places` (rare : un tracé isolé que le processeur n'a rattaché à
aucun pays) est retenu s'il tombe dans l'emprise large de l'Europe et de
ses marges caucasienne et kazakhe ; le tuilage ne remplit pas de trou, il
évite seulement d'en creuser.

## Ce qui sort

Un GeoJSON par jeu, `eu-<jeu>.geojson`, un objet par ligne dans le tableau
`features`, pour que le tuilage puisse le relire d'un seul `JSON.parse`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import ijson

PERIMETRE = {
    "AD", "AL", "AM", "AT", "AZ", "BA", "BE", "BG", "BY", "CH", "CY",
    "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GE", "GR", "HR",
    "HU", "IE", "IS", "IT", "KZ", "LI", "LT", "LU", "LV", "MC", "MD",
    "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "SE", "SI",
    "SK", "SM", "TR", "UA", "VA", "XK",
}

# Emprise de secours : Islande à l'ouest, Kazakhstan à l'est, Chypre au sud.
EMPRISE = (-25.0, 34.0, 88.0, 72.0)

# Les propriétés que MapboxGLFormatter.ts lit, par jeu. `skiAreas`, `stations`
# et `places` sont réduits à leurs identifiants ou codes.
PROPRIETES = {
    "runs": [
        "id", "name", "ref", "uses", "difficulty", "difficultyConvention",
        "oneway", "lit", "gladed", "patrolled", "grooming", "snowmaking",
        "snowfarming", "tunnel", "status",
    ],
    # `heating`, `bubble`, `occupancy` : le nom affiché d'une remontée les
    # porte (« Heated 6p Chairlift »), voir getLiftNameAndType.
    "lifts": [
        "id", "name", "ref", "liftType", "status", "access", "tunnel", "oneway",
        "heating", "bubble", "occupancy",
    ],
    "ski_areas": ["id", "name", "status", "activities"],
    "spots": ["id", "name", "spotType", "dismount", "liftId", "position", "entry", "exit"],
}


def pays_de(places) -> set[str]:
    out = set()
    for p in places or []:
        code = p.get("iso3166_2") or ""
        if len(code) >= 2:
            out.add(code[:2])
    return out


def premier_point(geom):
    c = geom.get("coordinates")
    while isinstance(c, list) and c and isinstance(c[0], list):
        c = c[0]
    return c if isinstance(c, list) and len(c) >= 2 else None


def retenu(feature) -> bool:
    # L'emprise s'applique à tous : la Réunion ou la Guadeloupe sont « FR »
    # pour les places, pas pour la carte d'Europe.
    pt = premier_point(feature.get("geometry") or {})
    if not pt:
        return False
    lon, lat = float(pt[0]), float(pt[1])
    if not (EMPRISE[0] <= lon <= EMPRISE[2] and EMPRISE[1] <= lat <= EMPRISE[3]):
        return False
    pays = pays_de(feature["properties"].get("places"))
    return bool(pays & PERIMETRE) if pays else True


def statistiques_reduites(stats):
    """Ce que le formateur lit : km par activité et difficulté, altitudes."""
    if not stats:
        return None
    out = {}
    runs = (stats.get("runs") or {}).get("byActivity") or {}
    par_activite = {}
    for activite, bloc in runs.items():
        par_diff = {}
        for diff, v in ((bloc or {}).get("byDifficulty") or {}).items():
            par_diff[diff] = {"lengthInKm": float(v.get("lengthInKm") or 0)}
        par_activite[activite] = {"byDifficulty": par_diff}
    out["runs"] = {"byActivity": par_activite}
    for k in ("minElevation", "maxElevation"):
        if stats.get(k) is not None:
            out[k] = float(stats[k])
    return out


def reduire(jeu: str, feature):
    p = feature["properties"]
    out = {k: p.get(k) for k in PROPRIETES[jeu] if k in p}
    out["places"] = sorted(pays_de(p.get("places")))
    if "skiAreas" in p:
        out["skiAreas"] = [
            (s.get("properties") or {}).get("id") for s in (p.get("skiAreas") or []) if isinstance(s, dict)
        ]
    if jeu == "lifts":
        out["stations"] = [
            (s.get("properties") or {}).get("id") for s in (p.get("stations") or []) if isinstance(s, dict)
        ]
    if jeu == "ski_areas":
        out["statistics"] = statistiques_reduites(p.get("statistics"))
    return {"type": "Feature", "geometry": feature["geometry"], "properties": out}


def convertir(o):
    """ijson rend des Decimal ; JSON n'en veut pas."""
    if isinstance(o, list):
        return [convertir(x) for x in o]
    if isinstance(o, dict):
        return {k: convertir(v) for k, v in o.items()}
    if hasattr(o, "as_integer_ratio") and not isinstance(o, (int, float, bool)):
        f = float(o)
        return int(f) if f.is_integer() and abs(f) < 1e15 else f
    return o


def main() -> None:
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    dst.mkdir(parents=True, exist_ok=True)
    # Un troisième argument restreint aux jeux nommés (`lifts,spots`).
    jeux = sys.argv[3].split(",") if len(sys.argv) > 3 else ["ski_areas", "lifts", "spots", "runs"]
    for jeu in jeux:
        entree, sortie = src / f"{jeu}.geojson", dst / f"eu-{jeu}.geojson"
        lus = gardes = 0
        with open(entree, "rb") as f, open(sortie, "w", encoding="utf-8", newline="\n") as w:
            w.write('{"type":"FeatureCollection","features":[\n')
            premier = True
            for feature in ijson.items(f, "features.item", use_float=True):
                lus += 1
                if not retenu(feature):
                    continue
                gardes += 1
                if not premier:
                    w.write(",\n")
                premier = False
                w.write(json.dumps(convertir(reduire(jeu, feature)), ensure_ascii=False, separators=(",", ":")))
            w.write("\n]}\n")
        print(f"{jeu:10s} {lus:7d} lus  {gardes:7d} gardés  -> {sortie} ({sortie.stat().st_size / 1e6:.1f} Mo)")


if __name__ == "__main__":
    main()
