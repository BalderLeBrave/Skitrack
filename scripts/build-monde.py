#!/usr/bin/env python3
"""Référentiel mondial des domaines skiables, depuis OpenSkiMap.

Frère de `build-openskimap.py`, dont il reprend `cam()`, `dist_km()` et la
forme de `parse_area()`. Une seule différence de fond : le script français
jette tout ce qui n'est pas `iso3166_1Alpha2 == "FR"` dès la lecture ; celui-ci
garde le monde et range par pays.

## La source

Les fichiers de données d'OpenSkiMap se téléchargent sur **openskidata.org**,
et non sur openskimap.org, qui est le site de consultation. C'est le dépôt
`russellporter/openskidata-processor` qui le dit, dans son README :
« Data outputs are available for download at OpenSkiData.org ».

Le fichier attendu est celui des domaines, `ski_areas.geojson`. Passez son
chemin par `--src`. Il n'est pas versionné : il reste dans un répertoire
temporaire, et sa date se note dans `docs/REFERENTIEL-MONDE.md`.

## Le schéma

Les noms de champs ne sont pas devinés. Ils viennent du paquet publié
`openskidata-format`, version 16.0.0, qui est la définition TypeScript des
fichiers produits. Trois de ses propriétés changent ce qu'on croyait pouvoir
faire, et sont traitées ici plutôt que découvertes plus tard :

1. **`id` n'est pas stable.** Le schéma le dit en toutes lettres : « The ID is
   just a hash of the feature, so will change if the feature changes in any
   way. If a stable identifier is needed, use the wikidataID property, or a
   source id. » Il ne peut donc pas servir de clé de rattachement d'un relevé
   au suivant. Le script remonte les trois candidats, `id`, `wikidataID` et
   les identifiants de `sources`, pour que le choix se fasse sur des chiffres.
2. **Un domaine n'a pas de nom traduit.** `name` est une chaîne unique. Seuls
   les lieux de `places` portent `localized`, et seulement en anglais. Il n'y a
   donc ni nom français ni nom anglais à extraire au niveau du domaine.
3. **`statistics` est facultatif.** Un domaine peut n'avoir aucune statistique.
   Ce n'est pas zéro kilomètre : c'est une absence de mesure, et les deux ne se
   confondent pas. Le script les compte séparément.

## Modes

    python3 scripts/build-monde.py --src /tmp/ski_areas.geojson --recenser

Recense, sans rien écrire : effectifs par pays pour chaque seuil envisagé,
répartition des sources, et de quoi trancher entre « une station par domaine »
et « une station par localité ». C'est ce que les deux validations demandent.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

# Les quatre difficultés qu'OpenSkiMap distingue, et la couleur du dépôt.
# `RunStatisticsByDifficulty` porte en plus une clé « other », que le
# référentiel français range déjà à part sous `nOther` plutôt que de la fondre
# dans les quatre couleurs.
DIFF = {"novice": "green", "easy": "blue", "intermediate": "red", "advanced": "black"}


def cam(s: str) -> str:
    """Repris tel quel de `build-openskimap.py` : mêmes clés des deux côtés."""
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def dist_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Repris tel quel de `build-openskimap.py`."""
    lat1, lon1 = a
    lat2, lon2 = b
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def parse_area(p: dict) -> dict | None:
    """Un domaine, ou `None` s'il n'a rien à faire ici.

    Le seul rejet inconditionnel est l'absence de ski alpin : un domaine de
    fond n'est pas une station de ski alpin, et la question ne se discute pas
    par seuil. Tout le reste, statut compris, est laissé au recensement, parce
    que c'est précisément ce qu'il faut chiffrer avant de trancher.

    **Rien n'est estimé.** Une statistique absente vaut `None` et non zéro. Un
    domaine sans `statistics` ressort avec `km`, `n` et `lifts` à `None`, ce
    qui se distingue d'un domaine mesuré à zéro.
    """
    if "downhill" not in (p.get("activities") or []):
        return None

    places = p.get("places") or []
    # Un domaine peut chevaucher une frontière : `places` porte alors plusieurs
    # pays. On garde la liste entière, l'arbitrage est l'affaire de l'étape des
    # frontières, pas de la lecture.
    pays = []
    for x in places:
        cc = x.get("iso3166_1Alpha2")
        if cc and cc not in pays:
            pays.append(cc)
    premier = places[0] if places else {}
    loc = (premier.get("localized") or {}).get("en") or {}

    st = p.get("statistics")
    if st is None:
        n = km = lifts = None
        counts = kms = None
        n_other = None
        min_e = max_e = None
    else:
        by = ((st.get("runs") or {}).get("byActivity") or {}).get("downhill") or {}
        by = by.get("byDifficulty") or {}
        counts, kms = {}, {}
        n, km = 0, 0.0
        for k, col in DIFF.items():
            b = by.get(k) or {}
            c = int(b.get("count") or 0)
            longueur = float(b.get("lengthInKm") or 0)
            counts[col] = c
            kms[col] = round(longueur, 1)
            n += c
            km += longueur
        km = round(km, 1)
        n_other = int((by.get("other") or {}).get("count") or 0)
        par_type = (st.get("lifts") or {}).get("byType") or {}
        lifts = sum(int((v or {}).get("count") or 0) for v in par_type.values())
        min_e = st.get("minElevation")
        max_e = st.get("maxElevation")

    centre = (p.get("viewportHint") or {}).get("center")
    lat = lon = None
    if centre and len(centre) == 2:
        # `ViewportHint.center` est documenté « [lng, lat] », dans cet ordre.
        lon, lat = float(centre[0]), float(centre[1])

    nom = p.get("name") or ""
    sources = p.get("sources") or []
    return {
        "osmId": p.get("id"),
        "wikidata": p.get("wikidataID"),
        # Les identifiants d'origine, seuls stables d'un relevé au suivant.
        "sources": [{"type": s.get("type"), "id": s.get("id")} for s in sources],
        "name": nom,
        "key": cam(nom) if nom else "",
        "pays": pays,
        "iso3166_2": premier.get("iso3166_2"),
        "region": loc.get("region"),
        "localite": loc.get("locality"),
        "statut": p.get("status"),
        "activites": p.get("activities") or [],
        "mesure": st is not None,
        "n": n,
        "km": km,
        "counts": counts,
        "kms": kms,
        "nOther": n_other,
        "lifts": lifts,
        "minM": round(min_e) if min_e is not None else None,
        "maxM": round(max_e) if max_e is not None else None,
        "sites": p.get("websites") or [],
        "lat": lat,
        "lon": lon,
    }


def lire(src: Path) -> list[dict]:
    with src.open(encoding="utf-8") as fh:
        geo = json.load(fh)
    out = []
    for f in geo.get("features") or []:
        a = parse_area(f.get("properties") or {})
        if a:
            out.append(a)
    return out


# ---------------------------------------------------------------- recensement

#: Les seuils que la consigne demande de chiffrer avant de choisir.
#:
#: Chacun est cumulatif avec le précédent dans la lecture qu'on en fait, mais
#: mesuré séparément ici : c'est la seule façon de voir ce que chaque cran
#: coûte. « mesuré » est à part parce qu'un domaine sans statistiques n'a pas
#: zéro remontée, il n'en a aucune de relevée, et un seuil actif doit l'écarter
#: plutôt que le compter comme nul.
SEUILS: list[tuple[str, object]] = [
    ("alpin", lambda a: True),
    ("en exploitation", lambda a: a["statut"] == "operating"),
    ("mesuré", lambda a: a["mesure"]),
    ("1 remontée ou plus", lambda a: (a["lifts"] or 0) >= 1),
    ("3 remontées ou 5 km", lambda a: (a["lifts"] or 0) >= 3 or (a["km"] or 0) >= 5),
    ("10 km ou plus", lambda a: (a["km"] or 0) >= 10),
]


def pays_principal(a: dict) -> str:
    """Le premier pays listé. Les domaines à cheval sont traités à part."""
    return a["pays"][0] if a["pays"] else "??"


def recenser(areas: list[dict], detail: list[str]) -> None:
    cumul: list[dict] = []
    retenus = areas
    print(f"Domaines de ski alpin lus : {len(areas)}\n")

    print("## Effectifs par seuil, cumulés\n")
    print(f"{'seuil':<22}{'domaines':>10}{'pays':>8}{'perdus':>9}")
    for nom, test in SEUILS:
        avant = len(retenus)
        retenus = [a for a in retenus if test(a)]
        pays = {pays_principal(a) for a in retenus}
        print(f"{nom:<22}{len(retenus):>10}{len(pays):>8}{avant - len(retenus):>9}")
        cumul.append({"nom": nom, "areas": list(retenus)})
    print()

    print("## Effectifs par pays, pour chaque seuil\n")
    entetes = [c["nom"] for c in cumul]
    print(f"{'pays':<6}" + "".join(f"{h[:18]:>20}" for h in entetes))
    tous = sorted({pays_principal(a) for a in areas})
    lignes = []
    for cc in tous:
        cells = [sum(1 for a in c["areas"] if pays_principal(a) == cc) for c in cumul]
        lignes.append((cells[0], cc, cells))
    for _, cc, cells in sorted(lignes, reverse=True):
        if not cells[0]:
            continue
        print(f"{cc:<6}" + "".join(f"{v:>20}" for v in cells))
    print()

    print("## D'où viennent les entrées\n")
    types = Counter()
    combien = Counter()
    for a in areas:
        ts = sorted({s["type"] for s in a["sources"] if s.get("type")})
        combien["+".join(ts) if ts else "aucune source"] += 1
        for t in ts:
            types[t] += 1
    for k, v in combien.most_common():
        print(f"  {k:<32}{v:>8}")
    print()
    print("  Une entrée peut porter les deux sources. Total par type :")
    for k, v in types.most_common():
        print(f"    {k:<30}{v:>8}")
    print()

    print("## Identifiants stables\n")
    avec_wd = sum(1 for a in areas if a["wikidata"])
    avec_src = sum(1 for a in areas if a["sources"])
    print(f"  domaines portant un identifiant Wikidata   {avec_wd:>8} / {len(areas)}")
    print(f"  domaines portant au moins une source       {avec_src:>8} / {len(areas)}")
    print("  (`id` est un condensé du contenu : il change dès que le domaine change.)")
    print()

    print("## Domaines à cheval sur une frontière\n")
    frontaliers = [a for a in areas if len(a["pays"]) > 1]
    pluriel = "s portent" if len(frontaliers) > 1 else " porte"
    print(f"  {len(frontaliers)} domaine{pluriel} plusieurs pays.")
    for a in sorted(frontaliers, key=lambda x: x["name"])[:40]:
        print(f"    {'+'.join(a['pays']):<10} {a['name']}")
    print()

    for cc in detail:
        localites(areas, cc)


def localites(areas: list[dict], cc: str) -> None:
    """De quoi trancher entre une station par domaine et une par localité."""
    duPays = [a for a in areas if pays_principal(a) == cc]
    avec = [a for a in duPays if a["localite"]]
    noms = {a["localite"] for a in avec}
    print(f"## {cc} : domaine ou localité\n")
    print(f"  domaines                              {len(duPays):>8}")
    print(f"  domaines portant une localité         {len(avec):>8}")
    print(f"  localités distinctes                  {len(noms):>8}")
    ecarts = [a for a in avec if cam(a["localite"]) != cam(a["name"])]
    print(f"  localité différente du nom du domaine {len(ecarts):>8}")
    print("\n  Dix exemples où la localité ne dit pas la station :")
    for a in sorted(ecarts, key=lambda x: x["name"])[:10]:
        print(f"    {a['name'][:44]:<46} localité : {a['localite']}")
    print()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", type=Path, default=Path("/tmp/ski_areas.geojson"))
    ap.add_argument("--recenser", action="store_true", help="chiffrer, sans rien écrire")
    ap.add_argument(
        "--detail",
        default="AT,CH,US",
        help="pays à détailler pour le choix domaine ou localité",
    )
    args = ap.parse_args()

    if not args.src.exists():
        print(f"Source absente : {args.src}", file=sys.stderr)
        print(
            "Téléchargez `ski_areas.geojson` depuis openskidata.org, puis repassez --src.",
            file=sys.stderr,
        )
        return 2

    areas = lire(args.src)
    if args.recenser:
        recenser(areas, [c for c in args.detail.split(",") if c])
        return 0

    print("Rien à écrire : les seuils et la définition d'une station ne sont pas tranchés.")
    print("Lancez --recenser pour produire les chiffres qui les décident.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
