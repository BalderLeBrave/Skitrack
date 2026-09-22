"""Dessine le sprite des icônes de ski que le style de carte attend.

    python scripts/dessiner-sprite-ski.py

Écrit `public/carte/sprite-ski.png` + `.json` et leurs versions `@2x`.

Le style d'OpenSkiMap pose douze icônes sur ses couches de pistes et de
points : le demi-tube, la gare de remontée, la traversée (obligatoire ou
possible), la flèche de sens unique dans la couleur de la piste, et le point
de contrôle DVA. Leur sprite est servi par tiles.openskimap.org, dont l'usage
direct est interdit ; ces douze-là sont redessinées ici, aux mêmes tailles
et dans le même esprit — formes pleines, couleurs du style —, à partir de
rien. Les icônes du fond de carte (POI, routes) viennent du sprite
d'OpenFreeMap, qui les publie pour cela.

Sans dépendance hors Pillow. Tout est dessiné au pixel près à 8× puis
réduit, pour des bords nets aux deux densités.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

SORTIE = Path("public/carte")

# Couleurs des pistes, telles que runColorNameToValue les rend.
COULEURS = {
    "green": (0, 168, 14),
    "blue": (0, 90, 168),
    "red": (250, 8, 15),
    "black": (0, 0, 0),
    "orange": (255, 145, 0),
    "grey": (89, 89, 89),
    "purple": (170, 30, 190),
}
ORANGE = (255, 145, 0)
ORANGE_PALE = (255, 190, 100)
ROUGE_REMONTEE = (195, 19, 26)
ROUGE_DVA = (232, 30, 30)
BLANC = (255, 255, 255)

# (largeur, hauteur) à 1×, comme dans le sprite d'origine.
TAILLES = {
    "halfpipe": (17, 14),
    "lift-station": (14, 14),
    "crossing": (15, 13),
    "crossing-maybe": (15, 13),
    "avalanche-training-check": (13, 16),
    **{f"oneway-{c}": (8, 11) for c in COULEURS},
}

SUR = 8  # suréchantillonnage du dessin


def toile(nom: str, ratio: int):
    w, h = TAILLES[nom]
    im = Image.new("RGBA", (w * ratio * SUR, h * ratio * SUR), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im), w * ratio * SUR, h * ratio * SUR


def dessiner(nom: str, ratio: int) -> Image.Image:
    im, d, W, H = toile(nom, ratio)
    u = W / TAILLES[nom][0]  # un pixel d'origine, en pixels de toile
    if nom == "halfpipe":
        # Un U orange plein, ouvert vers le haut, épais de trois pixels.
        d.rectangle([0, 0, W - 1, H - 1], fill=ORANGE)
        d.ellipse([3 * u, -7 * u, W - 3 * u, H - 3 * u], fill=(0, 0, 0, 0))
        d.rectangle([3 * u, 0, W - 3 * u, H / 2], fill=(0, 0, 0, 0))
    elif nom == "lift-station":
        d.ellipse([0, 0, W - 1, H - 1], fill=ROUGE_REMONTEE)
    elif nom.startswith("crossing"):
        # Triangle d'avertissement, coins arrondis, croix blanche.
        couleur = ORANGE if nom == "crossing" else ORANGE_PALE
        d.polygon([(W / 2, 0), (W, H), (0, H)], fill=couleur)
        d.line([(W * 0.35, H * 0.45), (W * 0.65, H * 0.85)], fill=BLANC, width=int(2.2 * u))
        d.line([(W * 0.65, H * 0.45), (W * 0.35, H * 0.85)], fill=BLANC, width=int(2.2 * u))
    elif nom == "avalanche-training-check":
        # Écusson rouge liseré de blanc, croix blanche.
        d.polygon([(0, 0), (W, 0), (W, H * 0.6), (W / 2, H), (0, H * 0.6)], fill=BLANC)
        m = 1.2 * u
        d.polygon(
            [(m, m), (W - m, m), (W - m, H * 0.58), (W / 2, H - m), (m, H * 0.58)],
            fill=ROUGE_DVA,
        )
        d.rectangle([W / 2 - u, H * 0.22, W / 2 + u, H * 0.62], fill=BLANC)
        d.rectangle([W * 0.25, H * 0.38, W * 0.75, H * 0.48], fill=BLANC)
    elif nom.startswith("oneway-"):
        # Chevron pointé vers la droite, dans la couleur de la piste.
        couleur = COULEURS[nom.split("-", 1)[1]]
        d.line([(1.5 * u, 1.5 * u), (W - 1.5 * u, H / 2), (1.5 * u, H - 1.5 * u)], fill=couleur, width=int(2.6 * u), joint="curve")
    return im.resize((W // SUR, H // SUR), Image.LANCZOS)


def sprite(ratio: int) -> None:
    icones = {nom: dessiner(nom, ratio) for nom in TAILLES}
    marge = 2 * ratio
    largeur = sum(im.width + marge for im in icones.values()) + marge
    hauteur = max(im.height for im in icones.values()) + 2 * marge
    planche = Image.new("RGBA", (largeur, hauteur), (0, 0, 0, 0))
    index = {}
    x = marge
    for nom, im in icones.items():
        planche.paste(im, (x, marge), im)
        index[nom] = {"x": x, "y": marge, "width": im.width, "height": im.height, "pixelRatio": ratio}
        x += im.width + marge
    suffixe = "" if ratio == 1 else f"@{ratio}x"
    SORTIE.mkdir(parents=True, exist_ok=True)
    planche.save(SORTIE / f"sprite-ski{suffixe}.png")
    (SORTIE / f"sprite-ski{suffixe}.json").write_text(json.dumps(index, indent=1), encoding="utf-8")
    print(f"sprite-ski{suffixe} : {len(index)} icônes, {largeur}×{hauteur}")


if __name__ == "__main__":
    sprite(1)
    sprite(2)
