"""Cherche sur Wikimedia Commons une photo libre pour chaque domaine sans photo.

    python scripts/fetch-photos-commons.py <dossier de travail> [--ids ids.json] [--essai 20]

Écrit `<travail>/commons.json` (les candidates, avec leur licence et leur
crédit) et `<travail>/candidates/<id>--<n>.jpg` (les vignettes, à regarder).

## Pourquoi Commons, et pas une recherche d'images

Le propriétaire demande une photo **unique**, de la station ou de ses
pistes, **sans filigrane**, **avec de la neige**. Une recherche d'images
générale rend des banques (filigrane), des vignettes de vidéos, et la même
image pour dix stations — on l'a vu : une photo de festival tyrolien servait
146 domaines. Commons rend autre chose :

- des fichiers **géolocalisés** : on demande ce qui a été photographié dans
  un rayon de dix kilomètres autour du domaine, pas ce qu'un moteur associe
  à son nom ;
- des **licences libres**, avec l'auteur et la licence dans la réponse, donc
  un crédit exact ;
- **pas de filigrane** : Commons les interdit et les supprime.

Ce que Commons ne garantit pas : que le fichier montre la station, ni qu'il
y ait de la neige — on y trouve des fleurs d'été et des panneaux de
randonnée. D'où les candidates, plusieurs par domaine, et le regard qui
tranche ensuite.

## Le tri des candidates, avant de regarder

Sont écartés : ce qui n'est pas une photographie (SVG, PDF, cartes, plans,
blasons), ce qui est trop petit (moins de 800 px), et les fichiers dont le
titre annonce autre chose qu'un lieu (portraits, logos). Sont remontés :
les titres qui portent le nom du domaine ou de sa localité, puis ceux qui
disent la neige ou le ski — en français, allemand, anglais, italien,
espagnol, et les langues du périmètre.

## Politesse

Un agent nommé avec un contact, comme la politique de Wikimedia le demande,
une requête à la fois vers l'API (deux par seconde au plus) et vers le CDN
des vignettes. Les réponses sont gardées : relancer le script ne redemande
pas ce qui est déjà là.
"""

from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
from pathlib import Path

import requests

API = "https://commons.wikimedia.org/w/api.php"
UA = ("Skitrack/1.0 (https://github.com/BalderLeBrave/Skitrack ; "
      "adrien.raffray196@gmail.com) recherche de photos libres de stations de ski")
INTERVALLE = 0.8
RAYON_M = 10_000
CANDIDATES_MAX = 5
LARGEUR_MIN = 800

NEIGE = re.compile(
    r"ski|schnee|snow|neige|neve|nieve|sneg|snij|sn[oö]|lumi|winter|hiver|inverno|invierno|zima|"
    r"piste|slope|lift|seilbahn|telesiege|telecabine|remonte|gondola|chairlift|skigebiet|skilift|"
    r"station de ski|ski resort|talstation|bergstation|loipe|langlauf",
    re.I,
)
# Ce qui n'est pas une photo de station : cartes, blasons, portraits, documents.
REBUT = re.compile(
    r"\.svg$|\.pdf$|\.tif{1,2}$|\.webm$|\.ogv$|\.gif$|"
    r"\b(map|karte|carte|plan|blason|coat of arms|wappen|logo|flag|drapeau|diagram|graph|chart|"
    r"portrait|gravestone|grab|tomb|sign|panneau|schild|banknote|stamp|timbre|book|livre)\b",
    re.I,
)


def plier(s: str) -> str:
    t = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


MOTS_VIDES = {
    "ski", "skigebiet", "skiarea", "lift", "lifte", "lifts", "station", "centre", "center", "area",
    "arena", "park", "resort", "mont", "monte", "alpe", "alpes", "piste", "pista", "sankt", "saint",
    "bahn", "berg", "bergbahn", "bergbahnen", "skilift", "skilifte", "stok", "sjezdovka", "narciarski",
    "des", "les", "der", "die", "das", "und", "and", "the",
}


class Poli:
    def __init__(self, intervalle: float = INTERVALLE) -> None:
        self.intervalle = intervalle
        self.dernier = 0.0

    def attendre(self) -> None:
        d = max(0.0, self.dernier + self.intervalle - time.monotonic())
        if d:
            time.sleep(d)
        self.dernier = time.monotonic()


def geosearch(session: requests.Session, poli: Poli, lat: float, lon: float) -> list[dict]:
    """Les fichiers géolocalisés autour d'un point.

    La recherche de Commons répond parfois `cirrussearch-too-busy-error` :
    ce n'est pas un refus, c'est son moteur qui demande d'attendre. On
    attend, de plus en plus longtemps, et on renonce après quatre essais —
    insister davantage ferait de l'attente une charge de plus pour lui.
    """
    params = {
        "action": "query", "format": "json", "formatversion": "2",
        "generator": "geosearch", "ggscoord": f"{lat}|{lon}", "ggsradius": str(RAYON_M),
        "ggslimit": "50", "ggsnamespace": "6",
        "prop": "imageinfo|categories", "cllimit": "30",
        "iiprop": "url|size|extmetadata", "iiurlwidth": "1024",
    }
    for essai in range(4):
        poli.attendre()
        try:
            r = session.get(API, params=params, headers={"User-Agent": UA}, timeout=30)
            if r.status_code != 200:
                time.sleep(2 * (essai + 1))
                continue
            d = r.json()
            if "error" in d:
                time.sleep(2 * (essai + 1))
                continue
            return (d.get("query") or {}).get("pages") or []
        except (requests.RequestException, ValueError):
            time.sleep(2 * (essai + 1))
    return []


def note(p: dict, jetons: set[str]) -> tuple[int, dict] | None:
    """Ce qui recommande une candidate, ou `None` si elle est écartée."""
    titre = p.get("title", "")
    if REBUT.search(titre):
        return None
    ii = (p.get("imageinfo") or [{}])[0]
    if not ii or (ii.get("width") or 0) < LARGEUR_MIN:
        return None
    # L'extension se lit sur le chemin : Commons ajoute des paramètres de
    # suivi (`?utm_source=…`) à l'adresse de la vignette, et un `endswith`
    # sur l'URL entière les prenait pour la fin du nom de fichier — tout
    # était alors écarté, y compris les photos.
    chemin = (ii.get("thumburl") or "").split("?")[0].lower()
    if not chemin.endswith((".jpg", ".jpeg", ".png", ".webp")):
        return None
    cats = " ".join(c.get("title", "") for c in p.get("categories") or [])
    texte = f"{titre} {cats}"
    plie = plier(texte)
    n = 0
    if jetons and any(j in plie for j in jetons):
        n += 10
    if NEIGE.search(texte):
        n += 5
    if (ii.get("width") or 0) >= 1600:
        n += 1
    em = ii.get("extmetadata") or {}
    return (n, {
        "titre": titre,
        "page": ii.get("descriptionurl"),
        "url": ii.get("thumburl"),
        "origine": ii.get("url"),
        "largeur": ii.get("width"),
        "hauteur": ii.get("height"),
        "licence": ((em.get("LicenseShortName") or {}).get("value") or "").strip(),
        "auteur": re.sub(r"<[^>]+>", "", (em.get("Artist") or {}).get("value") or "").strip()[:120],
        "credit": re.sub(r"<[^>]+>", "", (em.get("Credit") or {}).get("value") or "").strip()[:120],
        "categories": [c.get("title", "").replace("Category:", "") for c in (p.get("categories") or [])][:8],
        "note": n,
    })


def main() -> None:
    travail = Path(sys.argv[1])
    (travail / "candidates").mkdir(parents=True, exist_ok=True)
    data = Path("src/lib/monde/data")
    vues = json.loads((data / "vuesDomaines.json").read_text(encoding="utf-8"))["vues"]

    if "--ids" in sys.argv:
        vises = set(json.loads(Path(sys.argv[sys.argv.index("--ids") + 1]).read_text(encoding="utf-8")))
    else:
        vises = None

    domaines: list[dict] = []
    for f in sorted(data.glob("[A-Z][A-Z].json")):
        for d in json.loads(f.read_text(encoding="utf-8")):
            a_photo = bool((vues.get(d["id"]) or {}).get("photo"))
            if vises is None and a_photo:
                continue
            if vises is not None and d["id"] not in vises:
                continue
            domaines.append(d)
    if "--essai" in sys.argv:
        domaines = domaines[: int(sys.argv[sys.argv.index("--essai") + 1])]

    sortie_f = travail / "commons.json"
    sortie: dict = json.loads(sortie_f.read_text(encoding="utf-8")) if sortie_f.exists() else {}
    domaines = [d for d in domaines if d["id"] not in sortie]
    print(f"{len(domaines)} domaines à chercher sur Commons "
          f"({len(sortie)} déjà faits)")

    session = requests.Session()
    poli_api, poli_cdn = Poli(), Poli(0.2)
    trouves = images = 0
    for i, d in enumerate(domaines, 1):
        jetons = {m for m in (plier(d.get("nom")).split() + plier(d.get("localite")).split())
                  if len(m) >= 4 and m not in MOTS_VIDES}
        pages = geosearch(session, poli_api, d["lat"], d["lon"])
        notees = [x for x in (note(p, jetons) for p in pages) if x]
        notees.sort(key=lambda t: -t[0])
        # Une candidate qui ne porte ni le nom du domaine ni un mot de neige ou
        # de ski n'est pas une candidate : autour de n'importe quel village des
        # Alpes, Commons a des monuments aux morts, des églises et des plantes.
        # Les rapatrier pour les rejeter ensuite ferait payer au serveur une
        # question dont on connaît déjà la réponse.
        gardees = [c for n, c in notees[:CANDIDATES_MAX] if n >= 5]
        for n, c in enumerate(gardees):
            dest = travail / "candidates" / f"{d['id']}--{n}.jpg"
            c["fichier"] = dest.name
            if dest.exists():
                continue
            poli_cdn.attendre()
            try:
                r = session.get(c["url"], headers={"User-Agent": UA}, timeout=30)
                if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/"):
                    dest.write_bytes(r.content)
                    images += 1
            except requests.RequestException:
                pass
        sortie[d["id"]] = {"nom": d.get("nom"), "lat": d["lat"], "lon": d["lon"], "candidates": gardees}
        if gardees:
            trouves += 1
        if i % 25 == 0:
            sortie_f.write_text(json.dumps(sortie, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"  {i}/{len(domaines)} — {trouves} domaines avec candidates, {images} vignettes", flush=True)
    sortie_f.write_text(json.dumps(sortie, ensure_ascii=False, indent=1), encoding="utf-8")
    avec = sum(1 for v in sortie.values() if v["candidates"])
    print(f"\n{len(sortie)} domaines cherchés ; {avec} ont au moins une candidate ; {images} vignettes rapatriées")


if __name__ == "__main__":
    main()
