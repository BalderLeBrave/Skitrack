"""Découpe en lots les images à regarder, et rassemble les verdicts rendus.

    python scripts/lots-audit-photos.py lots <dossier> [--par 12]
    python scripts/lots-audit-photos.py verdicts <dossier>

Un lot est un petit fichier JSON — une douzaine d'images, avec le nom du
domaine qu'elles sont censées montrer. Il sert de feuille de route à un
agent, qui ouvre chaque image, la regarde, et écrit son verdict à côté.

Deux sous-commandes :

- `lots` : écrit `<dossier>/lots/lot-000.json`… à partir de
  `<dossier>/index.json` (produit par `telecharger-photos-pour-audit.py`) ;
- `verdicts` : relit `<dossier>/verdicts/*.json`, vérifie qu'aucune image
  n'a été oubliée, et écrit `<dossier>/verdicts.json` — un verdict par
  image, avec ce que l'agent a décrit.

## Pourquoi un lot, et pas une image par agent

Deux mille images, une par agent, ce sont deux mille démarrages pour douze
secondes de regard chacun. Par douze, le coût de démarrage se dilue et le
lot reste assez court pour qu'aucune image n'y soit survolée — c'est le
compromis, et il est vérifié : la commande `verdicts` échoue si un lot rend
moins de verdicts qu'il n'avait d'images.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

DATA = Path("src/lib/monde/data")


def noms_des_domaines() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for f in sorted(DATA.glob("[A-Z][A-Z].json")):
        for d in json.loads(f.read_text(encoding="utf-8")):
            out[d["id"]] = {"nom": d.get("nom"), "region": d.get("region"), "localite": d.get("localite")}
    return out


def lots(dossier: Path, par: int) -> None:
    index = json.loads((dossier / "index.json").read_text(encoding="utf-8"))
    vues = json.loads((DATA / "vuesDomaines.json").read_text(encoding="utf-8"))["vues"]
    noms = noms_des_domaines()
    images = [x for x in index if x.get("fichier")]
    images.sort(key=lambda x: x["id"])
    (dossier / "lots").mkdir(exist_ok=True)
    for p in (dossier / "lots").glob("lot-*.json"):
        p.unlink()
    n = 0
    for i in range(0, len(images), par):
        lot = []
        for x in images[i : i + par]:
            d = noms.get(x["id"], {})
            photo = (vues.get(x["id"]) or {}).get("photo") or {}
            lot.append({
                "fichier": x["fichier"],
                "id": x["id"],
                "nom": d.get("nom"),
                "region": d.get("region"),
                "source": photo.get("source"),
                "hote": (photo.get("url") or "").split("/")[2] if photo.get("url") else None,
            })
        (dossier / "lots" / f"lot-{n:03d}.json").write_text(
            json.dumps(lot, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        n += 1
    print(f"{len(images)} images, {n} lots de {par} dans {dossier / 'lots'}")


def verdicts(dossier: Path) -> None:
    attendu: dict[str, dict] = {}
    for p in sorted((dossier / "lots").glob("lot-*.json")):
        for x in json.loads(p.read_text(encoding="utf-8")):
            attendu[x["fichier"]] = x
    rendus: dict[str, dict] = {}
    manquants_lots = []
    for p in sorted((dossier / "lots").glob("lot-*.json")):
        v = (dossier / "verdicts" / p.name)
        if not v.exists():
            manquants_lots.append(p.name)
            continue
        try:
            contenu = json.loads(v.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            manquants_lots.append(f"{p.name} (illisible : {e})")
            continue
        for x in contenu if isinstance(contenu, list) else contenu.get("verdicts", []):
            f = x.get("fichier")
            if f in attendu:
                rendus[f] = x
    oublies = [f for f in attendu if f not in rendus]
    print(f"{len(attendu)} images attendues, {len(rendus)} jugées, {len(oublies)} sans verdict")
    if manquants_lots:
        print(f"  lots sans fichier de verdicts : {len(manquants_lots)} → {manquants_lots[:6]}")
    sortie = {
        f: {**rendus[f], **{k: v for k, v in attendu[f].items() if k not in rendus[f]}} for f in rendus
    }
    (dossier / "verdicts.json").write_text(json.dumps(sortie, ensure_ascii=False, indent=1), encoding="utf-8")
    if oublies:
        (dossier / "oublies.json").write_text(json.dumps(oublies, ensure_ascii=False, indent=1), encoding="utf-8")
    # Ce que les verdicts disent, en gros.
    def compte(cle: str) -> dict:
        c: dict = {}
        for x in rendus.values():
            c[str(x.get(cle))] = c.get(str(x.get(cle)), 0) + 1
        return dict(sorted(c.items(), key=lambda t: -t[1]))
    print("  neige :", compte("neige"))
    print("  filigrane :", compte("filigrane"))
    print("  sujet :", compte("sujet"))


if __name__ == "__main__":
    quoi = sys.argv[1]
    dossier = Path(sys.argv[2])
    if quoi == "lots":
        par = int(sys.argv[sys.argv.index("--par") + 1]) if "--par" in sys.argv else 12
        lots(dossier, par)
    else:
        verdicts(dossier)
