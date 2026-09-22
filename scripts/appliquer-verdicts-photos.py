"""Transforme les verdicts rendus sur les images en décision, domaine par domaine.

    python scripts/appliquer-verdicts-photos.py <dossier> [<dossier>…]

Écrit `src/lib/monde/data/photosJugees.json`, que `build-vues-monde.ts` lit
pour **écarter** une photo qui ne répond pas à ce qui est demandé.

## Ce que le propriétaire demande, et comment chaque point se tranche

> une photo unique, de la station ou des pistes, sans filigrane, avec de la
> neige

- **unique** : deux domaines ne peuvent pas montrer le même fichier. Le
  contrôle se fait sur l'empreinte de l'image téléchargée, pas sur son
  adresse : deux adresses différentes servent parfois le même cliché. Quand
  plusieurs domaines se partagent une image, **aucun** ne la garde — rien ne
  dit lequel des deux elle montre.
- **de la station ou des pistes** : un agent a ouvert chaque image et l'a
  rangée en `station`, `pistes`, `montagne`, `autre` ou `illisible`. Les deux
  premières passent. `montagne` ne passe pas : un sommet sans remontée ni
  village n'est pas la station, et c'est précisément ce qui a été demandé.
- **sans filigrane** : le même regard. Un logo discret de la station n'en est
  pas un ; une trame de banque d'images en est un.
- **avec de la neige** : le même regard, et non la mesure de pixels clairs
  faite au téléchargement — un ciel couvert ou un mur blanc la font monter.
  La mesure est gardée à côté pour qu'on puisse comparer les deux.

Une image sans verdict n'est pas écartée : elle est simplement inconnue, et
le fichier le dit. Écarter faute d'avoir regardé reviendrait à punir une
photo de n'avoir pas été vue.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path

DATA = Path("src/lib/monde/data")
SUJETS_OK = {"station", "pistes"}


def main() -> None:
    # Plusieurs dossiers : le premier tour a regardé les photos retenues, le
    # second celles qu'un rejet a promues à leur place. Une photo ne peut
    # figurer que dans un seul — c'est l'adresse qui la désigne — et le dernier
    # dossier l'emporte, puisqu'il est le plus récent.
    dossiers = [Path(a) for a in sys.argv[1:] if not a.startswith("--")]
    verdicts: dict[str, dict] = {}
    index: dict[str, dict] = {}
    for d in dossiers:
        verdicts.update(json.loads((d / "verdicts.json").read_text(encoding="utf-8")))
        for x in json.loads((d / "index.json").read_text(encoding="utf-8")):
            if x.get("fichier"):
                index[x["id"]] = x
    vues = json.loads((DATA / "vuesDomaines.json").read_text(encoding="utf-8"))["vues"]

    # Les empreintes partagées par plusieurs domaines : aucun ne garde l'image.
    par_empreinte: dict[str, list[str]] = {}
    for x in index.values():
        par_empreinte.setdefault(x["empreinte"], []).append(x["id"])
    partagees = {e for e, ids in par_empreinte.items() if len(ids) > 1}

    sortie: dict[str, dict] = {}
    # **Les adresses écartées, gardées à part et pour toujours.**
    #
    # Un verdict par domaine ne suffit pas : au second tour, le domaine dont la
    # photo a été rejetée en présente une autre, et ranger le nouveau verdict
    # sous le même identifiant effacerait le rejet du premier — la photo
    # écartée reviendrait au prochain calcul, et l'on tournerait en rond.
    #
    # Une adresse rejetée l'est d'ailleurs partout : « pas de neige » ou
    # « plan des pistes dessiné » sont des propriétés de l'image, pas du
    # domaine qui l'affiche.
    ecartees: dict[str, str] = {}
    motifs: Counter = Counter()
    for fichier, v in verdicts.items():
        id_ = v.get("id") or fichier.rsplit(".", 1)[0]
        ix = index.get(id_)
        if not ix:
            continue
        # L'adresse jugée est celle que le tour a **téléchargée**, pas celle
        # que le domaine affiche aujourd'hui : entre les deux, une reprise a
        # pu changer de source, et le verdict ne vaudrait plus pour elle.
        photo = (vues.get(id_) or {}).get("photo") or {}
        url_jugee = ix.get("url") or photo.get("url")
        neige = bool(v.get("neige"))
        filigrane = bool(v.get("filigrane"))
        sujet = str(v.get("sujet") or "")
        motif = None
        if ix["empreinte"] in partagees:
            motif = "image partagée par plusieurs domaines"
        elif not neige:
            motif = "pas de neige"
        elif filigrane:
            motif = "filigrane"
        elif sujet not in SUJETS_OK:
            motif = f"sujet : {sujet or 'inconnu'}"
        motifs[motif or "retenue"] += 1
        if motif and url_jugee:
            ecartees[url_jugee] = motif
        sortie[id_] = {
            "url": url_jugee,
            "source": photo.get("source"),
            "neige": neige,
            "filigrane": filigrane,
            "sujet": sujet,
            "description": v.get("description"),
            "partNeigeMesuree": ix.get("neige"),
            "retenue": motif is None,
            **({"motif": motif} if motif else {}),
        }

    (DATA / "photosJugees.json").write_text(
        json.dumps(
            {
                "at": date.today().isoformat(),
                "quoi": "ce qu'un regard a vu sur chaque photo de domaine retenue",
                "regle": "retenue si neige, sans filigrane, sujet station ou pistes, et image non partagée",
                "juges": len(sortie),
                "retenues": sum(1 for v in sortie.values() if v["retenue"]),
                "ecartees": dict(sorted(ecartees.items())),
                "verdicts": dict(sorted(sortie.items())),
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"{len(sortie)} domaines jugés, {len(ecartees)} adresses écartées")
    for m, n in motifs.most_common():
        print(f"  {m:42s} {n}")


if __name__ == "__main__":
    main()
