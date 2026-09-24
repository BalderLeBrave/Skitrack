"""Relit le tableau des manques une fois rempli, et n'en garde que ce qui tient.

    python scripts/importer-manques.py <tableau.xlsx ou .csv> [--sans-controle]

Écrit `src/lib/monde/data/proprietaire.json`, que `build-vues-monde.ts` lit
en dernier recours, après toutes les sources moissonnées.

## D'où vient le tableau

`export-manques.ts` écrit les domaines sans photo ou sans forfait, avec des
colonnes vides à remplir « avec sa source ». Le tableau rendu le 22 septembre
2026 l'a été par une **recherche large**, automatique : 1 187 adresses
d'images, 69 forfaits. Une recherche large ramène ce qu'elle trouve, pas ce
qui est vrai : la même photo d'un festival tyrolien y sert 146 domaines,
d'Andorre à l'Arménie ; une plage albanaise en illustre quatorze ; le reste
vient pour un quart de banques d'images, de vignettes YouTube ou de
Pinterest. Et la colonne `source` porte un libellé (« Portail Touristique
Web »), pas l'adresse d'une page.

## Ce qui est gardé, et pourquoi

Une photo est retenue si elle est **corroborée** par autre chose que la
recherche elle-même, dans cet ordre de confiance :

1. `hote-officiel` — l'image est servie par le site officiel connu du domaine ;
2. `nom` — l'adresse de l'image contient le nom du domaine ou de sa localité ;
3. `office-du-pays` — l'image vient d'un office de tourisme du pays du domaine ;
4. `bergfex` — l'image vient de bergfex, dont les photos sont celles de la
   fiche de station.

Une adresse **répétée** entre plusieurs domaines est écartée d'office :
elle n'est la photo d'aucun d'eux. Les banques d'images et les réseaux
sociaux aussi. Tout ce qui reste sans corroboration est écarté, et compté.
Chaque retenue est ensuite **contrôlée** : un octet demandé, le type et le
poids lus ; moins de 20 ko ou pas une image, elle sort. Le contrôle est poli
— un en-tête de navigateur (agent nommé chez Wikimedia), une requête par hôte
toutes les 1,2 s.

Un forfait est retenu s'il a un prix, une devise et une **source lisible** :
l'adresse d'une page, ou « Skiinfo » (la page du pays est alors nommée), ou
« site officiel » quand le site officiel du domaine est connu. Les colonnes
enfant, six jours et saison sont reprises quand elles sont remplies.

Ce que le fichier ne dit pas : que la photo montre la station. Il dit qui
l'a servie et pourquoi on l'a crue ; l'écran le répète.
"""

from __future__ import annotations

import csv
import json
import re
import sys
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from urllib.parse import unquote, urlsplit

import requests

SORTIE = Path("src/lib/monde/data/proprietaire.json")
# Se présenter comme un navigateur, comme le relevé de l'app (consigne du propriétaire, 24 sept. 2026).
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
# Sauf chez Wikimedia : sa politique d'usage exige un agent nommé avec un
# contact, et bloque les navigateurs imités. Le tableau rempli à la main peut
# en contenir.
UA_WIKIMEDIA = ("Skitrack/1.0 (contrôle d'images relevées à la main ; un octet demandé par image ; "
                "contact adrien.raffray196@gmail.com)")
INTERVALLE = 1.2
POIDS_MIN = 20_000

BANQUES = {
    "c8.alamy.com", "thumbs.dreamstime.com", "i.pinimg.com", "i.ytimg.com", "img.youtube.com",
    "lookaside.fbsbx.com", "blogger.googleusercontent.com", "www.shutterstock.com",
    "www.istockphoto.com", "media.gettyimages.com", "www.travelandleisure.com",
    "images.unsplash.com", "live.staticflickr.com", "encrypted-tbn0.gstatic.com",
    "scontent.xx.fbcdn.net", "www.visitalbania.app", "static.beautytocare.com",
}
OFFICES = {
    "AT": ("tirol.at", "austria.info", "salzburgerland", "kaernten", "vorarlberg", "steiermark", "niederoesterreich", "zillertal", "montafon"),
    "CH": ("myswitzerland", "graubuenden", "valais", "vaud", "berneroberland", "jungfrau"),
    "NO": ("visitnorway", "fjordnorway"),
    "CZ": ("czechtourism", "kudyznudy"),
    "PL": ("polska.travel", "slaskie"),
    "IT": ("italia.it", "dolomiti", "trentino", "valdaosta", "suedtirol", "lombardia"),
    "DE": ("germany.travel", "bayern.by", "allgaeu", "schwarzwald"),
    "SK": ("slovakia.travel",),
    "SI": ("slovenia.info",),
    "ES": ("spain.info",),
    "SE": ("visitsweden",),
    "FI": ("visitfinland",),
}
MOTS_VIDES = {
    "ski", "skigebiet", "skiarea", "lift", "lifte", "lifts", "station", "centre", "center", "area",
    "arena", "park", "resort", "mont", "monte", "alpe", "alpes", "piste", "pista", "sankt", "saint",
    "bahn", "berg", "bergbahn", "bergbahnen", "skilift", "skilifte", "stok", "sjezdovka", "narciarski",
}
DEVISES = {"€": "EUR", "EUR": "EUR", "CHF": "CHF", "CZK": "CZK", "KČ": "CZK", "NOK": "NOK", "PLN": "PLN",
           "ZŁ": "PLN", "SEK": "SEK", "GBP": "GBP", "£": "GBP", "$": "USD", "DKK": "DKK", "RON": "RON",
           "HUF": "HUF", "BGN": "BGN", "TRY": "TRY", "GEL": "GEL", "AMD": "AMD", "ISK": "ISK"}


def fold(s) -> str:
    t = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def lire(chemin: Path) -> list[dict]:
    if chemin.suffix.lower() == ".csv":
        with open(chemin, encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f, delimiter=";"))
    import openpyxl

    ws = openpyxl.load_workbook(chemin, read_only=True, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(h) for h in rows[0]]
    return [dict(zip(hdr, r)) for r in rows[1:] if r and r[0]]


def nombre(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", ".").replace(" ", ""))
    except ValueError:
        return None


def hote(url: str) -> str:
    return urlsplit(url).netloc.lower()


def corroboration(r: dict, repetees: set[str]) -> str | None:
    """Pourquoi croire cette photo ; `None` si rien ne la corrobore."""
    u = str(r["photo_url"]).strip()
    if u in repetees:
        return None
    h = hote(u)
    if h in BANQUES:
        return None
    site = urlsplit(str(r.get("site_officiel_connu") or "")).netloc.lower().replace("www.", "")
    if site and (h.replace("www.", "") == site or h.endswith("." + site)):
        return "hote-officiel"
    chemin = fold(unquote(u))
    mots = {m for m in fold(r["nom"]).split() + fold(r.get("localite")).split() if len(m) >= 4 and m not in MOTS_VIDES}
    if any(m in chemin for m in mots):
        return "nom"
    pays = str(r["id"])[:2].upper()
    if any(x in h for x in OFFICES.get(pays, ())):
        return "office-du-pays"
    if "bergfex" in h:
        return "bergfex"
    return None


class Politesse:
    def __init__(self) -> None:
        self.verrou = threading.Lock()
        self.dernier: dict[str, float] = {}

    def attendre(self, h: str) -> None:
        with self.verrou:
            t = self.dernier.get(h, 0)
            delai = max(0.0, t + INTERVALLE - time.monotonic())
            self.dernier[h] = time.monotonic() + delai
        if delai:
            time.sleep(delai)


def sonder(url: str, politesse: Politesse) -> dict:
    """Un octet : le type, le poids, et si c'est bien une image servie."""
    h = hote(url)
    politesse.attendre(h)
    ua = UA_WIKIMEDIA if h == "wikimedia.org" or h.endswith(".wikimedia.org") else UA
    try:
        res = requests.get(url, headers={"User-Agent": ua, "Range": "bytes=0-0", "Accept": "image/*"}, timeout=20, stream=True)
        typ = res.headers.get("content-type", "")
        cr = res.headers.get("content-range", "")
        m = re.search(r"/(\d+)$", cr)
        total = int(m.group(1)) if m else int(res.headers.get("content-length") or 0)
        res.close()
        ok = res.status_code in (200, 206) and typ.startswith("image/") and total >= POIDS_MIN
        return {"statut": res.status_code, "type": typ.split(";")[0], "taille": total, "servi": ok}
    except requests.RequestException as e:
        return {"statut": None, "type": None, "taille": None, "servi": False, "erreur": type(e).__name__}


def source_forfait(r: dict) -> str | None:
    s = str(r.get("source") or "").strip()
    note = str(r.get("note") or "")
    periode = str(r.get("periode") or "")
    if s.startswith("http"):
        return s
    if "skiinfo" in (s + note + periode).lower():
        pays = fold(r.get("pays")).replace(" ", "-")
        return f"https://www.skiinfo.fr/{pays}/forfaits-de-ski"
    site = str(r.get("site_officiel_connu") or "").strip()
    if "site officiel" in note.lower() and site.startswith("http"):
        return site
    return None


def main() -> None:
    chemin = Path(sys.argv[1])
    controle = "--sans-controle" not in sys.argv
    lignes = [r for r in lire(chemin) if not str(r["id"]).startswith("fr-")]
    print(f"{len(lignes)} lignes hors France")

    # ── Photos ──
    urls = [str(r["photo_url"]).strip() for r in lignes if r.get("photo_url")]
    repetees = {u for u in set(urls) if urls.count(u) > 1}
    candidates: dict[str, dict] = {}
    ecartes = {"repetee": 0, "banque-ou-social": 0, "sans-corroboration": 0, "non-servie": 0}
    for r in lignes:
        u = str(r.get("photo_url") or "").strip()
        if not u:
            continue
        c = corroboration(r, repetees)
        if c is None:
            if u in repetees:
                ecartes["repetee"] += 1
            elif hote(u) in BANQUES:
                ecartes["banque-ou-social"] += 1
            else:
                ecartes["sans-corroboration"] += 1
            continue
        candidates[str(r["id"])] = {"url": u, "hote": hote(u), "corroboration": c, "legende": (str(r.get("photo_legende")).strip() or None) if r.get("photo_legende") else None}
    print(f"photos : {len(urls)} adresses, {len(candidates)} corroborées, écartées {ecartes}")

    photos: dict[str, dict] = {}
    if controle and candidates:
        politesse = Politesse()
        print(f"contrôle de {len(candidates)} images, un octet chacune…")
        with ThreadPoolExecutor(max_workers=6) as ex:
            resultats = list(ex.map(lambda kv: (kv[0], sonder(kv[1]["url"], politesse)), candidates.items()))
        for id_, res in resultats:
            c = candidates[id_]
            if res["servi"]:
                photos[id_] = {**c, "type": res["type"], "taille": res["taille"], "servi": True}
            else:
                ecartes["non-servie"] += 1
    elif candidates:
        photos = {k: {**v, "type": None, "taille": None, "servi": False} for k, v in candidates.items()}
    print(f"  servies : {len(photos)} ; non servies : {ecartes['non-servie']}")
    print("  par corroboration :", {c: sum(1 for p in photos.values() if p["corroboration"] == c) for c in ("hote-officiel", "nom", "office-du-pays", "bergfex")})

    # ── Forfaits ──
    forfaits: dict[str, dict] = {}
    sans_source = sans_devise = 0
    for r in lignes:
        jour = nombre(r.get("forfait_jour_adulte"))
        if jour is None:
            continue
        devise = DEVISES.get(str(r.get("devise") or "").strip().upper())
        if not devise:
            sans_devise += 1
            continue
        src = source_forfait(r)
        if not src:
            sans_source += 1
            continue
        forfaits[str(r["id"])] = {
            "jourAdulte": jour,
            "devise": devise,
            "periode": (str(r.get("periode")).strip() or None) if r.get("periode") else None,
            "source": src,
            "note": (str(r.get("note")).strip() or None) if r.get("note") else None,
            "jourEnfant": nombre(r.get("forfait_jour_enfant")),
            "sixJoursAdulte": nombre(r.get("forfait_6j_adulte")),
            "sixJoursEnfant": nombre(r.get("forfait_6j_enfant")),
            "saisonAdulte": nombre(r.get("forfait_saison_adulte")),
            "saisonEnfant": nombre(r.get("forfait_saison_enfant")),
        }
    print(f"forfaits : {len(forfaits)} retenus ; sans source lisible {sans_source} ; sans devise {sans_devise}")

    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    SORTIE.write_text(
        json.dumps(
            {
                "at": date.today().isoformat(),
                "source": f"tableau des manques rempli par recherche large ({chemin.name}), relu par scripts/importer-manques.py",
                "regle": "photo gardée si corroborée (hôte officiel, nom dans l'adresse, office du pays, bergfex) et servie ; forfait gardé si prix, devise et source lisible",
                "ecartes": {"photos": ecartes, "forfaits": {"sans-source": sans_source, "sans-devise": sans_devise}},
                "photos": dict(sorted(photos.items())),
                "forfaits": dict(sorted(forfaits.items())),
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"→ {SORTIE}")


if __name__ == "__main__":
    main()
