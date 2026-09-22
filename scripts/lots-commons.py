"""Découpe les candidates Commons en lots à regarder, et applique les choix.

    python scripts/lots-commons.py lots <dossier commons> [--par 3]
    python scripts/lots-commons.py appliquer <dossier commons>

`lots` n'inscrit que les domaines **qui ont besoin d'une photo** — aucune
retenue au terme de la chaîne des sources — et qui ont au moins une
candidate téléchargée.

`appliquer` relit `<dossier>/choix/*.json` et écrit
`src/lib/monde/data/photosCommons.json`. Une photo n'est gardée que si le
fichier choisi figure bien parmi les candidates du domaine — un nom inventé
ne passe pas — et l'auteur comme la licence sont repris de la réponse de
Commons, jamais de ce que l'agent en dit : ce sont eux qui autorisent
l'affichage, ils ne se paraphrasent pas.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

DATA = Path("src/lib/monde/data")


def besoins() -> set[str]:
    """Les domaines nommés sans photo retenue."""
    vues = json.loads((DATA / "vuesDomaines.json").read_text(encoding="utf-8"))["vues"]
    out: set[str] = set()
    for f in sorted(DATA.glob("[A-Z][A-Z].json")):
        for d in json.loads(f.read_text(encoding="utf-8")):
            if not (vues.get(d["id"]) or {}).get("photo"):
                out.add(d["id"])
    return out


def lots(dossier: Path, par: int) -> None:
    commons = json.loads((dossier / "commons.json").read_text(encoding="utf-8"))
    veut = besoins()
    cibles = []
    for id_, v in sorted(commons.items()):
        if id_ not in veut:
            continue
        cands = [c for c in v["candidates"] if c.get("fichier") and (dossier / "candidates" / c["fichier"]).exists()]
        if cands:
            cibles.append({
                "id": id_,
                "nom": v.get("nom"),
                "candidates": [
                    {"fichier": c["fichier"], "titre": c["titre"], "categories": c.get("categories", [])[:5]}
                    for c in cands
                ],
            })
    d = dossier / "lots-commons"
    d.mkdir(exist_ok=True)
    for p in d.glob("lot-*.json"):
        p.unlink()
    n = 0
    for i in range(0, len(cibles), par):
        (d / f"lot-{n:03d}.json").write_text(
            json.dumps(cibles[i : i + par], ensure_ascii=False, indent=1), encoding="utf-8"
        )
        n += 1
    print(f"{len(cibles)} domaines à photographier, {n} lots de {par} dans {d}")
    print(f"  (sur {len(veut)} domaines sans photo et {len(commons)} cherchés sur Commons)")


def appliquer(dossier: Path) -> None:
    commons = json.loads((dossier / "commons.json").read_text(encoding="utf-8"))
    photos: dict[str, dict] = {}
    refuses = inconnus = 0
    for p in sorted((dossier / "choix").glob("lot-*.json")):
        try:
            contenu = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        for x in contenu if isinstance(contenu, list) else contenu.get("choix", []):
            id_, fichier = x.get("id"), x.get("fichier")
            if not id_ or id_ not in commons:
                inconnus += 1
                continue
            if not fichier:
                refuses += 1
                continue
            c = next((c for c in commons[id_]["candidates"] if c.get("fichier") == fichier), None)
            if not c:
                inconnus += 1
                continue
            photos[id_] = {
                "url": c["url"],
                "page": c["page"],
                "titre": c["titre"],
                "licence": c["licence"],
                "auteur": c["auteur"] or c.get("credit") or "",
                "largeur": c["largeur"],
                "hauteur": c["hauteur"],
                **({"description": str(x["description"])[:160]} if x.get("description") else {}),
                **({"sujet": x["sujet"]} if x.get("sujet") else {}),
            }
    (DATA / "photosCommons.json").write_text(
        json.dumps(
            {
                "at": date.today().isoformat(),
                "source": "https://commons.wikimedia.org — fichiers géolocalisés autour du domaine",
                "quoi": "une photo libre par domaine sans photo, choisie à l'œil parmi les candidates",
                "regle": "gardée seulement si la candidate existe ; auteur et licence repris de Commons, jamais reformulés",
                "photos": dict(sorted(photos.items())),
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"{len(photos)} photos libres adoptées ; {refuses} domaines sans candidate retenue ; {inconnus} choix illisibles")
    licences: dict[str, int] = {}
    for v in photos.values():
        licences[v["licence"] or "(sans licence)"] = licences.get(v["licence"] or "(sans licence)", 0) + 1
    print("  licences :", dict(sorted(licences.items(), key=lambda t: -t[1])))


if __name__ == "__main__":
    quoi, dossier = sys.argv[1], Path(sys.argv[2])
    if quoi == "lots":
        lots(dossier, int(sys.argv[sys.argv.index("--par") + 1]) if "--par" in sys.argv else 3)
    else:
        appliquer(dossier)
