"""Reconnaissance d'une fiche : ou sont la capacite et la position ?

    python discover.py --url https://www.airbnb.fr/rooms/40088811
    python discover.py --from-html dump.html --url <url d'origine>

Cet outil ne sait rien extraire. Il ouvre une fiche, garde tout, et **cherche**
les cles interessantes dans ce qu'il a trouve, en rendant le chemin JSON
complet de chaque occurrence. Il existe parce que l'alternative — recopier des
chemins vus dans un article de blog — produit un extracteur qui marche le jour
ou on l'ecrit et se tait silencieusement trois mois plus tard.

La sortie est un `discovery.md` par fiche, lisible par un humain, qui dit ou se
trouve chaque valeur, ce qui manque, et ce qui ressemble a un blocage.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Iterator

import fetch
from platforms import detecter_plateforme, normaliser_url

#: Cles qui portent une capacite, selon les deux plateformes. Cherchees sans
#: tenir compte de la casse ni des separateurs : `personCapacity`,
#: `person_capacity` et `PERSON_CAPACITY` sont le meme champ.
CLES_CAPACITE = (
    "personcapacity",
    "guestcapacity",
    "maxguests",
    "maxpersons",
    "maxoccupancy",
    "occupancy",
    "sleeps",
    "capacity",
    "nbguests",
    "guestlabel",
)

CLES_POSITION = (
    "latitude",
    "longitude",
    "lat",
    "lng",
    "lon",
    "latlng",
    "coordinate",
    "coordinates",
    "mapmarker",
    "centerlat",
    "centerlng",
)

#: Cles qui disent quelque chose de la **precision** du point. Airbnb en
#: publie plusieurs, et c'est ce qui permet de ne pas faire passer un cercle de
#: quartier pour une adresse.
CLES_PRECISION = (
    "islocationexact",
    "exactlocation",
    "locationprecision",
    "showexactlocation",
    "circle",
    "radius",
    "obfuscat",
    "approximate",
)


def _normalise(cle: str) -> str:
    return re.sub(r"[^a-z0-9]", "", cle.lower())


def parcourir(noeud: Any, chemin: str = "$") -> Iterator[tuple[str, str, Any]]:
    """Parcourt un objet JSON en rendant (chemin, cle, valeur) pour chaque cle.

    Recursif et non filtre : c'est le point. On veut voir ce que la page
    contient, pas ce qu'on esperait y trouver.
    """
    if isinstance(noeud, dict):
        for k, v in noeud.items():
            sous = f"{chemin}.{k}"
            yield sous, k, v
            yield from parcourir(v, sous)
    elif isinstance(noeud, list):
        for i, v in enumerate(noeud):
            sous = f"{chemin}[{i}]"
            yield from parcourir(v, sous)


def _interessante(valeur: Any) -> bool:
    """Une valeur scalaire, courte, du genre qu'on cherche."""
    if isinstance(valeur, bool):
        return True
    if isinstance(valeur, (int, float)):
        return True
    if isinstance(valeur, str):
        return 0 < len(valeur) <= 120
    return False


def chercher(blobs: list[dict[str, Any]], cles: tuple[str, ...]) -> list[dict[str, Any]]:
    trouve: list[dict[str, Any]] = []
    for blob in blobs:
        data = blob.get("data")
        if data is None:
            continue
        for chemin, cle, valeur in parcourir(data, f"[{blob.get('id')}]"):
            if _normalise(cle) in cles and _interessante(valeur):
                trouve.append({"chemin": chemin, "cle": cle, "valeur": valeur})
    return trouve


def chercher_texte(html: str, motifs: tuple[str, ...]) -> list[dict[str, str]]:
    """Occurrences textuelles, pour ce qui n'est pas du JSON analysable."""
    out: list[dict[str, str]] = []
    bas = html.lower()
    for m in motifs:
        i = bas.find(m.lower())
        if i >= 0:
            out.append({"motif": m, "extrait": re.sub(r"\s+", " ", html[max(0, i - 70) : i + 90])})
    return out


def ecrire_rapport(art: fetch.Artefacts, dossier: Path, plateforme: str) -> None:
    cap = chercher(art.blobs, CLES_CAPACITE)
    pos = chercher(art.blobs, CLES_POSITION)
    prec = chercher(art.blobs, CLES_PRECISION)

    lignes: list[str] = []
    a = lignes.append
    a(f"# Reconnaissance — {plateforme}")
    a("")
    a(f"- URL : `{art.url}`")
    a(f"- HTTP : `{art.http_status}`")
    a(f"- HTML : {len(art.html):,} octets".replace(",", " "))
    a(f"- Blobs JSON lus : {len(art.blobs)}")
    a(f"- Reponses reseau retenues : {len(art.reseau)}")
    a(f"- Blocage detecte : **{'oui' if art.bloque else 'non'}**"
      + (f" (`{art.echec}`)" if art.echec else ""))
    a("")

    if art.bloque:
        a("## Blocage")
        a("")
        a("La page n'a pas ete servie normalement. Les dumps sont conserves ")
        a("(`page.html`, `screenshot.png`) pour constater ce que le site a rendu.")
        a("Aucune tentative de contournement n'est faite : voir `REPORT.md`, ")
        a("section des recours.")
        a("")

    def bloc(titre: str, items: list[dict[str, Any]], vide: str) -> None:
        a(f"## {titre}")
        a("")
        if not items:
            a(f"_{vide}_")
            a("")
            return
        a("| chemin JSON | cle | valeur |")
        a("| --- | --- | --- |")
        vus = set()
        for it in items:
            k = (it["chemin"], str(it["valeur"]))
            if k in vus:
                continue
            vus.add(k)
            val = str(it["valeur"]).replace("|", "\\|")[:70]
            a(f"| `{it['chemin'][:120]}` | `{it['cle']}` | {val} |")
        a("")

    bloc("Capacite", cap, "Aucune cle de capacite dans les blobs JSON.")
    bloc("Position", pos, "Aucune cle de position dans les blobs JSON.")
    bloc("Indices de precision", prec, "Aucun indice de precision publie.")

    a("## Cles de premier niveau des blobs")
    a("")
    a("Utile quand les recherches ci-dessus ne donnent rien : c'est la carte du ")
    a("territoire, avant de conclure que la donnee est absente.")
    a("")
    for blob in art.blobs[:25]:
        data = blob.get("data")
        if isinstance(data, dict):
            cles = ", ".join(list(data.keys())[:14])
        elif isinstance(data, list):
            cles = f"(liste de {len(data)})"
        else:
            cles = "(texte non analysable)"
        a(f"- `{str(blob.get('id'))[:60]}` — {cles}")
    a("")

    txt = chercher_texte(art.html, ("data-atlas-latlng", "b_map_center_latitude", "personCapacity", "voyageurs", "Max. personnes", "Personnes max"))
    a("## Occurrences textuelles dans le HTML")
    a("")
    if txt:
        for t in txt:
            a(f"- `{t['motif']}` → `{t['extrait'][:150]}`")
    else:
        a("_Aucun des motifs textuels connus._")
    a("")

    (dossier / "discovery.md").write_text("\n".join(lignes), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Reconnaissance d'une fiche Airbnb ou Booking.")
    ap.add_argument("--url", required=True)
    ap.add_argument("--from-html", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=Path("out/diagnostics"))
    ap.add_argument("--headed", action="store_true", help="Fenetre visible.")
    args = ap.parse_args()

    plateforme = detecter_plateforme(args.url)
    url, listing_id = normaliser_url(args.url)
    dossier = args.out / f"{plateforme}_{listing_id or 'inconnu'}"
    dossier.mkdir(parents=True, exist_ok=True)

    if args.from_html:
        art = fetch.html_depuis_fichier(args.from_html, url)
    else:
        art = fetch.recuperer(url, dossier, headless=not args.headed)

    ecrire_rapport(art, dossier, plateforme)
    print(f"reconnaissance ecrite : {dossier / 'discovery.md'}")
    print(f"  blobs={len(art.blobs)} reseau={len(art.reseau)} bloque={art.bloque} echec={art.echec}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
