"""Lecture de `robots.txt`, appliquee reellement.

Ce module decide si une URL peut etre demandee. Il n'est pas decoratif : rien
dans cet outil n'emet de requete vers une fiche sans etre passe par
`autorise()`, et un refus arrete la fiche au lieu de chercher un contournement.

Mesure du 2026-08-30 sur les deux sites vises, groupe `User-agent: *` :

    airbnb.fr   /rooms/<id>            AUTORISE
    airbnb.fr   /rooms/<id>/location   INTERDIT   (disallow /rooms/*/location)
    booking.com /hotel/<pays>/<slug>   AUTORISE

La deuxieme ligne est la plus interessante du lot : Airbnb autorise la fiche et
interdit sa sous-page « location ». C'est une consigne explicite sur la donnee
meme que cet outil cherche. On la respecte — la position se lit dans la charge
utile de la fiche quand elle y est, jamais en allant chercher `/location`.

L'implementation suit la convention usuelle : groupes `User-agent` consecutifs,
regle la plus longue qui correspond, `Allow` gagne a longueur egale, `*` et `$`
reconnus dans les motifs. Elle est volontairement petite et lisible plutot que
complete : les cas exotiques (`crawl-delay`, groupes imbriques) n'apparaissent
sur aucun des deux sites, et une implementation qu'on ne peut pas relire ne
protege de rien.
"""

from __future__ import annotations

import re
import time
import urllib.request
from dataclasses import dataclass, field
from urllib.parse import urlparse

#: User-agent envoye pour `robots.txt` **et** pour les fiches. Le meme dans les
#: deux cas, sans quoi on lirait les regles destinees a quelqu'un d'autre.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

#: Duree de validite du cache memoire, en secondes. Un `robots.txt` par hote et
#: par execution suffit : l'outil traite des dizaines d'URL, pas des millions.
CACHE_TTL_S = 3600.0


@dataclass
class _Regle:
    type: str  # "allow" | "disallow"
    motif: str


@dataclass
class _Groupe:
    agents: list[str] = field(default_factory=list)
    regles: list[_Regle] = field(default_factory=list)


@dataclass
class Verdict:
    """Ce que `robots.txt` dit de cette URL, et pourquoi."""

    autorise: bool
    #: Regle appliquee, rendue telle qu'ecrite dans le fichier. `None` quand
    #: aucune ne correspond — le defaut est alors l'autorisation.
    regle: str | None
    #: Vrai quand `robots.txt` n'a pas pu etre lu. On autorise dans ce cas, en
    #: le disant : un hote injoignable n'est pas un hote qui refuse, et se
    #: bloquer soi-meme sur une panne reseau ne protege personne.
    indisponible: bool = False


_cache: dict[str, tuple[float, list[_Groupe]]] = {}


def _analyser(texte: str) -> list[_Groupe]:
    groupes: list[_Groupe] = []
    courant: _Groupe | None = None
    attend_agents = False
    for brut in texte.splitlines():
        ligne = brut.split("#", 1)[0].strip()
        if not ligne:
            continue
        m = re.match(r"^user-agent\s*:\s*(.*)$", ligne, re.I)
        if m:
            # Plusieurs `User-agent` consecutifs partagent le meme groupe de
            # regles ; le groupe ne se ferme qu'a la premiere regle rencontree.
            if not attend_agents:
                courant = _Groupe()
                groupes.append(courant)
                attend_agents = True
            courant.agents.append(m.group(1).strip().lower())
            continue
        m = re.match(r"^(allow|disallow)\s*:\s*(.*)$", ligne, re.I)
        if m and courant is not None:
            attend_agents = False
            courant.regles.append(_Regle(m.group(1).lower(), m.group(2).strip()))
    return groupes


def _correspond(motif: str, chemin: str) -> bool:
    """Le motif robots couvre-t-il ce chemin ?

    `*` vaut « n'importe quoi », `$` ancre la fin. Tout le reste est litteral,
    d'ou l'echappement caractere par caractere : un `?` ou un `.` dans une URL
    de fiche Booking ne doit pas devenir un quantificateur.
    """
    if motif == "":
        return False
    rx = ["^"]
    for c in motif:
        if c == "*":
            rx.append(".*")
        elif c == "$":
            rx.append("$")
        else:
            rx.append(re.escape(c))
    return re.match("".join(rx), chemin) is not None


def _groupes_pour(hote_url: str) -> list[_Groupe] | None:
    base = f"{urlparse(hote_url).scheme}://{urlparse(hote_url).netloc}"
    frais = _cache.get(base)
    if frais and time.time() - frais[0] < CACHE_TTL_S:
        return frais[1]
    req = urllib.request.Request(
        base + "/robots.txt", headers={"User-Agent": USER_AGENT}
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as rep:
            texte = rep.read().decode("utf-8", errors="replace")
    except Exception:
        return None
    groupes = _analyser(texte)
    _cache[base] = (time.time(), groupes)
    return groupes


def autorise(url: str) -> Verdict:
    """Cette URL peut-elle etre demandee ?

    Le groupe retenu est celui de `*` : cet outil ne se declare pas sous un nom
    de robot particulier, il se presente comme un navigateur ordinaire, et c'est
    donc le groupe generique qui le concerne.
    """
    groupes = _groupes_pour(url)
    if groupes is None:
        return Verdict(autorise=True, regle=None, indisponible=True)

    groupe = next((g for g in groupes if "*" in g.agents), None)
    if groupe is None:
        return Verdict(autorise=True, regle=None)

    p = urlparse(url)
    chemin = p.path + (("?" + p.query) if p.query else "")

    meilleur: _Regle | None = None
    for r in groupe.regles:
        if not _correspond(r.motif, chemin):
            continue
        # Regle la plus longue ; a egalite, `Allow` l'emporte.
        if (
            meilleur is None
            or len(r.motif) > len(meilleur.motif)
            or (len(r.motif) == len(meilleur.motif) and r.type == "allow")
        ):
            meilleur = r

    if meilleur is None:
        return Verdict(autorise=True, regle=None)
    return Verdict(
        autorise=meilleur.type == "allow",
        regle=f"{meilleur.type}: {meilleur.motif}",
    )
