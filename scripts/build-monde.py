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

    python3 scripts/build-monde.py --src /tmp/ski_areas.geojson --ecrire

Écrit le référentiel : un fichier par pays sous `src/lib/monde/data/`, plus
`index.json`. Les trois décisions que le recensement appelait sont prises, et
chacune est justifiée au plus près de ce qu'elle fixe : le seuil dans
`retenu()`, la clé dans `identifiant()`, le rattachement des domaines
frontaliers dans `ecrire()`.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
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


# ------------------------------------------------------------------- écriture

#: Le seuil retenu : « en exploitation », puis « mesuré », cumulés.
#:
#: 5 723 domaines dans 74 pays, sur les 7 018 domaines de ski alpin de la
#: source. **C'est la France qui l'a tranché.** Elle porte ici 340 domaines
#: alpins, 280 en exploitation, 248 avec au moins une remontée et 204 à « 3
#: remontées ou 5 km », quand le référentiel français en montre 320. Un seuil
#: plus exigeant aurait soumis l'étranger à une sélection que la France n'a
#: jamais subie, et effacé un tiers de ce que l'app affiche déjà.
#:
#: Le cran « mesuré » ne coûte rien — aucun domaine en exploitation n'est sans
#: statistiques — et il se garde pour ce qu'il dit : un domaine non relevé
#: n'est pas un domaine à zéro kilomètre.
#: Le périmètre du référentiel : une liste, arrêtée par le propriétaire.
#:
#: Cinquante pays, nommés un par un le 21 septembre 2026, « pas un seul de
#: plus ». Ce n'est **pas** « l'Europe » : cinq d'entre eux — Turquie, Géorgie,
#: Arménie, Azerbaïdjan, Kazakhstan — sont rangés en Asie par `geo/pays.ts`,
#: qui tranche d'après l'emplacement des stations et non d'après la convention
#: politique. Nommer ce périmètre « Europe » serait plus court et faux.
#:
#: La **Russie** n'y est pas, et c'est une décision distincte : elle figure
#: dans `PAYS_ECARTES`, écartée pour elle-même. Un pays absent d'ici l'est
#: parce que la liste s'arrête ; un pays nommé là-bas l'est pour lui-même.
#:
#: Six pays de la liste ne portent aucun domaine — Luxembourg, Malte, Monaco,
#: Saint-Marin, Vatican, Moldavie. Ils restent dans le périmètre : « pas un
#: seul de plus » borne la liste par le haut, pas par le bas, et un pays qui
#: n'a pas de station aujourd'hui peut en avoir une au prochain relevé.
#:
#: **Cette liste double celle de `geo/pays.ts`.** Le générateur est en Python
#: et ne lit pas le TypeScript ; `monde.test.ts` vérifie que les deux ne
#: divergent pas. `XK` y figure sans fiche là-bas : le Kosovo est dans le
#: périmètre, mais ni l'ISO 4217 ni `zone.tab` ne connaissent son code.
PERIMETRE: set[str] = {
    "AD", "AL", "AM", "AT", "AZ", "BA", "BE", "BG", "BY", "CH", "CY",
    "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GE", "GR", "HR",
    "HU", "IE", "IS", "IT", "KZ", "LI", "LT", "LU", "LV", "MC", "MD",
    "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "SE", "SI",
    "SK", "SM", "TR", "UA", "VA", "XK",
}

#: Les pays écartés du référentiel, et depuis quand.
#:
#: Ce n'est pas un seuil : ces domaines passent « en exploitation, et mesuré »
#: comme les autres. C'est une décision de périmètre du propriétaire, et elle
#: est écrite ici plutôt qu'appliquée à la main sur les fichiers — sans quoi la
#: prochaine régénération les ramènerait sans que personne ne l'ait voulu.
#:
#: Le nombre de domaines écartés est publié dans l'index, comme l'est celui des
#: domaines sans pays : une absence décidée doit se voir, faute de quoi elle se
#: confond avec une absence de données.
PAYS_ECARTES: dict[str, str] = {
    "RU": "écartée du référentiel le 21 septembre 2026, sur décision du propriétaire",
}


def retenu(a: dict) -> bool:
    """Le seuil : en exploitation, mesuré, **et nommé**.

    Les deux premiers critères datent du recensement du 18 septembre 2026. Le
    troisième a été ajouté le 21 septembre, et il écarte 818 domaines.

    Ce ne sont pas des stations. OpenSkiMap enregistre la remontée avant la
    station : un fil-neige d'hôtel, un téléski de village, un tapis d'école de
    ski entrent dans la source sans qu'aucune appellation ne leur soit attachée.
    Le relevé le montre sans ambiguïté — **deux d'entre eux sur 818 ont un site
    web**, contre deux tiers des domaines nommés.

    Il n'y a donc ni page officielle à ouvrir, ni forfait à relever, ni photo à
    chercher : un objet sans nom et sans exploitant n'a rien de tout cela. Les
    garder revenait à porter une colonne d'absences irréductibles et à faire
    passer pour un manque de travail ce qui est une propriété de la source.

    Le compte est publié dans l'index, comme celui des domaines sans pays et
    celui des pays écartés : une absence décidée doit se voir.
    """
    return a["statut"] == "operating" and a["mesure"] and bool((a.get("name") or "").strip())


def identifiant(a: dict, occupes: set[str]) -> str:
    """Une clé stable d'un relevé au suivant, que la source ne fournit pas.

    `id` est un condensé du contenu : il change dès qu'une piste bouge. Le
    `wikidataID` serait stable mais n'existe que pour 487 domaines sur 7 018.
    La clé se construit donc, comme celle du référentiel français : le pays,
    puis le nom replié.

    Deux cas la complètent, tous deux par les coordonnées arrondies au
    dix-millième de degré — environ onze mètres, assez pour séparer deux
    domaines et trop grossier pour bouger au relevé suivant :

    - un domaine sans nom, qu'OpenSkiMap accepte ;
    - deux domaines de même nom dans le même pays, ce qui arrive.
    """
    cc = pays_principal(a).lower()
    lieu = f"{a['lat']:.4f}-{a['lon']:.4f}".replace(".", "").replace("-", "m")
    base = f"{cc}-{a['key']}" if a["key"] else f"{cc}-{lieu}"
    cle = base
    if cle in occupes:
        cle = f"{base}-{lieu}"
    n = 2
    while cle in occupes:
        cle = f"{base}-{lieu}-{n}"
        n += 1
    occupes.add(cle)
    return cle


def sans_vide(d: dict) -> dict:
    """Retire les clés nulles. **Une clé absente est une valeur non relevée**,
    jamais un zéro : c'est la règle du référentiel français, tenue ici par la
    forme du fichier plutôt que par 5 723 `null` recopiés."""
    return {k: v for k, v in d.items() if v is not None and v != [] and v != {}}


def fiche(a: dict, cle: str) -> dict:
    """Ce qu'un domaine emporte dans le référentiel.

    Rien n'est calculé ni complété : chaque champ vient de la source ou
    disparaît. Les deux échelles du référentiel français se retrouvent ici —
    `km`, `n`, `lifts` et les couleurs sont d'échelle domaine ; `minM` et
    `maxM` sont les altitudes du domaine, et non celles d'un village.
    """
    return sans_vide(
        {
            "id": cle,
            "nom": a["name"],
            # Seulement quand il y en a plusieurs : 70 domaines sur 5 723.
            "pays": a["pays"] if len(a["pays"]) > 1 else None,
            "region": a["region"],
            "iso3166_2": a["iso3166_2"],
            "localite": a["localite"],
            "lat": a["lat"],
            "lon": a["lon"],
            "km": a["km"],
            "n": a["n"],
            # Ecrit meme a zero : tous les domaines retenus sont mesures,
            # donc zero « autre » est un zero releve, pas une absence.
            "nOther": a["nOther"],
            "lifts": a["lifts"],
            "counts": a["counts"],
            "kms": a["kms"],
            "minM": a["minM"],
            "maxM": a["maxM"],
            "sites": a["sites"],
            "wikidata": a["wikidata"],
            "sources": [s for s in a["sources"] if s.get("id")],
        }
    )


def cadre_des_stations(areas: list[dict]) -> list[float] | None:
    """Le cadrage d'un pays, mesuré sur ses stations et non sur ses frontières.

    `geo/pays.ts` porte un cadrage calculé sur l'emprise du pays, et dit
    lui-même ce qu'il vaut : cadrer l'Australie sur ses frontières montre Perth
    pour atteindre trois stations de Nouvelle-Galles du Sud. Celui-ci cadre ce
    que l'écran a à montrer.

    La marge d'un dixième de degré évite qu'une station se colle au bord ; sur
    un pays à station unique, elle donne au cadrage une taille plutôt qu'un
    point.
    """
    pts = [(a["lat"], a["lon"]) for a in areas if a["lat"] is not None and a["lon"] is not None]
    if not pts:
        return None
    lats = [p[0] for p in pts]
    lons = [p[1] for p in pts]
    m = 0.1
    return [
        round(min(lons) - m, 4),
        round(min(lats) - m, 4),
        round(max(lons) + m, 4),
        round(max(lats) + m, 4),
    ]


def ecrire(areas: list[dict], racine: Path, releve: str) -> int:
    """Écrit un fichier par pays, plus l'index.

    **Un domaine n'est écrit qu'une fois**, dans le fichier de son pays
    principal — le premier que la source liste. Les 70 domaines à cheval sur
    une frontière portent alors la liste entière dans `pays`, et l'index les
    rappelle dans `partages` : c'est ce qui permet aux Portes du Soleil de
    sortir aussi bien sous « France » que sous « Suisse » sans être copiées
    dans les deux fichiers.
    """
    retenus = [a for a in areas if retenu(a)]

    # Trois domaines passent le seuil sans qu'OpenSkiMap leur donne de pays.
    # Leurs coordonnées le diraient — l'un est en Chine, l'autre aux îles Åland,
    # le troisième au Svalbard — mais un référentiel qui range par pays ne peut
    # pas se permettre de deviner celui-là : c'est la règle de l'audit, « le
    # branchement se fait sur `country`, jamais sur une devinette ». Ils sont
    # donc écartés et nommés, pour qu'on sache ce qu'on n'a pas.
    apatrides = [a for a in retenus if not a["pays"]]
    retenus = [a for a in retenus if a["pays"]]

    # Les pays écartés, avant tout le reste : un domaine écarté ne doit ni
    # peupler un fichier, ni compter dans l'index, ni rester accroché à un
    # domaine frontalier par sa liste de pays.
    ecartes = [a for a in retenus if pays_principal(a) in PAYS_ECARTES]
    retenus = [a for a in retenus if pays_principal(a) not in PAYS_ECARTES]

    # Puis le périmètre. Les deux filtres sont distincts à dessein : un pays
    # nommé dans PAYS_ECARTES l'est pour lui-même, un pays hors PERIMETRE l'est
    # parce que le périmètre est ailleurs. Le second peut bouger sans que le
    # premier ne change d'avis.
    hors_perimetre = [a for a in retenus if pays_principal(a) not in PERIMETRE]
    retenus = [a for a in retenus if pays_principal(a) in PERIMETRE]
    for a in retenus:
        if any(p not in PERIMETRE for p in a["pays"]):
            a["pays"] = [p for p in a["pays"] if p in PERIMETRE]
    for a in retenus:
        # Un domaine à cheval sur une frontière dont l'un des pays est écarté
        # reste dans le référentiel — il est hébergé ailleurs —, mais il cesse
        # de désigner ce pays-là. Aucun cas au relevé du 18 septembre 2026 ;
        # la règle est écrite pour que le prochain ne passe pas en silence.
        if any(p in PAYS_ECARTES for p in a["pays"]):
            a["pays"] = [p for p in a["pays"] if p not in PAYS_ECARTES]

    par_pays: dict[str, list[dict]] = {}
    for a in retenus:
        par_pays.setdefault(pays_principal(a), []).append(a)

    data = racine / "data"
    data.mkdir(parents=True, exist_ok=True)
    for ancien in data.glob("*.json"):
        ancien.unlink()

    index: list[dict] = []
    partages: list[dict] = []
    for cc in sorted(par_pays):
        du_pays = sorted(par_pays[cc], key=lambda x: (x["name"], x["lat"] or 0))
        occupes: set[str] = set()
        fiches = []
        for a in du_pays:
            cle = identifiant(a, occupes)
            fiches.append(fiche(a, cle))
            if len(a["pays"]) > 1:
                partages.append({"id": cle, "hote": cc, "pays": a["pays"]})
        (data / f"{cc}.json").write_text(
            json.dumps(fiches, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        index.append(
            sans_vide(
                {
                    "code": cc,
                    "domaines": len(du_pays),
                    "cadre": cadre_des_stations(du_pays),
                    # De quoi peupler un écran sans ouvrir le fichier du pays.
                    "kmTotal": round(sum(a["km"] or 0 for a in du_pays), 1) or None,
                    "maxM": max((a["maxM"] or 0 for a in du_pays), default=0) or None,
                }
            )
        )

    (data / "index.json").write_text(
        json.dumps(
            {
                "releve": releve,
                "formatVersion": "16.0.0",
                "seuil": "en exploitation, mesuré, et nommé",
                "domaines": len(retenus),
                "sansPays": len(apatrides),
                "ecartes": {
                    cc: {
                        "motif": motif,
                        "domaines": sum(1 for a in ecartes if pays_principal(a) == cc),
                    }
                    for cc, motif in sorted(PAYS_ECARTES.items())
                },
                "perimetre": {
                    "quoi": "liste arrêtée par le propriétaire (Europe, Caucase et Turquie)",
                    "depuis": "2026-09-21",
                    "pays": sorted(PERIMETRE),
                    "domainesHors": len(hors_perimetre),
                },
                "pays": index,
                "partages": sorted(partages, key=lambda x: x["id"]),
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    if apatrides:
        print(f"{len(apatrides)} domaines ecartes, faute de pays dans la source :")
        for a in apatrides:
            print(f"  {a['name']:<28} {a['lat']:.4f}, {a['lon']:.4f}")

    print(f"{len(hors_perimetre)} domaines hors du perimetre, ecartes.")
    for cc, motif in sorted(PAYS_ECARTES.items()):
        n = sum(1 for a in ecartes if pays_principal(a) == cc)
        print(f"{cc} : {n} domaines ecartes du perimetre — {motif}")

    poids = sum(f.stat().st_size for f in data.glob("*.json"))
    print(f"{len(retenus)} domaines retenus, {len(par_pays)} pays.")
    print(f"{len(partages)} domaines a cheval sur une frontiere, rappeles dans l'index.")
    print(f"Ecrit dans {data} : {len(par_pays) + 1} fichiers, {poids / 1024:.0f} Ko.")
    for f in sorted(data.glob("*.json"), key=lambda f: -f.stat().st_size)[:3]:
        print(f"  {f.name:<16}{f.stat().st_size / 1024:>8.0f} Ko")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", type=Path, default=Path("/tmp/ski_areas.geojson"))
    ap.add_argument("--recenser", action="store_true", help="chiffrer, sans rien écrire")
    ap.add_argument(
        "--detail",
        default="AT,CH,US",
        help="pays à détailler pour le choix domaine ou localité",
    )
    ap.add_argument("--ecrire", action="store_true", help="écrire le référentiel par pays")
    ap.add_argument(
        "--racine",
        type=Path,
        default=Path("src/lib/monde"),
        help="où écrire le référentiel",
    )
    ap.add_argument(
        "--releve",
        default="",
        help="date du relevé, au format ISO ; par défaut, la date du fichier source",
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

    if args.ecrire:
        releve = args.releve or (
            datetime.fromtimestamp(args.src.stat().st_mtime, tz=timezone.utc)
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z")
        )
        return ecrire(areas, args.racine, releve)

    print("Rien demandé. --recenser chiffre, --ecrire écrit le référentiel.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
