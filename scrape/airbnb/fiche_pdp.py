"""La fiche enrichie d'une annonce Airbnb, lue sur la réponse PdpPlatformSections
déjà reçue (`pdp.lire_reponse_pdp`) : aucune requête de plus. Module pur.

Ce qu'elle lit, tel qu'Airbnb le publie :

- la description (`PdpDescriptionSection.htmlDescription.htmlText`, sinon son
  texte plat, sinon les rubriques de la fenêtre « Description » :
  `GeneralListContentSection` d'une section `…DESCRIPTION…`) ;
- les équipements (`seeAllAmenitiesGroups[].amenities[]`, sinon l'aperçu
  `previewAmenitiesGroups`), avec `available` quand Airbnb marque un
  équipement « Non inclus » ;
- le règlement (`PoliciesSection.houseRulesSections`, sinon l'aperçu
  `houseRules`) et la politique d'annulation (tout texte d'une clé
  `cancellation…` de la même section, ou d'une section `…Cancellation…` à
  part) ;
- la note et le nombre d'avis (`eventDataLogging.guestSatisfactionOverall`,
  `visibleReviewCount`, `overallRating` / `overallCount` d'une section
  d'avis, sinon le libellé d'accessibilité de cette section, « 4,92 sur 5 ·
  48 avis »), sur 5 ;
- les avis que la section d'avis porte déjà (`reviews`), cinq au plus. La page
  d'avis (`pdp.lire_page_avis`, la plus récente d'abord) les remplace quand
  elle répond.

Les sections se cherchent par leur `__typename`, à toute profondeur : la forme
`merlin` (PdpPlatformSections) et la forme `presentation` (StaysPdpSections,
celle que lit `pyairbnb/standardize.py`) les portent à des endroits différents.

Ce qui n'y est pas reste absent : `None` ou liste vide, jamais un défaut. Les
libellés sont rendus tels quels ; la normalisation (clés, groupes) et la note
sur 5 se font côté Node (`stay/equipements.ts`, `note.ts`), une seule fois.

Un bloc de plus lu ici : augmenter `VERSION_LECTEUR_PDP`
(`src/lib/stay/memoireFiches.server.ts`), pour que les pages lues sans fiche
par le lecteur d'avant se relisent une fois.
"""

from __future__ import annotations

import html
import math
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


def _liste(v: Any) -> list[Any]:
    """Une liste publiée, sinon rien : un autre type ne se parcourt pas."""
    return v if isinstance(v, list) else []


def _chaine(v: Any) -> str | None:
    return v.strip() if isinstance(v, str) and v.strip() else None


def _enveloppes(raw: Any, profondeur: int = 0) -> Iterator[tuple[str, dict[str, Any]]]:
    """Chaque section avec son `sectionComponentType` (« DESCRIPTION_MODAL »…)."""
    if profondeur > 40:
        return
    if isinstance(raw, dict):
        if isinstance(raw.get("section"), dict) and isinstance(raw.get("sectionComponentType"), str):
            yield raw["sectionComponentType"], raw["section"]
        for v in raw.values():
            yield from _enveloppes(v, profondeur + 1)
    elif isinstance(raw, list):
        for v in raw:
            yield from _enveloppes(v, profondeur + 1)


def description_de(raw: Any) -> str | None:
    candidates: list[str] = []
    for s in _sections(raw):
        if s.get("__typename") != "PdpDescriptionSection":
            continue
        hd = s.get("htmlDescription")
        t = texte_de_html(hd.get("htmlText") if isinstance(hd, dict) else None) or texte_de_html(
            s.get("description")
        )
        if t:
            candidates.append(t)
            break
    # La fenêtre « Description » : ses rubriques (« Le logement », « Accès
    # des voyageurs »…), chacune sous son titre. La page `rooms/` en porte
    # deux, dont la mention légale de l'hôte (« X est entièrement responsable
    # de la proposition de ce logement… ») : la plus longue est la
    # description. Depuis octobre 2026, `PdpDescriptionSection` est souvent un
    # stub vide ; le texte tient dans la modale, et en double sous
    # `pdpPresentation.descriptions.longDescriptionHtml`.
    if not candidates:
        for type_, s in _enveloppes(raw):
            if "DESCRIPTION" not in type_.upper() or s.get("__typename") != "GeneralListContentSection":
                continue
            parties: list[str] = []
            for it in _liste(s.get("items")):
                if not isinstance(it, dict):
                    continue
                corps = it.get("html")
                t = texte_de_html(corps.get("htmlText") if isinstance(corps, dict) else None)
                if not t:
                    continue
                titre = _chaine(it.get("title"))
                parties.append(f"{titre}\n{t}" if titre else t)
            if parties:
                candidates.append("\n\n".join(parties)[:TEXTE_MAX])
    for bloc in _cles(raw, "longDescriptionHtml"):
        if isinstance(bloc, dict):
            t = (
                texte_de_html(bloc.get("localizedStringWithTranslationPreference"))
                or texte_de_html(bloc.get("localizedString"))
                or texte_de_html(bloc.get("htmlText"))
            )
        else:
            t = texte_de_html(bloc)
        if t:
            candidates.append(t[:TEXTE_MAX])
    texte = max(candidates, key=len) if candidates else None
    # Le quartier et les couchages suivent la description. Leur place est
    # gardée : une description longue est coupée avant eux, pas sur eux.
    blocs = [b for b in (quartier_de(raw), couchages_de(raw)) if b and (texte is None or b not in texte)]
    if not blocs:
        return texte[:TEXTE_MAX] if texte else None
    fin = "\n\n".join(blocs)
    if texte is None:
        return fin[:TEXTE_MAX]
    place = TEXTE_MAX - len(fin) - 2
    if place <= 0:
        return texte[:TEXTE_MAX]
    return f"{texte[:place].rstrip()}\n\n{fin}"


def quartier_de(raw: Any) -> str | None:
    """« Points forts du quartier » : le texte de l'hôte sur les pistes, les
    navettes, les commerces. La carte ne donne qu'un point approximatif."""
    lignes: list[str] = []
    for details in _cles(raw, "previewLocationDetails"):
        if not isinstance(details, list):
            continue
        for d in details:
            if not isinstance(d, dict):
                continue
            content = d.get("content") if isinstance(d.get("content"), dict) else {}
            ugc = content.get("content") if isinstance(content.get("content"), dict) else {}
            t = _chaine(ugc.get("localizedStringWithTranslationPreference")) or _chaine(ugc.get("localizedString"))
            if not t or t in lignes:
                continue
            titre = _chaine(d.get("title")) or "Le quartier"
            lignes.append(f"{titre}\n{t}")
        if lignes:
            break
    return "\n\n".join(lignes) if lignes else None


def couchages_de(raw: Any) -> str | None:
    """« Où vous dormirez » : une ligne par pièce, avec ses lits
    (« Chambre 1 : 1 lit double, 1 lit simple »). Le compte « 4 lits » de
    l'aperçu ne dit pas lesquels."""
    lignes: list[str] = []
    for tour in _cles(raw, "sleepingArrangements"):
        if not isinstance(tour, dict):
            continue
        for stop in _liste(tour.get("stops")):
            if not isinstance(stop, dict):
                continue
            desc = stop.get("description") if isinstance(stop.get("description"), dict) else {}
            lits: list[str] = []
            for d in _liste(desc.get("descriptions")):
                t = _chaine(d.get("text")) if isinstance(d, dict) else None
                if t and t not in lits:
                    lits.append(t)
            if not lits:
                continue
            nom = _chaine(stop.get("name"))
            ligne = f"{nom} : {', '.join(lits)}" if nom else ", ".join(lits)
            if ligne not in lignes:
                lignes.append(ligne)
    if not lignes:
        return None
    return "Où vous dormirez\n" + "\n".join(lignes)


NON_INCLUS_RE = re.compile(r"^(non inclus|not included|indisponible|unavailable)$", re.I)


def equipements_de(raw: Any) -> list[dict[str, Any]]:
    """Chaque équipement publié : son libellé, son groupe, et `present`
    (`False` seulement quand Airbnb le marque indisponible). Dédoublonné par
    libellé ; la clé normalisée se pose côté Node. Un groupe sans titre (l'aperçu)
    ne donne pas de groupe."""
    # La liste entière d'abord ; l'aperçu (six à dix équipements) quand elle
    # ne donne aucun équipement lisible (groupes vides, titres absents).
    toutes = [g for g in _cles(raw, "seeAllAmenitiesGroups") if isinstance(g, list) and g]
    return _equipements(toutes) or _equipements(list(_cles(raw, "previewAmenitiesGroups")))


def _equipements(listes: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    vus: set[str] = set()
    for groupes in listes:
        if not isinstance(groupes, list):
            continue
        for g in groupes:
            if not isinstance(g, dict):
                continue
            titre_groupe = _chaine(g.get("title"))
            groupe_absent = bool(titre_groupe and NON_INCLUS_RE.match(titre_groupe))
            for a in _liste(g.get("amenities")):
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
HEURE_RE = re.compile(r"\d{1,2}\s*(:|h)\s*\d{0,2}|\d{1,2}\s*(am|pm)\b", re.I)
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

    def regle(x: str | None) -> None:
        if x and x not in regles:
            regles.append(x)

    def annuler(v: Any) -> None:
        for x in _textes(v):
            if x not in annulation:
                annulation.append(x)

    for s in _sections(raw):
        nom = s.get("__typename") or ""
        # Une politique d'annulation en section à part (hors PoliciesSection).
        if "Cancellation" in nom and nom != "PoliciesSection":
            annuler(s)
            continue
        if nom != "PoliciesSection":
            continue
        sections = [x for x in _liste(s.get("houseRulesSections")) if isinstance(x, dict)]
        for sec in sections:
            for it in _liste(sec.get("items")):
                if not isinstance(it, dict):
                    continue
                corps = it.get("html")
                regle(_chaine(it.get("title")))
                regle(texte_de_html(corps.get("htmlText") if isinstance(corps, dict) else None, 2000))
        if not sections:
            # L'aperçu du règlement (« Arrivée après 16:00 », « Non-fumeur »…).
            for it in _liste(s.get("houseRules")):
                if isinstance(it, dict):
                    regle(_chaine(it.get("title")))
        for k, v in s.items():
            if "cancellation" in k.lower():
                annuler(v)
    # Octobre 2026 : `PoliciesSection` est `NOT_COMPLETE`. Le règlement est
    # dans `pdpPresentation.rules` (`StaysPdpRuleDetails`).
    for rules in _cles(raw, "rules"):
        if not isinstance(rules, dict) or rules.get("__typename") != "StaysPdpRuleDetails":
            continue
        for g in _liste(rules.get("groupItems")):
            if not isinstance(g, dict):
                continue
            for it in _liste(g.get("items")):
                if not isinstance(it, dict):
                    continue
                titre = _chaine(it.get("title"))
                desc = it.get("description")
                extra = _chaine(desc.get("text")) if isinstance(desc, dict) else None
                if titre and extra and extra not in titre:
                    regle(f"{titre} — {extra}")
                else:
                    regle(titre or extra)
    # « Sécurité et logement » : détecteur, caméra, animaux dangereux. Même
    # forme que le règlement, un autre bloc.
    for bloc in _cles(raw, "safetyAndProperty"):
        if not isinstance(bloc, dict) or bloc.get("__typename") != "StaysPdpSafetyAndPropertyDetails":
            continue
        for g in _liste(bloc.get("groupItems")):
            if not isinstance(g, dict):
                continue
            for it in _liste(g.get("items")):
                if not isinstance(it, dict):
                    continue
                titre = _chaine(it.get("title"))
                desc = it.get("description")
                extra = _chaine(desc.get("text")) if isinstance(desc, dict) else None
                if titre and extra and extra not in titre:
                    regle(f"{titre} — {extra}")
                else:
                    regle(titre or extra)
    # L'arrivée autonome (boîte à clé), quand la page la met en avant.
    for highlights in _cles(raw, "highlights"):
        if not isinstance(highlights, list):
            continue
        for h in highlights:
            if not isinstance(h, dict) or h.get("type") != "LISTING_SELF_CHECKIN":
                continue
            titre_h = h.get("headline")
            corps_h = h.get("body")
            titre = _chaine(titre_h.get("localizedContent") if isinstance(titre_h, dict) else None)
            extra = _chaine(corps_h.get("localizedContent") if isinstance(corps_h, dict) else None)
            if titre and extra and extra not in titre:
                regle(f"{titre} — {extra}")
            else:
                regle(titre or extra)
    if not regles and not annulation:
        return None
    out: dict[str, Any] = {}
    # L'arrivée et le départ : la règle qui donne une heure, sinon la première.
    for cle, motif in (("arrivee", ARRIVEE_RE), ("depart", DEPART_RE)):
        candidates = [r for r in regles if motif.search(r)]
        if candidates:
            out[cle] = next((r for r in candidates if HEURE_RE.search(r)), candidates[0])
    for r in regles:
        if ARRIVEE_RE.search(r) or DEPART_RE.search(r):
            continue
        if "animaux" not in out and ANIMAUX_RE.search(r):
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
    return int(n) if n is not None and math.isfinite(n) and n >= 0 and n == int(n) else None


NOTE_LIBELLE_RE = re.compile(r"(\d(?:[.,]\d+)?)\s*(?:sur|out of|/)\s*5\b", re.I)
NOMBRE_LIBELLE_RE = re.compile(r"(\d[\d\s\u202f\u00a0]*)\s*(?:avis|commentaires|reviews?)\b", re.I)


def _section_avis(s: dict[str, Any]) -> bool:
    return "Review" in (s.get("__typename") or "")


def _libelles(v: Any, profondeur: int = 0) -> Iterator[str]:
    """Les libellés (`accessibilityLabel`, `a11yLabel`…) d'une section, hors
    textes d'avis : un voyageur qui écrit « 5 sur 5 » ne fait pas la note."""
    if profondeur > 8:
        return
    if isinstance(v, dict):
        for k, x in v.items():
            if k == "reviews":
                continue
            if isinstance(x, str) and "label" in k.lower():
                yield x
            else:
                yield from _libelles(x, profondeur + 1)
    elif isinstance(v, list):
        for x in v:
            yield from _libelles(x, profondeur + 1)


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
    for stats in _cles(raw, "overallRatingStats"):
        if not isinstance(stats, dict):
            continue
        if note is None:
            note = _nombre(stats.get("ratingAverage"))
        if nombre is None:
            nombre = _entier(stats.get("ratingCount"))
    for s in _sections(raw):
        if note is None and "overallRating" in s:
            note = _nombre(s.get("overallRating"))
        if nombre is None and "overallCount" in s:
            nombre = _entier(s.get("overallCount"))
    if note is None or nombre is None:
        # Le libellé d'accessibilité de la section d'avis, « 4,92 sur 5 · 48
        # avis » : l'échelle y est écrite.
        for s in _sections(raw):
            if not _section_avis(s):
                continue
            for lbl in _libelles(s):
                m = NOTE_LIBELLE_RE.search(lbl)
                if note is None and m:
                    note = _nombre(m.group(1))
                n = NOMBRE_LIBELLE_RE.search(lbl)
                if nombre is None and n:
                    nombre = _entier(re.sub(r"\D", "", n.group(1)))
    if note is not None and not 0 < note <= ECHELLE_AIRBNB:
        note = None
    categories = _categories(raw)
    if note is None and nombre is None and not categories:
        return None
    out: dict[str, Any] = {"noteSource": note, "echelleSource": ECHELLE_AIRBNB, "nombre": nombre}
    if categories:
        out["categories"] = categories
    return out


def _categories(raw: Any) -> list[dict[str, Any]]:
    """Propreté, précision, arrivée… telles qu'Airbnb les note, sur 5."""
    out: list[dict[str, Any]] = []
    vus: set[str] = set()
    for groupe in _cles(raw, "categoryRatings"):
        if not isinstance(groupe, list):
            continue
        for c in groupe:
            if not isinstance(c, dict):
                continue
            label = _chaine(c.get("label"))
            note = _nombre(c.get("localizedRating")) or _nombre(c.get("ratingAverage"))
            if label is None or note is None or not 0 < note <= ECHELLE_AIRBNB or label.lower() in vus:
                continue
            vus.add(label.lower())
            out.append({"label": label, "noteSource": note})
            if len(out) >= 6:
                return out
    return out


def extraits_de_pdp(raw: Any) -> list[dict[str, Any]]:
    """Les avis que la section d'avis de la réponse porte déjà (`reviews`) :
    aucune requête. Vide quand elle n'en porte pas."""
    for s in _sections(raw):
        if _section_avis(s) and isinstance(s.get("reviews"), list):
            xs = extraits_avis(s["reviews"])
            if xs:
                return xs
    return []


def fiche_enrichie_de_pdp(raw: Any) -> dict[str, Any] | None:
    """La fiche enrichie, ou None quand la réponse n'en dit rien. Jamais
    d'exception : une forme inattendue ne fait que des champs vides."""
    try:
        description = description_de(raw)
        equipements = equipements_de(raw)
        conditions = conditions_de(raw)
        avis = note_de(raw)
        extraits = extraits_de_pdp(raw)
    except Exception:
        return None
    if extraits and not avis:
        avis = {"noteSource": None, "echelleSource": ECHELLE_AIRBNB, "nombre": None}
    if not (description or equipements or conditions or avis):
        return None
    return {
        "description": description,
        "equipements": equipements,
        "conditions": conditions,
        "avis": {**avis, "extraits": extraits} if avis else None,
    }


def prenom(v: Any) -> str | None:
    t = _chaine(v)
    return t.split()[0] if t else None


def _liste_avis(avis: Any) -> list[Any]:
    """La liste d'avis, nue ou dans son enveloppe : `{"reviews": [...]}`, ou la
    réponse GraphQL entière (`data.presentation.stayProductDetailPage.reviews`)."""
    if isinstance(avis, list):
        return avis
    if not isinstance(avis, dict):
        return []
    if isinstance(avis.get("reviews"), list):
        return avis["reviews"]
    for v in _cles(avis, "reviews"):
        if isinstance(v, list):
            return v
        if isinstance(v, dict) and isinstance(v.get("reviews"), list):
            return v["reviews"]
    return []


def extraits_avis(avis: Any) -> list[dict[str, Any]]:
    """Les avis d'une page StaysPdpReviewsQuery (triée MOST_RECENT) : cinq au
    plus, avec le prénom, la date, la note brute (sur 5) et le texte. Le texte
    est celui du voyageur (`comments`) ; sa traduction (`localizedReview`)
    seulement quand l'original manque."""
    out: list[dict[str, Any]] = []
    for a in _liste_avis(avis):
        if not isinstance(a, dict):
            continue
        loc = a.get("localizedReview") if isinstance(a.get("localizedReview"), dict) else {}
        texte = texte_de_html(a.get("comments"), EXTRAIT_MAX) or texte_de_html(loc.get("comments"), EXTRAIT_MAX)
        if not texte:
            continue
        reviewer = a.get("reviewer") if isinstance(a.get("reviewer"), dict) else {}
        note = _nombre(a.get("rating"))
        x: dict[str, Any] = {"texte": texte}
        p = prenom(reviewer.get("firstName")) or prenom(reviewer.get("smartName"))
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
