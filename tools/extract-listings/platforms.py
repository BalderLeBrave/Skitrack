"""Reconnaissance de la plate-forme et normalisation d'URL.

Petit module, mais il porte une decision : l'identifiant d'annonce est tire de
l'URL, jamais du contenu. Deux visites de la meme fiche doivent produire le
meme `listing_id`, y compris quand la page a change entre-temps — c'est ce qui
permet de dedupliquer et de comparer deux executions.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

Plateforme = str  # "airbnb" | "booking" | "unknown"


def detecter_plateforme(url: str) -> Plateforme:
    hote = (urlparse(url).netloc or "").lower()
    if "airbnb." in hote:
        return "airbnb"
    if "booking.com" in hote:
        return "booking"
    # Un identifiant nu suffit a designer une fiche Airbnb : c'est la forme que
    # prennent les listes collees a la main.
    if re.fullmatch(r"\d{6,}", url.strip()):
        return "airbnb"
    return "unknown"


def normaliser_url(url: str) -> tuple[str, str | None]:
    """Rend l'URL canonique et l'identifiant d'annonce.

    Les parametres de recherche sont **retires**. Ils portent des dates et une
    taille de groupe, et une fiche lue avec `adults=2` n'est pas une autre fiche
    que la meme lue sans : les garder ferait deux lignes pour un seul logement,
    et surtout inviterait a confondre le groupe cherche avec la capacite du bien.
    """
    brut = url.strip()

    if re.fullmatch(r"\d{6,}", brut):
        return f"https://www.airbnb.fr/rooms/{brut}", brut

    p = urlparse(brut)
    plateforme = detecter_plateforme(brut)

    if plateforme == "airbnb":
        m = re.search(r"/rooms/(\d+)", p.path)
        ident = m.group(1) if m else None
        if ident:
            return f"https://www.{p.netloc.split('.', 1)[1] if p.netloc.startswith('www.') else p.netloc}/rooms/{ident}".replace(
                "https://www.airbnb", "https://www.airbnb"
            ), ident
        return f"{p.scheme}://{p.netloc}{p.path}", None

    if plateforme == "booking":
        # Le slug est l'identifiant stable : `/hotel/fr/<slug>.fr.html`.
        m = re.search(r"/hotel/[a-z]{2}/([^./?#]+)", p.path, re.I)
        return f"{p.scheme}://{p.netloc}{p.path}", (m.group(1) if m else None)

    return brut, None
