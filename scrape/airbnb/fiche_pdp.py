"""La fiche enrichie d'une annonce Airbnb, lue sur la réponse PdpPlatformSections
déjà reçue (`pdp.lire_reponse_pdp`) : aucune requête de plus. Module pur.

Ce qu'elle lit, tel qu'Airbnb le publie :

- la description (`PdpDescriptionSection.htmlDescription.htmlText`) ;
- les équipements (`seeAllAmenitiesGroups[].amenities[]`), avec `available`
  quand Airbnb marque un équipement « Non inclus » ;
- le règlement (`PoliciesSection.houseRulesSections`) et la politique
  d'annulation (tout texte d'une clé `cancellation…` de la même section) ;
- la note et le nombre d'avis (`eventDataLogging.guestSatisfactionOverall`,
  `visibleReviewCount`, ou `overallRating` / `overallCount` d'une section
  d'avis), sur 5.

Les sections se cherchent par leur `__typename`, à toute profondeur : la forme
`merlin` (PdpPlatformSections) et la forme `presentation` (StaysPdpSections,
celle que lit `pyairbnb/standardize.py`) les portent à des endroits différents.

Ce qui n'y est pas reste absent : `None` ou liste vide, jamais un défaut. Les
libellés sont rendus tels quels ; la normalisation (clés, groupes) et la note
sur 5 se font côté Node (`stay/equipements.ts`, `note.ts`), une seule fois.
"""

from __future__ import annotations

import html
import re
from typing import Any, Iterator

# Échelle des notes Airbnb : sur 5.
ECHELLE_AIRBNB = 5
EXTRAITS_MAX = 5
TEXTE_MAX = 6000
EXTRAIT_MAX = 1200

_BALISE_LIGNE = re.compile(r"<\s*(br|/p|/li|/div|/h\d)\s*/?\s*>", re.I)
_BALISE = re.compile(r"<[^>]+>")
_ESPACES = re.compile(r"[ \t ]+")
_LIGNES = re.compile(r"\n{3,}")


def texte_de_html(brut: Any, limite: int = TEXTE_MAX) -> str | None:
    """Le texte d'un fragment HTML : balises ôtées, sauts de ligne gardés."""
    if not isinstance(brut, str) or not brut.strip():
        return None
    t = _BALISE_LIGNE.sub("\n", brut)
    t = html.unescape(_BALISE.sub("", t))
    t = "\n".join(_ESPACES.sub(" ", ligne).strip() for ligne in t.split("\n"))
    t = _LIGNES.sub("\n\n", t).strip()
    return t[:limite] if t else None


def _sections(raw: Any, profondeur: int = 0) -> Iterator[dict[str, Any]]:
    """Tous les objets de la réponse qui portent un `__typename`."""
    if profondeur > 40:
        return
    if isinstance(raw, dict):
        if isinstance(raw.get("__typename"), str):
            yield raw
        for v in raw.values():
            yield from _sections(v, profondeur + 1)
    elif isinstance(raw, list):
        for v in raw:
            yield from _sections(v, profondeur + 1)


def _cles(raw: Any, nom: str, profondeur: int = 0) -> Iterator[Any]:
    """Les valeurs de toutes les clés `nom`, à toute profondeur."""
    if profondeur > 40:
        return
    if isinstance(raw, dict):
        for k, v in raw.items():
            if k == nom:
                yield v
            yield from _cles(v, nom, profondeur + 1)
    elif isinstance(raw, list):
        for v in raw:
            yield from _cles(v, nom, profondeur + 1)


def _chaine(v: Any) -> str | None:
    return v.strip() if isinstance(v, str) and v.strip() else None


def description_de(raw: Any) -> str | None:
    for s in _sections(raw):
        if s.get("__typename") != "PdpDescriptionSection":
            continue
        hd = s.get("htmlDescription")
        t = texte_de_html(hd.get("htmlText") if isinstance(hd, dict) else None)
        if t:
            return t
    return None


NON_INCLUS_RE = re.compile(r"^(non inclus|not included|indisponible|unavailable)$", re.I)


def equipements_de(raw: Any) -> list[dict[str, Any]]:
    """Chaque équipement publié : son libellé, son groupe, et `present`
    (`False` seulement quand Airbnb le marque indisponible). Dédoublonné par
    libellé ; la clé normalisée se pose côté Node."""
    out: list[dict[str, Any]] = []
    vus: set[str] = set()
    for groupes in _cles(raw, "seeAllAmenitiesGroups"):
        if not isinstance(groupes, list):
            continue
        for g in groupes:
            if not isinstance(g, dict):
                continue
            titre_groupe = _chaine(g.get("title"))
            groupe_absent = bool(titre_groupe and NON_INCLUS_RE.match(titre_groupe))
            for a in g.get("amenities") or []:
                if not isinstance(a, dict):
                    continue
                libelle = _chaine(a.get("title"))
                if not libelle or libelle.lower() in vus:
                    continue
                vus.add(libelle.lower())
                present = not (a.get("available") is False or groupe_absent)
                item: dict[str, Any] = {"libelle": libelle, "present": present}
                if titre_groupe and not groupe_absent:
                    item["groupe"] = titre_groupe
                out.append(item)
    return out


ARRIVEE_RE = re.compile(r"^(arriv[ée]e|check[- ]?in)\b", re.I)
DEPART_RE = re.compile(r"^(d[ée]part|check[- ]?out)\b", re.I)
ANIMAUX_RE = re.compile(r"\b(animaux|animal|pets?)\b", re.I)
FUMEURS_RE = re.compile(r"\b(fum\w*|smok\w*)\b", re.I)
FETES_RE = re.compile(r"\b(f[êe]tes?|[ée]v[ée]nements?|part(y|ies)|events?)\b", re.I)
CAUTION_RE = re.compile(r"\b(caution|security deposit|d[ée]p[ôo]t de garantie)\b", re.I)
NON_RE = re.compile(r"\b(non|pas|interdit\w*|no|not|aucun\w*)\b", re.I)
DEMANDE_RE = re.compile(r"\b(sur demande|on request|upon request)\b", re.I)
OUI_RE = re.compile(r"\b(admis|accept\w*|autoris\w*|allowed|permitted|bienvenus?|welcome)\b", re.I)


def _oui_non(t: str, demande_ok: bool = False) -> str | None:
    if demande_ok and DEMANDE_RE.search(t):
        return "sur_demande"
    if NON_RE.search(t):
        return "non"
    if OUI_RE.search(t):
        return "oui"
    return None


def conditions_de(raw: Any) -> dict[str, Any] | None:
    """Le règlement et l'annulation, dans les mots d'Airbnb. Chaque règle
    reconnue remplit son champ ; toutes forment le règlement."""
    regles: list[str] = []
    annulation: list[str] = []
    for s in _sections(raw):
        if s.get("__typename") != "PoliciesSection":
            continue
        for sec in s.get("houseRulesSections") or []:
            if not isinstance(sec, dict):
                continue
            for it in sec.get("items") or []:
                if not isinstance(it, dict):
                    continue
                t = _chaine(it.get("title"))
                corps = it.get("html")
                detail = texte_de_html(corps.get("htmlText") if isinstance(corps, dict) else None, 2000)
                for x in (t, detail):
                    if x and x not in regles:
                        regles.append(x)
        for k, v in s.items():
            if "cancellation" not in k.lower():
                continue
            for x in _textes(v):
                if x not in annulation:
                    annulation.append(x)
    if not regles and not annulation:
        return None
    out: dict[str, Any] = {}
    for r in regles:
        if "arrivee" not in out and ARRIVEE_RE.search(r):
            out["arrivee"] = r
        elif "depart" not in out and DEPART_RE.search(r):
            out["depart"] = r
        elif "animaux" not in out and ANIMAUX_RE.search(r):
            v = _oui_non(r, demande_ok=True)
            if v:
                out["animaux"] = v
        elif "fumeurs" not in out and FUMEURS_RE.search(r):
            v = _oui_non(r)
            if v:
                out["fumeurs"] = v
        elif "fetes" not in out and FETES_RE.search(r):
            v = _oui_non(r)
            if v:
                out["fetes"] = v
        elif "caution" not in out and CAUTION_RE.search(r):
            out["caution"] = r
    if regles:
        out["reglement"] = "\n".join(regles)[:TEXTE_MAX]
    if annulation:
        out["annulation"] = "\n".join(annulation)[:TEXTE_MAX]
    return out


def _textes(v: Any, profondeur: int = 0) -> Iterator[str]:
    """Les textes lisibles d'une valeur : chaînes, et `htmlText` des fragments."""
    if profondeur > 12:
        return
    if isinstance(v, str):
        t = texte_de_html(v, 2000) if "<" in v else _chaine(v)
        if t and not re.fullmatch(r"[A-Z0-9_]+", t):  # un identifiant, pas un texte
            yield t
    elif isinstance(v, dict):
        for k, x in v.items():
            if k in ("__typename", "icon", "id", "loggingEventData", "url", "link"):
                continue
            yield from _textes(x, profondeur + 1)
    elif isinstance(v, list):
        for x in v:
            yield from _textes(x, profondeur + 1)


def _nombre(v: Any) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.replace(",", "."))
        except ValueError:
            return None
    return None


def _entier(v: Any) -> int | None:
    n = _nombre(v)
    return int(n) if n is not None and n >= 0 and n == int(n) else None


def note_de(raw: Any) -> dict[str, Any] | None:
    """La note brute et le nombre d'avis, sur l'échelle d'Airbnb (5)."""
    note: float | None = None
    nombre: int | None = None
    for log in _cles(raw, "eventDataLogging"):
        if not isinstance(log, dict):
            continue
        if note is None:
            note = _nombre(log.get("guestSatisfactionOverall"))
        if nombre is None:
            nombre = _entier(log.get("visibleReviewCount"))
    for s in _sections(raw):
        if note is None and "overallRating" in s:
            note = _nombre(s.get("overallRating"))
        if nombre is None and "overallCount" in s:
            nombre = _entier(s.get("overallCount"))
    if note is not None and not 0 < note <= ECHELLE_AIRBNB:
        note = None
    if note is None and nombre is None:
        return None
    return {"noteSource": note, "echelleSource": ECHELLE_AIRBNB, "nombre": nombre}


def fiche_enrichie_de_pdp(raw: Any) -> dict[str, Any] | None:
    """La fiche enrichie, ou None quand la réponse n'en dit rien. Jamais
    d'exception : une forme inattendue ne fait que des champs vides."""
    try:
        description = description_de(raw)
        equipements = equipements_de(raw)
        conditions = conditions_de(raw)
        avis = note_de(raw)
    except Exception:
        return None
    if not (description or equipements or conditions or avis):
        return None
    return {
        "description": description,
        "equipements": equipements,
        "conditions": conditions,
        "avis": {**avis, "extraits": []} if avis else None,
    }


def prenom(v: Any) -> str | None:
    t = _chaine(v)
    return t.split()[0] if t else None


def extraits_avis(avis: Any) -> list[dict[str, Any]]:
    """Les avis d'une page StaysPdpReviewsQuery (triée MOST_RECENT) : cinq au
    plus, avec le prénom, la date, la note brute (sur 5) et le texte."""
    if not isinstance(avis, list):
        return []
    out: list[dict[str, Any]] = []
    for a in avis:
        if not isinstance(a, dict):
            continue
        texte = texte_de_html(a.get("comments"), EXTRAIT_MAX)
        if not texte:
            continue
        reviewer = a.get("reviewer") if isinstance(a.get("reviewer"), dict) else {}
        note = _nombre(a.get("rating"))
        x: dict[str, Any] = {"texte": texte}
        p = prenom(reviewer.get("firstName"))
        if p:
            x["auteur"] = p
        date = _chaine(a.get("createdAt")) or _chaine(a.get("localizedDate"))
        if date:
            x["date"] = date[:10] if re.match(r"\d{4}-\d{2}-\d{2}", date) else date
        if note is not None and 0 < note <= ECHELLE_AIRBNB:
            x["noteSource"] = note
        out.append(x)
        if len(out) >= EXTRAITS_MAX:
            break
    return out
