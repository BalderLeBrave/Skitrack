"""Les glyphes des polices du style de carte, dans `public/fonts/glyphes/`.

    python scripts/extraire-glyphes.py [v2.0.zip]

Sans argument, télécharge le paquet `v2.0.zip` de openmaptiles/fonts
(74 Mo, Apache 2.0 / OFL selon la police), sinon lit la copie donnée.

Le style veut quatre polices : Open Sans Semibold pour les noms de pistes
et de remontées, Noto Sans Regular / Bold / Italic pour le fond. Le paquet
les fournit en PBF, par plages de 256 points de code — 256 plages chacune,
25 Mo par police avec les écritures d'Asie. Skitrack n'affiche que
l'Europe : ne sont gardées que les plages qu'un nom européen peut demander
(latin, grec, cyrillique, arménien, géorgien, ponctuation et formes de
présentation), 5,6 Mo en tout. Une plage absente rend un caractère blanc,
pas une erreur ; la console le dit.

Les dossiers portent un nom sans espace (`noto-sans-regular`) : le serveur
statique de Vite ne retrouve pas un `Noto%20Sans%20Regular`. Le style
nomme ses polices par ces mêmes noms (voir `adapter-style-openskimap.ts`).
"""

from __future__ import annotations

import io
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

SOURCE = "https://github.com/openmaptiles/fonts/releases/download/v2.0/v2.0.zip"
SORTIE = Path("public/fonts/glyphes")

POLICES = {
    "Open Sans Semibold": "open-sans-semibold",
    "Noto Sans Regular": "noto-sans-regular",
    "Noto Sans Bold": "noto-sans-bold",
    "Noto Sans Italic": "noto-sans-italic",
}

# Plages de 256 points de code gardées.
PLAGES = [
    (0, 1791),        # latin, latin étendu, IPA, grec, cyrillique, arménien, hébreu, arabe
    (4096, 4351),     # géorgien
    (4352, 5119),     # jamo, éthiopien (demandés par le fond)
    (7680, 7935),     # latin étendu additionnel (vietnamien)
    (8192, 8959),     # ponctuation, symboles, flèches
    (11520, 11775),   # géorgien supplément
    (64256, 64511),   # ligatures de présentation
    (65024, 65279),   # sélecteurs de variante
]


def voulue(plage: str) -> bool:
    debut = int(plage.split("-")[0])
    return any(a <= debut <= b for a, b in PLAGES)


def main() -> None:
    if len(sys.argv) > 1:
        donnees = Path(sys.argv[1]).read_bytes()
    else:
        print(f"téléchargement de {SOURCE}…")
        with urllib.request.urlopen(SOURCE) as r:
            donnees = r.read()
    z = zipfile.ZipFile(io.BytesIO(donnees))
    if SORTIE.exists():
        shutil.rmtree(SORTIE)
    total = 0
    for police, dossier in POLICES.items():
        n = 0
        for nom in z.namelist():
            if not nom.startswith(police + "/") or not nom.endswith(".pbf"):
                continue
            plage = nom.rsplit("/", 1)[1][:-4]
            if not voulue(plage):
                continue
            dest = SORTIE / dossier / f"{plage}.pbf"
            dest.parent.mkdir(parents=True, exist_ok=True)
            octets = z.read(nom)
            dest.write_bytes(octets)
            n += 1
            total += len(octets)
        print(f"{dossier:20s} {n} plages")
    print(f"{total / 1e6:.1f} Mo dans {SORTIE}")


if __name__ == "__main__":
    main()
