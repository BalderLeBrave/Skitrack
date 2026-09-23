"""Rapatrie les photos retenues, réduites, pour qu'on puisse les regarder.

    python scripts/telecharger-photos-pour-audit.py <dossier de sortie> [--depuis vuesDomaines.json]
    python scripts/telecharger-photos-pour-audit.py <sortie> --liste candidates.json

Une photo de domaine n'a jamais été *vue*. On sait d'où elle vient, on sait
que l'hôte l'a servie, on ne sait pas ce qu'elle montre. Les exigences du
propriétaire — unique, la station ou ses pistes, sans filigrane, avec de la
neige — ne se vérifient qu'à l'œil : il faut donc l'image, pas son adresse.

Écrit `<sortie>/<id>.jpg`, réduit à 640 px de large et compressé, ce qui
suffit pour juger un filigrane ou de la neige, et `<sortie>/index.json` :
par domaine, l'empreinte du fichier (pour l'unicité **réelle**, deux
adresses pouvant servir la même image), les dimensions d'origine, et une
mesure de neige.

## La mesure de neige, et ce qu'elle vaut

La part de pixels clairs et peu colorés (V > 0,72, S < 0,18 en TSV) dans le
tiers supérieur et au centre. C'est un indice, pas un verdict : un ciel
couvert, un mur blanc ou une page blanche la font monter. Elle sert à
classer ce qu'un regard doit trancher, jamais à décider seule.

Politesse : un agent nommé, une requête par hôte toutes les 1,2 s, reprise
sur un dossier déjà rempli.
"""

from __future__ import annotations

import hashlib
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit

import requests
from PIL import Image

UA = ("Skitrack/1.0 (contrôle des photos de stations ; robot applicatif, "
      "une requête par hôte toutes les 1,2 s ; contact adrien.raffray196@gmail.com)")
INTERVALLE = 1.2
LARGEUR = 640


class Politesse:
    def __init__(self) -> None:
        self.verrou = threading.Lock()
        self.dernier: dict[str, float] = {}

    def attendre(self, h: str) -> None:
        with self.verrou:
            delai = max(0.0, self.dernier.get(h, 0.0) + INTERVALLE - time.monotonic())
            self.dernier[h] = time.monotonic() + delai
        if delai:
            time.sleep(delai)


def part_de_neige(im: Image.Image) -> float:
    """Part de pixels clairs et peu colorés, haut et centre de l'image."""
    p = im.convert("HSV").resize((64, 64))
    px = p.load()
    n = clairs = 0
    for y in range(0, 48):           # les deux tiers supérieurs
        for x in range(64):
            h, s, v = px[x, y]
            n += 1
            if v > 184 and s < 46:   # 0,72 et 0,18 sur 255
                clairs += 1
    return round(clairs / max(1, n), 3)


def une(id_: str, url: str, sortie: Path, politesse: Politesse) -> dict:
    dest = sortie / f"{id_}.jpg"
    if dest.exists():
        with Image.open(dest) as im:
            return {"id": id_, "url": url, "fichier": dest.name, "neige": part_de_neige(im),
                    "octets": dest.stat().st_size, "empreinte": hashlib.md5(dest.read_bytes()).hexdigest(),
                    "largeur": im.width, "hauteur": im.height, "repris": True}
    politesse.attendre(urlsplit(url).netloc)
    try:
        res = requests.get(url, headers={"User-Agent": UA, "Accept": "image/*"}, timeout=25)
        if res.status_code != 200 or not res.headers.get("content-type", "").startswith("image/"):
            return {"id": id_, "url": url, "erreur": f"HTTP {res.status_code} {res.headers.get('content-type')}"}
        brut = res.content
        with Image.open(BytesIO(brut)) as im:
            im.load()
            w0, h0 = im.size
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            if im.width > LARGEUR:
                im = im.resize((LARGEUR, max(1, round(im.height * LARGEUR / im.width))), Image.LANCZOS)
            neige = part_de_neige(im)
            im.convert("RGB").save(dest, "JPEG", quality=72)
        return {"id": id_, "url": url, "fichier": dest.name, "neige": neige, "octets": len(brut),
                "empreinte": hashlib.md5(brut).hexdigest(), "largeur": w0, "hauteur": h0}
    except Exception as e:  # réseau, image illisible, format inconnu
        return {"id": id_, "url": url, "erreur": f"{type(e).__name__}: {e}"[:120]}


def main() -> None:
    sortie = Path(sys.argv[1])
    sortie.mkdir(parents=True, exist_ok=True)
    if "--liste" in sys.argv:
        cibles = json.loads(Path(sys.argv[sys.argv.index("--liste") + 1]).read_text(encoding="utf-8"))
    else:
        v = json.loads(Path("src/lib/monde/data/vuesDomaines.json").read_text(encoding="utf-8"))["vues"]
        cibles = [{"id": i, "url": x["photo"]["url"]} for i, x in sorted(v.items()) if x.get("photo")]
    print(f"{len(cibles)} photos à rapatrier")
    politesse = Politesse()
    faits: list[dict] = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        for i, r in enumerate(ex.map(lambda c: une(c["id"], c["url"], sortie, politesse), cibles), 1):
            faits.append(r)
            if i % 100 == 0:
                ok = sum(1 for f in faits if "fichier" in f)
                print(f"  {i}/{len(cibles)} — {ok} images", flush=True)
                (sortie / "index.json").write_text(json.dumps(faits, ensure_ascii=False, indent=1), encoding="utf-8")
    (sortie / "index.json").write_text(json.dumps(faits, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = [f for f in faits if "fichier" in f]
    empreintes: dict[str, list[str]] = {}
    for f in ok:
        empreintes.setdefault(f["empreinte"], []).append(f["id"])
    partagees = {k: v for k, v in empreintes.items() if len(v) > 1}
    print(f"\n{len(ok)} images, {len(faits) - len(ok)} en échec")
    print(f"empreintes distinctes : {len(empreintes)} ; images identiques partagées par plusieurs domaines : {len(partagees)} "
          f"({sum(len(v) for v in partagees.values())} domaines)")
    print(f"neige (part de pixels clairs) — médiane {sorted(f['neige'] for f in ok)[len(ok) // 2]:.2f} ; "
          f"sous 0,10 : {sum(1 for f in ok if f['neige'] < 0.10)}")


if __name__ == "__main__":
    main()
