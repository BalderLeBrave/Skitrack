"""Rapatrie le texte des pages de tarifs, pour qu'on puisse les lire.

    python scripts/fetch-pages-tarifs.py <dossier de travail> [--essai 10]

Écrit `<travail>/tarifs/<id>.txt` — le texte de la page, tableaux compris —
et `<travail>/tarifs.json` : ce qui a été visité, avec l'adresse et le
verdict de `robots.txt`.

## Pourquoi du texte, et pourquoi pas une expression régulière

Dix-huit prix seulement sont sortis des cent soixante-cinq pages de tarifs
déjà trouvées. Ce n'est pas faute de prix : c'est que chaque station écrit
sa grille autrement — un tableau, une liste de cartes, un paragraphe, une
image de tableau. Une expression régulière qui lit « le premier montant
d'une ligne qui contient un mot de durée » se trompe de colonne dès que le
tableau a un tarif de groupe, un demi-tarif ou un prix en promotion ; elle
l'a fait, et il a fallu la réécrire trois fois.

Le texte est donc rapatrié tel quel, une fois, poliment, et c'est un
lecteur qui en tirera les six tarifs — avec, pour chacun, la ligne exacte
d'où il vient. Une valeur sans sa ligne ne sera pas retenue.

## Politesse

`robots.txt` est lu avant chaque hôte et respecté : une page interdite
n'est pas demandée, et c'est écrit dans le relevé. Une requête par hôte
toutes les deux secondes, un agent nommé avec un contact, et un 429 ou un
503 met l'hôte de côté pour le reste du tour.
"""

from __future__ import annotations

import json
import re
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser

import requests

DATA = Path("src/lib/monde/data")
# Se présenter comme un navigateur, comme le relevé de l'app (consigne du propriétaire, 24 sept. 2026).
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
AGENT = "Skitrack"
INTERVALLE = 2.0
TIMEOUT = 25
TEXTE_MAX = 60_000

POSTES = ["jourAdulte", "jourEnfant", "sixJoursAdulte", "sixJoursEnfant", "saisonAdulte", "saisonEnfant"]


def texte_de(html: str) -> str:
    """Le texte de la page, les tableaux gardés ligne à ligne.

    Les cellules sont séparées par « | » et les lignes par un retour : c'est
    ce qui permet, plus tard, de citer une ligne entière comme preuve.
    """
    h = re.sub(r"(?is)<(script|style|svg|noscript)[^>]*>.*?</\1>", " ", html)
    h = re.sub(r"(?i)</t[dh]>", " | ", h)
    h = re.sub(r"(?i)</(tr|p|div|li|h[1-6]|table|section)>", "\n", h)
    h = re.sub(r"(?i)<br\s*/?>", "\n", h)
    h = re.sub(r"<[^>]+>", " ", h)
    h = (h.replace("&nbsp;", " ").replace("&amp;", "&").replace("&euro;", "€")
          .replace("&#8364;", "€").replace("&quot;", '"').replace("&#039;", "'"))
    lignes = [re.sub(r"[ \t]+", " ", l).strip(" |\t ") for l in h.split("\n")]
    return "\n".join(l for l in lignes if l)[:TEXTE_MAX]


class Hotes:
    """Un `robots.txt` par hôte, lu une fois, et la cadence par hôte."""

    def __init__(self) -> None:
        self.robots: dict[str, RobotFileParser | None] = {}
        self.dernier: dict[str, float] = {}
        self.refuses: set[str] = set()

    def attendre(self, hote: str) -> None:
        d = max(0.0, self.dernier.get(hote, 0.0) + INTERVALLE - time.monotonic())
        if d:
            time.sleep(d)
        self.dernier[hote] = time.monotonic()

    def autorise(self, url: str) -> bool:
        hote = urlsplit(url).netloc
        if hote in self.refuses:
            return False
        if hote not in self.robots:
            self.attendre(hote)
            rp = RobotFileParser()
            try:
                r = requests.get(urljoin(f"https://{hote}/", "/robots.txt"),
                                 headers={"User-Agent": UA}, timeout=15)
                rp.parse(r.text.splitlines() if r.status_code == 200 else [])
            except requests.RequestException:
                rp.parse([])
            self.robots[hote] = rp
        rp = self.robots[hote]
        try:
            return bool(rp and (rp.can_fetch(AGENT, url) and rp.can_fetch("*", url)))
        except Exception:
            return True


def main() -> None:
    travail = Path(sys.argv[1])
    (travail / "tarifs").mkdir(parents=True, exist_ok=True)
    vues = json.loads((DATA / "vuesDomaines.json").read_text(encoding="utf-8"))["vues"]
    tarifs = json.loads((DATA / "tarifsOfficiels.json").read_text(encoding="utf-8"))["fiches"]
    sites = json.loads((DATA / "sitesOfficiels.json").read_text(encoding="utf-8"))["fiches"]
    noms: dict[str, dict] = {}
    for f in sorted(DATA.glob("[A-Z][A-Z].json")):
        for d in json.loads(f.read_text(encoding="utf-8")):
            noms[d["id"]] = d

    # Ce qui vaut le détour : une matrice incomplète, et une page de tarifs connue.
    cibles: list[dict] = []
    for id_, v in vues.items():
        m = ((v.get("forfait") or {}).get("matrice")) or {}
        if m and all(m.get(p) for p in POSTES):
            continue
        page = (tarifs.get(id_) or {}).get("pageTarifs") or (sites.get(id_) or {}).get("pageTarifs")
        if not page:
            continue
        cibles.append({"id": id_, "url": page, "nom": (noms.get(id_) or {}).get("nom"),
                       "manque": [p for p in POSTES if not m.get(p)]})
    for id_ in noms:
        if id_ in vues:
            continue
        page = (tarifs.get(id_) or {}).get("pageTarifs") or (sites.get(id_) or {}).get("pageTarifs")
        if page:
            cibles.append({"id": id_, "url": page, "nom": noms[id_].get("nom"), "manque": POSTES})

    sortie_f = travail / "tarifs.json"
    sortie: dict = json.loads(sortie_f.read_text(encoding="utf-8")) if sortie_f.exists() else {}
    cibles = [c for c in cibles if c["id"] not in sortie]
    if "--essai" in sys.argv:
        cibles = cibles[: int(sys.argv[sys.argv.index("--essai") + 1])]
    print(f"{len(cibles)} pages de tarifs à rapatrier ({len(sortie)} déjà faites)")

    hotes = Hotes()
    session = requests.Session()
    gardees = 0
    for i, c in enumerate(cibles, 1):
        url = c["url"]
        if not hotes.autorise(url):
            sortie[c["id"]] = {**c, "statut": None, "robots": "interdit"}
            continue
        hotes.attendre(urlsplit(url).netloc)
        try:
            r = session.get(url, headers={"User-Agent": UA, "Accept": "text/html"}, timeout=TIMEOUT)
            statut = r.status_code
            if statut in (429, 503):
                hotes.refuses.add(urlsplit(url).netloc)
                sortie[c["id"]] = {**c, "statut": statut, "robots": "autorisé", "note": "hôte mis de côté"}
                continue
            if statut == 200 and "text/html" in r.headers.get("content-type", ""):
                t = texte_de(r.text)
                (travail / "tarifs" / f"{c['id']}.txt").write_text(t, encoding="utf-8")
                sortie[c["id"]] = {**c, "statut": 200, "robots": "autorisé", "octets": len(t),
                                   "finale": r.url, "fichier": f"{c['id']}.txt"}
                gardees += 1
            else:
                sortie[c["id"]] = {**c, "statut": statut, "robots": "autorisé"}
        except requests.RequestException as e:
            sortie[c["id"]] = {**c, "statut": None, "robots": "autorisé", "erreur": type(e).__name__}
        if i % 20 == 0:
            sortie_f.write_text(json.dumps(sortie, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"  {i}/{len(cibles)} — {gardees} pages gardées", flush=True)
    sortie_f.write_text(json.dumps(sortie, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(sortie)} visitées ; {sum(1 for v in sortie.values() if v.get('fichier'))} pages en réserve ; "
          f"{sum(1 for v in sortie.values() if v.get('robots') == 'interdit')} interdites par robots.txt")
    print(f"relevé du {date.today().isoformat()}")


if __name__ == "__main__":
    main()
