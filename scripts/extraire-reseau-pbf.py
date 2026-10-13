"""Les voies de chaque station, tirées d'extraits OpenStreetMap (.osm.pbf,
Geofabrik) sous la forme exacte d'une réponse Overpass JSON, pour le cache de
scripts/build-reseau-pieton.mjs (travail/reseau-pieton/<station>.overpass.json).

Les serveurs Overpass publics sont souvent saturés, et leurs miroirs servent
parfois une base vieille de plusieurs mois. Ici, tout se fait en local, en
quelques minutes pour la France entière.

Reproduit la requête du script (`requeteOverpass`) :
    way["highway"~"^(types)$"](s,o,n,e);  (une par emprise)
    (._;>;); out body qt;
c'est-à-dire : les voies des types retenus qui touchent une emprise (un nœud
dedans, ou un segment qui la traverse), et tous leurs nœuds. Une voie à cheval
sur deux extraits est prise dans le plus complet.

    node --experimental-strip-types scripts/build-reseau-pieton.mjs --emprises travail/emprises.json
    python scripts/extraire-reseau-pbf.py travail/emprises.json travail/reseau-pieton travail/osm/*.osm.pbf
    npm run reseau:pieton

Une réponse déjà en cache et plus récente que les extraits (Overpass du jour)
est gardée. Demande pyosmium (`pip install osmium`).
"""

import json
import math
import os
import sys
import time

import osmium

CASE = 0.05  # degrés, grille d'accès aux emprises


def lire_emprises(chemin):
    with open(chemin, encoding="utf-8") as f:
        j = json.load(f)
    boites = []  # (station, s, o, n, e)
    for st in j["stations"]:
        for b in st["emprises"]:
            boites.append((st["id"], b["s"], b["o"], b["n"], b["e"]))
    grille = {}
    for k, (_, s, o, n, e) in enumerate(boites):
        for cy in range(math.floor(s / CASE), math.floor(n / CASE) + 1):
            for cx in range(math.floor(o / CASE), math.floor(e / CASE) + 1):
                grille.setdefault((cy, cx), []).append(k)
    return set(j["types"]), [st["id"] for st in j["stations"]], boites, grille


def dedans(lat, lon, b):
    return b[1] <= lat <= b[3] and b[2] <= lon <= b[4]


def coupe(a, c, b):
    """Le segment a–c (lat, lon) traverse-t-il la boîte b ? (Liang-Barsky)"""
    x0, y0, x1, y1 = a[1], a[0], c[1], c[0]
    dx, dy = x1 - x0, y1 - y0
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, x0 - b[2]), (dx, b[4] - x0), (-dy, y0 - b[1]), (dy, b[3] - y0)):
        if p == 0:
            if q < 0:
                return False
        else:
            r = q / p
            if p < 0:
                if r > t1:
                    return False
                t0 = max(t0, r)
            else:
                if r < t0:
                    return False
                t1 = min(t1, r)
    return True


def plus_recent(chemin, base):
    """La réponse en cache est-elle plus récente que les extraits ?"""
    if not os.path.exists(chemin):
        return False
    with open(chemin, encoding="utf-8") as f:
        debut = f.read(4096)
    cle = '"timestamp_osm_base":"'
    i = debut.find(cle)
    if i < 0:
        return False
    ts = debut[i + len(cle):debut.find('"', i + len(cle))]
    return ts > base


def main():
    emprises, sortie, pbfs = sys.argv[1], sys.argv[2], sys.argv[3:]
    types, ids, boites, grille = lire_emprises(emprises)
    os.makedirs(sortie, exist_ok=True)

    voies = {}  # id -> (refs, tags)
    noeuds = {}  # id -> (lat, lon)
    par_station = {i: set() for i in ids}
    horodatages = []

    for pbf in pbfs:
        debut = time.time()
        ts = osmium.io.Reader(pbf, osmium.osm.osm_entity_bits.NOTHING).header().get(
            "osmosis_replication_timestamp"
        )
        if ts:
            horodatages.append(ts)
        lues = gardees = 0
        fp = (
            osmium.FileProcessor(pbf, osmium.osm.WAY | osmium.osm.NODE)
            .with_locations()
            .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
            .with_filter(osmium.filter.KeyFilter("highway"))
        )
        for w in fp:
            if w.tags.get("highway") not in types:
                continue
            lues += 1
            pts = []
            for nr in w.nodes:
                loc = nr.location
                if loc.valid():
                    pts.append((nr.ref, loc.lat, loc.lon))
            if not pts:
                continue
            la = [p[1] for p in pts]
            lo = [p[2] for p in pts]
            candidates = set()
            for cy in range(math.floor(min(la) / CASE), math.floor(max(la) / CASE) + 1):
                for cx in range(math.floor(min(lo) / CASE), math.floor(max(lo) / CASE) + 1):
                    candidates.update(grille.get((cy, cx), ()))
            if not candidates:
                continue
            touchees = set()
            for k in candidates:
                b = boites[k]
                if b[0] in touchees:
                    continue
                if any(dedans(p[1], p[2], b) for p in pts) or any(
                    coupe((pts[i][1], pts[i][2]), (pts[i + 1][1], pts[i + 1][2]), b) for i in range(len(pts) - 1)
                ):
                    touchees.add(b[0])
            if not touchees:
                continue
            gardees += 1
            # Une voie à cheval sur deux extraits : on garde la plus complète.
            ancienne = voies.get(w.id)
            if ancienne is None or len(pts) > len(ancienne[0]):
                voies[w.id] = ([p[0] for p in pts], dict(w.tags))
                for ref, lat, lon in pts:
                    noeuds[ref] = (lat, lon)
            for st in touchees:
                par_station[st].add(w.id)
        print(f"{os.path.basename(pbf)} : {lues} voies des types retenus, {gardees} dans une emprise, "
              f"{time.time() - debut:.0f} s", flush=True)

    base = min(horodatages) if horodatages else time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    ecrites = 0
    gardees_cache = []
    for st, wids in par_station.items():
        if not wids:
            continue
        chemin = os.path.join(sortie, f"{st}.overpass.json")
        if plus_recent(chemin, base):
            gardees_cache.append(st)
            continue
        refs = set()
        elements_voies = []
        for wid in sorted(wids):
            r, tags = voies[wid]
            refs.update(r)
            elements_voies.append({"type": "way", "id": wid, "nodes": r, "tags": tags})
        elements = [
            {"type": "node", "id": ref, "lat": round(noeuds[ref][0], 7), "lon": round(noeuds[ref][1], 7)}
            for ref in sorted(refs)
        ] + elements_voies
        reponse = {
            "version": 0.6,
            "generator": "extraction locale pyosmium, extraits Geofabrik",
            "osm3s": {
                "timestamp_osm_base": base,
                "copyright": "The data included in this document is from www.openstreetmap.org. "
                "The data is made available under ODbL.",
            },
            "elements": elements,
        }
        with open(chemin + ".tmp", "w", encoding="utf-8") as f:
            json.dump(reponse, f, separators=(",", ":"))
        os.replace(chemin + ".tmp", chemin)
        ecrites += 1
    vides = [st for st, w in par_station.items() if not w]
    print(f"{ecrites} stations écrites (données du {base}) ; sans aucune voie : {', '.join(vides) or 'aucune'}")
    if gardees_cache:
        print(f"Gardées, le cache étant plus récent : {', '.join(gardees_cache)}")


if __name__ == "__main__":
    main()
