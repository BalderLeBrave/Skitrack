"""Détail des pistes par domaine, pour le tableau dépliable de la fiche station.

    python scripts/build-pistes-detail.py <eu-runs.geojson> <eu-ski_areas.geojson> [<date du téléchargement AAAA-MM-JJ>]

Lit `eu-runs.geojson`, la sortie de `filtrer-openskidata-europe.py` (un objet
par ligne dans le tableau `features`), ligne à ligne, deux fois : aucune
dépendance, aucun appel réseau. Ne garde que les tronçons de descente (`uses`
contient `downhill`).

openskidata ne publie aucune statistique de longueur ni d'altitude par piste :
elles se calculent ici depuis la géométrie, qui porte l'altitude de chaque
point. Longueur : somme des distances à plat (haversine) entre points
successifs, comme les kilomètres du témoin. Altitudes : premier et dernier
point du tracé (départ et arrivée, le tracé d'une descente va de haut en
bas), plus haut et plus bas point. Une piste publiée comme surface (polygone)
n'a pas de longueur ; ses altitudes sont celles de son contour. Le point le
plus bas est gardé avec sa position : la fiche s'en sert pour rattacher une
piste à la station la plus proche quand openskidata ne sépare pas deux
stations d'un même domaine.

## Station et domaine

Une piste d'openskidata porte tous les domaines qui la contiennent : une piste
de Val Thorens porte « Val Thorens », « Val Thorens - Orelle » et « Les Trois
Vallées ». Un domaine en contient un autre quand il porte au moins 40 % de ses
pistes et en a au moins une fois et demie plus ; le domaine de tête d'une
station est le plus grand qui contient celui du témoin OpenSkiMap
(`src/lib/openskimap.snapshot.json`, champ `osmId`), ou ce domaine lui-même.
Un fichier est écrit par domaine de tête ; il porte aussi les pistes des
domaines qu'il contient, chacune avec la liste de ses domaines.

L'identifiant d'un domaine peut changer d'un export d'openskidata à l'autre
(Auron, Les Gets-Morzine, Portes du Soleil, Val Cenis entre le 7 et le
22 septembre 2026). Quand l'identifiant du témoin n'existe plus dans
`eu-ski_areas.geojson`, le domaine de descente qui porte exactement le même
nom le remplace, s'il est seul à le porter, et le rapport le dit.

Le regroupement des tronçons en pistes (même nom, même couleur, même secteur)
et le rattachement par proximité se font à l'affichage, dans
`src/lib/pistesDetail.ts`, où ils sont testés.

## Ce qui sort

- `public/pistes-detail/<domaine de tête>.json` : les tronçons d'un domaine,
  chargés à l'ouverture du tableau ;
- `src/lib/pistesDetail.index.json` : pour chaque domaine de tête, son nom,
  le nombre de tronçons et le cumul des longueurs ; pour chaque station, son
  fichier, son domaine dans ce fichier et les stations qui le partagent ;
- un rapport sur la sortie standard.
"""

from __future__ import annotations

import json
import math
import sys
import unicodedata
from collections import Counter
from datetime import date
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
TEMOIN = RACINE / "src" / "lib" / "openskimap.snapshot.json"
SKIINFO = RACINE / "src" / "lib" / "skiinfo.snapshot.json"
SORTIE = RACINE / "public" / "pistes-detail"
INDEX = RACINE / "src" / "lib" / "pistesDetail.index.json"
SOURCE = "openskidata.org runs.geojson, filtré au périmètre européen (scripts/filtrer-openskidata-europe.py)"
ECART_MAX = 0.10
# Un domaine en contient un autre quand il porte au moins cette part de ses
# pistes, et en a au moins autant de fois plus. Saint-François-Longchamp n'a
# que 13 de ses 27 tronçons dans « Le Grand Domaine » ; Chamrousse et
# « Domaine Skiable Chamrousse », doublons de même taille, ne se contiennent pas.
PART_CONTENUE = 0.4
RAPPORT_TAILLE = 1.5


def distance(a: list[float], b: list[float]) -> float:
    """Distance à plat en mètres entre deux points [lon, lat, …]."""
    r = 6_371_000.0
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    dla, dlo = la2 - la1, math.radians(b[0] - a[0])
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def lignes(geometrie: dict) -> tuple[list[list[list[float]]], bool]:
    """Les tracés d'une géométrie, et si c'est une surface."""
    t, c = geometrie.get("type"), geometrie.get("coordinates") or []
    if t == "LineString":
        return [c], False
    if t == "MultiLineString":
        return c, False
    if t == "Polygon":
        return c[:1], True
    if t == "MultiPolygon":
        return [p[0] for p in c if p], True
    return [], False


def altitude(point: list[float]) -> float | None:
    return round(point[2]) if len(point) > 2 and point[2] is not None else None


def troncon(p: dict, geometrie: dict) -> dict:
    traces, surface = lignes(geometrie)
    points = [pt for tr in traces for pt in tr]
    zs = [z for z in (altitude(pt) for pt in points) if z is not None]
    longueur = None if surface else round(sum(distance(tr[i - 1], tr[i]) for tr in traces for i in range(1, len(tr))))
    nom = (p.get("name") or "").strip() or None
    # Le point le plus bas, faute d'altitude le dernier du tracé.
    bas = min(points, key=lambda pt: altitude(pt) if altitude(pt) is not None else math.inf) if zs else (points[-1] if points else None)
    return {
        "nom": nom,
        "ref": p.get("ref"),
        "difficulte": p.get("difficulty"),
        "longueurM": longueur,
        "departM": None if surface or not points else altitude(points[0]),
        "arriveeM": None if surface or not points else altitude(points[-1]),
        "hautM": max(zs) if zs else None,
        "basM": min(zs) if zs else None,
        "damage": p.get("grooming"),
        "eclairee": p.get("lit"),
        "surface": surface,
        "bas": [round(bas[0], 5), round(bas[1], 5)] if bas else None,
        # Le temps du calcul seulement (`rattacher`) : bouts amont et aval du
        # tracé, ses points, contours des surfaces. L'aval est le bout le plus
        # bas ; faute d'altitude, le dernier point, sens du tracé d'OSM.
        "_bouts": [] if surface or not points else bouts(points),
        "_points": [] if surface else points,
        "_anneaux": traces if surface else [],
    }


RACCORD_M = 10
REMONTEE_M = 30
FRAGMENT_M = 100
TYPE_REMONTEE = {
    "chair_lift": "télésiège",
    "gondola": "télécabine",
    "mixed_lift": "télémix",
    "cable_car": "téléphérique",
    "funicular": "funiculaire",
    "magic_carpet": "tapis",
    "t-bar": "téléski",
    "j-bar": "téléski",
    "platter": "téléski",
    "drag_lift": "téléski",
    "rope_tow": "téléski",
}
CASE = 0.0002  # côté d'une case de l'index des points, en degrés (≈ 20 m)


def bouts(points: list[list[float]]) -> list[list[float]]:
    """[amont, aval] : le bout le plus haut, puis le plus bas."""
    a, b = points[0], points[-1]
    za, zb = altitude(a), altitude(b)
    return [b, a] if za is not None and zb is not None and zb > za else [a, b]


def proche(a: list[float], b: list[float], m: float) -> bool:
    """Deux points à moins de `m` mètres, en approximation plane."""
    dy = (a[1] - b[1]) * 111_320
    dx = (a[0] - b[0]) * 111_320 * math.cos(math.radians(a[1]))
    return dx * dx + dy * dy < m * m


def dedans(pt: list[float], anneau: list[list[float]]) -> bool:
    x, y, c, j = pt[0], pt[1], False, len(anneau) - 1
    for i in range(len(anneau)):
        xi, yi, xj, yj = anneau[i][0], anneau[i][1], anneau[j][0], anneau[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-15) + xi:
            c = not c
        j = i
    return c


def vecteur(a: list[float], b: list[float]) -> tuple[float, float]:
    return ((b[0] - a[0]) * math.cos(math.radians(a[1])), b[1] - a[1])


def ecart_angle(u: tuple[float, float], v: tuple[float, float]) -> float:
    """L'angle entre deux directions, de 0 (même sens) à π."""
    nu, nv = math.hypot(*u), math.hypot(*v)
    if not nu or not nv:
        return math.pi
    return math.acos(max(-1.0, min(1.0, (u[0] * v[0] + u[1] * v[1]) / (nu * nv))))


def descendante(points: list[list[float]]) -> list[list[float]]:
    """Les points dans le sens de la descente, du plus haut bout au plus bas."""
    za, zb = altitude(points[0]), altitude(points[-1])
    return points[::-1] if za is not None and zb is not None and zb > za else points


class Remontees:
    """Les gares des remontées : premier et dernier point de chaque tracé."""

    def __init__(self, fichier: Path) -> None:
        self.index: dict[tuple[int, int], list[tuple[str, list[float], bool]]] = {}
        for objet in objets(fichier):
            g, p = objet.get("geometry") or {}, objet.get("properties") or {}
            if g.get("type") != "LineString" or len(g.get("coordinates") or []) < 2:
                continue
            genre = TYPE_REMONTEE.get(p.get("liftType") or "", "remontée")
            nom = (p.get("name") or "").strip()
            libelle = f"{genre} {nom}" if nom else genre
            co = g["coordinates"]
            for q, bas in ((co[0], True), (co[-1], False)):
                self.index.setdefault((int(q[0] / 0.0005), int(q[1] / 0.0005)), []).append((libelle, q, bas))

    def gare(self, pt: list[float]) -> tuple[str, bool] | None:
        """La remontée dont une gare est à moins de 30 m, et si c'est son départ (en bas)."""
        cx, cy = int(pt[0] / 0.0005), int(pt[1] / 0.0005)
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                for libelle, q, bas in self.index.get((cx + i, cy + j), ()):
                    if proche(pt, q, REMONTEE_M):
                        return libelle, bas
        return None


def article(libelle: str) -> str:
    """« au télésiège X », « à la télécabine X »."""
    return f"à la {libelle}" if libelle.startswith(("télécabine", "remontée")) else f"au {libelle}"


def de_article(libelle: str) -> str:
    return f"de la {libelle}" if libelle.startswith(("télécabine", "remontée")) else f"du {libelle}"


def rattacher(ts: list[dict], remontees: Remontees | None = None) -> dict[str, int]:
    """Les tronçons sans nom d'un fichier qu'on sait rendre à une piste nommée.

    - Une liaison sans nom relie deux pistes : OSM partage le nœud de raccord,
      n'importe où le long de la piste. Elle rejoint la piste nommée où elle
      arrive, celle que touche son bout aval ; faute d'une seule piste nommée
      en aval (une route, une remontée, un carrefour de deux pistes), celle
      d'où elle part. Plusieurs pistes au même raccord : celle de même
      couleur, sinon aucune. De proche en proche, une chaîne de liaisons suit
      le même chemin (`nomDeduit`).
    - Une surface sans nom qui contient le tracé d'une piste nommée en est le
      contour dessiné, pas une piste de plus (`recouvre`).

    Rend le nombre de tronçons rattachés et de surfaces recouvrantes.
    """
    nom = lambda t: t["nom"] or t.get("nomDeduit")
    index: dict[tuple[int, int], list[tuple[str, str | None, list[float], tuple[float, float]]]] = {}

    def indexer(u: dict) -> None:
        pts = descendante(u["_points"])
        for k, q in enumerate(pts):
            sens = vecteur(q, pts[k + 1]) if k + 1 < len(pts) else vecteur(pts[k - 1], q) if k else (0.0, 0.0)
            index.setdefault((int(q[0] / CASE), int(q[1] / CASE)), []).append((nom(u), u["difficulte"], q, sens))

    def raccord(pt: list[float], couleur: str | None, sens: tuple[float, float]) -> str | None:
        """La piste nommée qui passe au point.

        Une seule : elle. Plusieurs : celle de même couleur ; plusieurs encore,
        celle que la liaison prolonge le plus droit (direction de descente la
        plus proche de la sienne au raccord).
        """
        cx, cy = int(pt[0] / CASE), int(pt[1] / CASE)
        vus = [
            (n, d, v)
            for i in (-1, 0, 1)
            for j in (-1, 0, 1)
            for n, d, q, v in index.get((cx + i, cy + j), ())
            if proche(pt, q, RACCORD_M)
        ]
        if not vus:
            return None
        if len({n for n, _, _ in vus}) == 1:
            return vus[0][0]
        memes = [x for x in vus if x[1] == couleur] or vus
        if len({n for n, _, _ in memes}) == 1:
            return memes[0][0]
        return min(memes, key=lambda x: (ecart_angle(sens, x[2]), x[0]))[0]

    for u in ts:
        if nom(u) and not u["surface"]:
            indexer(u)
    rattaches = 0
    # D'abord par l'aval seul, jusqu'à ce que rien ne bouge : une chaîne se
    # remonte depuis la piste où elle finit. Puis par l'amont, pour ce qui
    # finit hors des pistes nommées.
    for par_amont in (False, True):
        change = True
        while change:
            change = False
            for t in ts:
                if nom(t) or t["surface"] or len(t["_bouts"]) < 2:
                    continue
                amont, aval = t["_bouts"]
                pts = descendante(t["_points"])
                # Le sens de la liaison à chaque bout : elle arrive en aval,
                # elle part de l'amont.
                n = raccord(aval, t["difficulte"], vecteur(pts[-2], pts[-1]))
                if not n and par_amont:
                    n = raccord(amont, t["difficulte"], vecteur(pts[0], pts[1]))
                if n:
                    t["nomDeduit"] = n
                    indexer(t)
                    rattaches += 1
                    change = True
    recouvrantes = 0
    nommes = [pt for u in ts if nom(u) and not u["surface"] for pt in u["_points"]]
    for t in ts:
        if nom(t) or not t["surface"]:
            continue
        for anneau in t["_anneaux"]:
            xs, ys = [q[0] for q in anneau], [q[1] for q in anneau]
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            if any(x0 <= q[0] <= x1 and y0 <= q[1] <= y1 and dedans(q, anneau) for q in nommes):
                t["recouvre"] = True
                recouvrantes += 1
                break
    # Ce qui reste n'a de piste nommée à aucun bout.
    acces = ecartes = 0
    for t in ts:
        if nom(t) or t.get("recouvre"):
            continue
        if t["surface"]:
            # Une zone dessinée sans piste nommée dedans : pas une piste.
            t["ecarte"] = "surface"
            ecartes += 1
            continue
        gare = None
        if remontees and len(t["_bouts"]) == 2:
            amont, aval = t["_bouts"]
            g = remontees.gare(aval)
            if g:
                gare = f"Accès {article(g[0])}"
            else:
                g = remontees.gare(amont)
                if g:
                    gare = f"Départ {de_article(g[0])}"
        if gare:
            # Une liaison vers ou depuis une remontée : un accès, pas une piste.
            t["acces"] = gare
            acces += 1
        elif (t["longueurM"] or 0) < FRAGMENT_M:
            # Un bout de moins de 100 m relié à rien : chemin, reste de dessin.
            t["ecarte"] = "fragment"
            ecartes += 1
    for t in ts:
        for k in ("_bouts", "_points", "_anneaux"):
            t.pop(k, None)
    return {"rattaches": rattaches, "recouvrantes": recouvrantes, "acces": acces, "ecartes": ecartes}


def plier(nom: str | None) -> str:
    return unicodedata.normalize("NFD", nom or "").encode("ascii", "ignore").decode().lower().strip()


def objets(fichier: Path):
    """Les objets d'un GeoJSON écrit un par ligne (sortie de `filtrer-openskidata-europe.py`)."""
    with fichier.open(encoding="utf-8") as f:
        for ligne in f:
            ligne = ligne.strip().rstrip(",")
            if ligne.startswith('{"type":"Feature"'):
                yield json.loads(ligne)


def descentes(fichier: Path):
    """Les tronçons de descente, avec les identifiants de leurs domaines."""
    for objet in objets(fichier):
        p = objet.get("properties") or {}
        if "downhill" not in (p.get("uses") or []):
            continue
        ids = {a if isinstance(a, str) else (a.get("properties") or {}).get("id") for a in p.get("skiAreas") or []}
        yield objet, p, ids - {None}


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    fichier, fichier_domaines = Path(sys.argv[1]), Path(sys.argv[2])
    # Les remontées, à côté des pistes : `eu-lifts.geojson` du même filtrage.
    fichier_remontees = fichier.with_name(fichier.name.replace("runs", "lifts"))
    remontees = Remontees(fichier_remontees) if fichier_remontees.exists() else None
    le = sys.argv[3] if len(sys.argv) > 3 else date.fromtimestamp(fichier.stat().st_mtime).isoformat()
    temoin = json.loads(TEMOIN.read_text(encoding="utf-8"))["rows"]
    skiinfo = json.loads(SKIINFO.read_text(encoding="utf-8"))["rows"]

    # Les domaines de l'export : noms, et domaines de descente par nom pour
    # suivre un identifiant qui a changé.
    noms: dict[str, str] = {}
    par_nom: dict[str, list[str]] = {}
    for a in objets(fichier_domaines):
        p = a.get("properties") or {}
        noms[p.get("id")] = p.get("name") or ""
        if "downhill" in (p.get("activities") or []):
            par_nom.setdefault(plier(p.get("name")), []).append(p.get("id"))

    # Identifiant du témoin -> identifiant de l'export.
    lien: dict[str, str] = {}
    suivis: list[str] = []
    for st, r in sorted(temoin.items()):
        d = r.get("osmId")
        if not d or d in lien:
            continue
        if d in noms:
            lien[d] = d
            continue
        memes = par_nom.get(plier(r.get("name")), [])
        if len(memes) == 1:
            lien[d] = memes[0]
            suivis.append(f"{st} : « {r.get('name')} » {d[:8]} devenu {memes[0][:8]}")

    # Première lecture : combien de tronçons par domaine, et combien en commun.
    n: Counter[str] = Counter()
    commun: Counter[tuple[str, str]] = Counter()
    for _, _, ids in descentes(fichier):
        for a in ids:
            n[a] += 1
            for b in ids:
                if a != b:
                    commun[(a, b)] += 1

    def contenants(a: str) -> list[str]:
        return [
            b
            for (x, b), c in commun.items()
            if x == a and c >= PART_CONTENUE * n[a] and n[b] >= RAPPORT_TAILLE * n[a]
        ]

    def tete(a: str) -> str:
        c = contenants(a)
        return max(c, key=lambda b: (n[b], b)) if c else a

    def contient(grand: str, petit: str) -> bool:
        return grand == petit or grand in contenants(petit)

    # Chaque station : son domaine, son domaine de tête, les stations qui le partagent.
    aire: dict[str, str] = {}
    for st, r in temoin.items():
        a = lien.get(r.get("osmId") or "")
        if a and n[a] > 0:
            aire[st] = a
    stations: dict[str, dict] = {}
    for st, a in sorted(aire.items()):
        voisines = sorted(v for v, b in aire.items() if contient(a, b))
        stations[st] = {"fichier": tete(a), "aire": a, "voisines": voisines}
    tetes = {s["fichier"] for s in stations.values()}
    # Un domaine appartient au fichier de sa tête, si cette tête est écrite.
    membre = {a: tete(a) for a in n if tete(a) in tetes}

    # Seconde lecture : les tronçons de chaque fichier.
    par: dict[str, list[dict]] = {t: [] for t in tetes}
    for objet, p, ids in descentes(fichier):
        dans = {membre[a] for a in ids if a in membre}
        if not dans:
            continue
        t = troncon(p, objet.get("geometry") or {})
        for d in dans:
            par[d].append({**t, "aires": sorted(a for a in ids if membre.get(a) == d)})

    SORTIE.mkdir(parents=True, exist_ok=True)
    # Un domaine qui n'a plus de piste ne doit pas garder son ancien fichier.
    for ancien in SORTIE.glob("*.json"):
        ancien.unlink()
    domaines: dict[str, dict] = {}
    rangs: dict[str, dict[str, int]] = {}
    totaux: Counter[str] = Counter()
    total_sans_nom = 0
    for d, ts in sorted(par.items()):
        total_sans_nom += sum(1 for t in ts if not t["nom"])
        totaux.update(rattacher(ts, remontees))
        ts.sort(key=lambda t: ((t["nom"] or "~").lower(), t["difficulte"] or "", -(t["longueurM"] or 0)))
        aires = sorted({a for t in ts for a in t["aires"]}, key=lambda a: (-n[a], a))
        rang = rangs[d] = {a: i for i, a in enumerate(aires)}
        for t in ts:
            t["a"] = [rang[a] for a in t.pop("aires")]
        corps = {
            "domaine": d,
            "nom": noms.get(d, ""),
            "le": le,
            "source": SOURCE,
            "aires": [{"id": a, "nom": noms.get(a, ""), "n": n[a]} for a in aires],
            "troncons": ts,
        }
        (SORTIE / f"{d}.json").write_text(json.dumps(corps, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        domaines[d] = {"nom": noms.get(d, ""), "troncons": len(ts), "m": sum(t["longueurM"] or 0 for t in ts)}
    INDEX.write_text(
        json.dumps({"le": le, "source": SOURCE, "domaines": domaines, "stations": stations}, ensure_ascii=False, indent=1)
        + "\n",
        encoding="utf-8",
    )

    # Rapport, station par station.
    seules, dessous, partagees, sans, ecarts = [], [], [], [], []
    for st, r in sorted(temoin.items()):
        s = stations.get(st)
        if not s:
            sans.append(f"{st} ({r.get('verdict', 'sans osmId')})")
            continue
        a, f = s["aire"], s["fichier"]
        if len(s["voisines"]) > 1:
            partagees.append(f"{st} : « {noms[a]} » avec {', '.join(v for v in s['voisines'] if v != st)}")
        elif a != f:
            dessous.append(f"{st} : « {noms[a]} » dans « {noms[f]} »")
        else:
            seules.append(st)
        if len(s["voisines"]) == 1:
            m = sum(t["longueurM"] or 0 for t in par[f] if rangs[f][a] in t["a"])
            km_si = (skiinfo.get(st) or {}).get("km")
            if km_si and abs(m / 1000 - km_si) / km_si > ECART_MAX:
                ecarts.append(f"{st} : {m / 1000:.1f} km tracés, {km_si} km Skiinfo ({(m / 1000 - km_si) / km_si:+.0%})")
    poids = sum(p.stat().st_size for p in SORTIE.glob("*.json"))
    plus_gros = max(SORTIE.glob("*.json"), key=lambda p: p.stat().st_size)
    print(f"{len(domaines)} fichiers, {poids / 1024:.0f} Ko en tout, le plus gros {plus_gros.stat().st_size / 1024:.0f} Ko ({domaines[plus_gros.stem]['nom']}) ; {len(temoin)} stations au témoin")
    print(f"identifiants suivis par le nom : {len(suivis)}\n  " + "\n  ".join(suivis))
    print(
        f"tronçons sans nom : {total_sans_nom} ; rendus à la piste qu'ils relient : {totaux['rattaches']} ;"
        f" surfaces qui dessinent une piste nommée : {totaux['recouvrantes']} ;"
        f" accès aux remontées : {totaux['acces']} ; écartés (zones et bouts reliés à rien) : {totaux['ecartes']} ;"
        f" pistes sans nom : {total_sans_nom - sum(totaux.values())}"
    )
    print(f"station seule dans son domaine : {len(seules)}")
    print(f"station publiée comme secteur d'un domaine plus grand : {len(dessous)}\n  " + "\n  ".join(dessous))
    print(f"domaine partagé, rattachement par proximité : {len(partagees)}\n  " + "\n  ".join(partagees))
    print(f"sans détail : {len(sans)}\n  " + "\n  ".join(sans))
    print(f"écart de km supérieur à 10 % (stations non partagées) : {len(ecarts)}\n  " + "\n  ".join(ecarts))


if __name__ == "__main__":
    main()
