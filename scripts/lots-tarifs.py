"""Découpe en lots les pages de tarifs à lire, et rassemble ce qui en est tiré.

    python scripts/lots-tarifs.py lots <dossier> [--par 5]
    python scripts/lots-tarifs.py appliquer <dossier>

`lots` écrit `<dossier>/lots-tarifs/lot-000.json` — quelques pages, avec le
nom du domaine, sa devise attendue et les tarifs qui lui manquent.

`appliquer` relit `<dossier>/tarifs-lus/*.json` et écrit
`src/lib/monde/data/tarifsLus.json`, que `build-vues-monde.ts` lit comme une
grille de plus.

## La règle de reprise

Un montant n'est gardé **qu'avec la ligne du texte d'où il sort**. Sans
elle, il n'y a aucun moyen de vérifier qu'il s'agit bien du forfait annoncé
et non d'un tarif de groupe, d'une promotion ou d'un dépôt de caution — et
c'est précisément ce qu'une lecture par expression régulière avait manqué
trois fois. La ligne doit de plus **se retrouver dans le texte relevé** :
une citation inventée écarte le montant.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

DATA = Path("src/lib/monde/data")
POSTES = ["jourAdulte", "jourEnfant", "sixJoursAdulte", "sixJoursEnfant", "saisonAdulte", "saisonEnfant"]


def plier(s: str) -> str:
    t = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9€$£.,: -]+", " ", t)).strip()


def lots(dossier: Path, par: int) -> None:
    visites = json.loads((dossier / "tarifs.json").read_text(encoding="utf-8"))
    vues = json.loads((DATA / "vuesDomaines.json").read_text(encoding="utf-8"))["vues"]
    pages = [v for v in visites.values() if v.get("fichier") and (dossier / "tarifs" / v["fichier"]).exists()]
    pages.sort(key=lambda v: v["id"])
    d = dossier / "lots-tarifs"
    d.mkdir(exist_ok=True)
    for p in d.glob("lot-*.json"):
        p.unlink()
    n = 0
    for i in range(0, len(pages), par):
        lot = []
        for v in pages[i : i + par]:
            f = (vues.get(v["id"]) or {}).get("forfait") or {}
            lot.append({
                "id": v["id"],
                "nom": v.get("nom"),
                "fichier": v["fichier"],
                "page": v.get("finale") or v.get("url"),
                "deviseAttendue": f.get("devise"),
                "manque": v.get("manque") or POSTES,
            })
        (d / f"lot-{n:03d}.json").write_text(json.dumps(lot, ensure_ascii=False, indent=1), encoding="utf-8")
        n += 1
    print(f"{len(pages)} pages, {n} lots de {par} dans {d}")


def appliquer(dossier: Path) -> None:
    visites = json.loads((dossier / "tarifs.json").read_text(encoding="utf-8"))
    fiches: dict[str, dict] = {}
    # Une page qui ne publie plus de prix est un résultat, pas un échec : de
    # plus en plus de stations affichent des tarifs « dynamiques » et
    # renvoient à leur boutique. Le constat est gardé, avec ce que le lecteur
    # a vu, pour que la case vide s'explique.
    sans_prix: dict[str, str] = {}
    sans_ligne = introuvable = sans_libelle = 0
    lus = 0
    for p in sorted((dossier / "tarifs-lus").glob("lot-*.json")):
        try:
            contenu = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        for x in contenu if isinstance(contenu, list) else contenu.get("fiches", []):
            id_ = x.get("id")
            v = visites.get(id_)
            if not id_ or not v or not v.get("fichier"):
                continue
            brut = (dossier / "tarifs" / v["fichier"]).read_text(encoding="utf-8").splitlines()
            plies = [plier(l) for l in brut]
            texte = '\n'.join(plies)
            tarifs: dict[str, dict] = {}
            for poste in POSTES:
                t = (x.get("tarifs") or {}).get(poste)
                if not isinstance(t, dict):
                    continue
                prix, ligne = t.get("prix"), str(t.get("ligne") or "").strip()
                if not isinstance(prix, (int, float)) or prix <= 0:
                    continue
                if not ligne:
                    sans_ligne += 1
                    continue
                # La citation est **retrouvée dans la page**, puis élargie à la
                # ligne entière d'où elle vient : c'est la page qui fournit la
                # preuve, pas l'extrait qu'on a bien voulu en citer. Un agent
                # qui ne cite que « € 24,00 » voit ainsi sa ligne complétée en
                # « Tageskarte | € 24,00 | € 15,00 », qui dit enfin de quel
                # forfait il s'agit.
                #
                # Ce qui reste refusé : une citation absente de la page — elle
                # n'a pas été lue, elle a été écrite — et une ligne qui, même
                # entière, ne nomme aucun produit.
                bout = plier(ligne)[:60]
                # Une citation trop courte ne cherche rien : « 35 » se retrouve
                # dans « Shahdag 2351 », et on aurait alors une preuve fausse —
                # pire qu'une absence. Huit caractères, c'est un montant avec
                # son symbole et un mot, ou deux montants.
                if len(bout) < 8:
                    sans_libelle += 1
                    continue
                i = next((k for k, l in enumerate(plies) if bout in l), -1)
                if i < 0:
                    introuvable += 1
                    continue
                # La ligne entière de la page fait la preuve, pas l'extrait
                # qu'on a bien voulu en citer : « Tageskarte | € 24,00 | € 15,00 »
                # dit de quel forfait il s'agit, « € 24,00 » ne le dit pas.
                entiere = brut[i].strip()
                if not re.search(r"[A-Za-zÀ-ÿ]{3}", entiere):
                    sans_libelle += 1
                    continue
                tarifs[poste] = {"prix": float(prix), "ligne": entiere[:200]}
            if not tarifs and x.get("note"):
                sans_prix[id_] = str(x["note"])[:300]
            if tarifs:
                lus += 1
                fiches[id_] = {
                    "page": v.get("finale") or v.get("url"),
                    "devise": x.get("devise"),
                    "tarifs": tarifs,
                    **({"note": str(x["note"])[:200]} if x.get("note") else {}),
                }
    (DATA / "tarifsLus.json").write_text(
        json.dumps(
            {
                "at": date.today().isoformat(),
                "quoi": "les six tarifs lus sur la page du site officiel, chacun avec la ligne qui le porte",
                "regle": "un montant n'est gardé qu'avec sa ligne, et la ligne doit se retrouver dans le texte relevé",
                "ecartes": {
                    "sans ligne": sans_ligne,
                    "citation réduite au montant, sans nom de produit": sans_libelle,
                    "citation introuvable dans la page": introuvable,
                },
                "sansPrix": dict(sorted(sans_prix.items())),
                "fiches": dict(sorted(fiches.items())),
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    par_poste = {p: sum(1 for f in fiches.values() if p in f["tarifs"]) for p in POSTES}
    print(f"{lus} domaines avec au moins un tarif ; {len(sans_prix)} pages sans prix publié ; "
          f"écartés : {sans_ligne} sans ligne, {sans_libelle} sans nom de produit, {introuvable} introuvable")
    print(" ", par_poste)


if __name__ == "__main__":
    quoi, dossier = sys.argv[1], Path(sys.argv[2])
    if quoi == "lots":
        lots(dossier, int(sys.argv[sys.argv.index("--par") + 1]) if "--par" in sys.argv else 5)
    else:
        appliquer(dossier)
