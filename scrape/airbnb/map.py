"""Mappage hermétique StaySearchResult → clip Skitrack.

Aucune requête. On ne retient qu’un total de séjour publié (jamais une nuit,
jamais « à partir de ») ; une tuile sans total sort quand même, avec
`total: 0`, la convention « prix non publié » de `src/lib/listings.ts`.
Logement entier seulement.
"""

from __future__ import annotations

import re
from typing import Any

NIGHTLY = re.compile(r"/\s*nuit|par\s+nuit|nightly|per\s+night", re.I)
FROM_PRICE = re.compile(r"(?:à|a)\s+partir\s+de", re.I)
STAY_MARK = re.compile(r"au\s+total|pour\s+\d+\s+nuits?|total\s+(?:price|stay)", re.I)
PRIVATE = re.compile(
    r"chambre d[' ]?hotes|maison d[' ]?hotes|private[ _-]?room|chambre privee|"
    r"shared[ _-]?room|chambre partage|bed[- ]and[- ]breakfast|hotel_room|"
    r"chambre d[' ]?hotel",
    re.I,
)
HOTEL_TILE = re.compile(r"^h[oô]tels?\b", re.I)
ENTIRE = re.compile(r"appartement|chalet|maison|logement entier|entire", re.I)
GUESTS_RE = re.compile(
    r"(\d+)\s*(?:[-–/]\s*(\d+))?\s*-?\s*(?:personnes?|pers\.?|voyageurs?|guests?|pax|couchages?)\b",
    re.I,
)
# « 8p », « 10 P » : abréviation des tuiles. Une lettre derrière le p, c'est
# une pièce (« 2 pièces », « 2p cabine »), pas un voyageur. Le second
# lookahead doit nommer `cabine` : un `\s*` tout seul recule et prend le
# « 2 » de « 2p cabine » pour une capacité.
GUESTS_P_RE = re.compile(
    r"(?<!\w)(\d+)\s*[pP](?![^\W\d_])(?!\s*(?:cabine|pi[eè]ces?)\b)"
)
BEDROOMS_RE = re.compile(r"(\d+)\s*-?\s*(?:chambres?|bedrooms?)\b", re.I)
# Airbnb écrit « 6 lits » sur la tuile, à côté des chambres. C'est un compte de
# lits, pas de voyageurs : la ligne était collectée puis ignorée, seules les
# chambres et les personnes en sortaient.
BEDS_RE = re.compile(r"(\d+)\s*-?\s*(?:lits?|beds?)\b", re.I)
PIECES_RE = re.compile(r"(\d+)\s*-?\s*pi[eè]ces?\b", re.I)
STUDIO_RE = re.compile(r"\bstudio\b", re.I)
T_TYPE_RE = re.compile(r"\bT([1-9])\b", re.I)
MULTI_RE = re.compile(
    r"(?<!\d)(?:[2-9]|1[0-2])(?!\d)\s+(?:appartements?|chalets?|logements?|maisons?)\s+(?:de\s+)?(\d+)\s+(?:personnes?|pers)",
    re.I,
)
MULTI_SLUG_RE = re.compile(
    r"(\d+)-(?:appartements?|chalets?|logements?|maisons?)-de-(\d+)-(?:personnes?|pers)",
    re.I,
)
# Deux écritures possibles d'une note de tuile : « 4,92 (25) » et
# « 4,92 sur 5, 25 commentaires ». Aucune n'est prouvée par une fixture du
# dépôt — voir `rating_of`, qui rend None quand rien n'est écrit.
RATING_SUR_CINQ_RE = re.compile(r"(\d(?:[.,]\d+)?)\s*(?:sur|/|out of)\s*5\b", re.I)
RATING_TETE_RE = re.compile(r"^\s*(\d(?:[.,]\d+)?)\b")
# Un compte d'avis n'a pas de virgule : l'accepter ferait lire « 525 » dans
# « 4,92 sur 5, 25 commentaires ». Seuls les séparateurs de milliers passent.
REVIEWS_MOT_RE = re.compile(
    r"(\d+(?:[\u00a0\u202f ]\d{3})*)\s*(?:commentaires?|avis|reviews?)\b", re.I
)
REVIEWS_PAREN_RE = re.compile(r"\(\s*(\d+(?:[\u00a0\u202f ]\d{3})*)\s*\)")


def _fold(text: str) -> str:
    import unicodedata

    return "".join(
        c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn"
    )


def is_dropped_listing(text: str | None) -> bool:
    if not text or not str(text).strip():
        return False
    t = _fold(str(text))
    if PRIVATE.search(t):
        return True
    if HOTEL_TILE.search(t) and not ENTIRE.search(t):
        return True
    return False


def parse_amount(token: str) -> float | None:
    raw = token.replace("\u00a0", "").replace("\u202f", "").replace(" ", "")
    last_comma = raw.rfind(",")
    last_dot = raw.rfind(".")
    if last_comma > last_dot:
        raw = raw.replace(".", "").replace(",", ".")
    elif last_dot > last_comma:
        raw = raw.replace(",", "")
    try:
        n = float(raw)
    except ValueError:
        return None
    if n <= 0 or n > 1_000_000:
        return None
    return n


def stay_total_from_label(label: str | None) -> float | None:
    if not label:
        return None
    if FROM_PRICE.search(label):
        return None
    if NIGHTLY.search(label) and not STAY_MARK.search(label):
        return None
    stay = (
        re.search(r"(\d[\d\u00a0\u202f .,]*)\s*(?:€|&euro;)?\s*au\s+total", label, re.I)
        or re.search(r"(\d[\d\u00a0\u202f .,]*)\s*(?:€|&euro;)?\s*pour\s+\d+\s+nuits?", label, re.I)
        or re.search(r"total[^0-9]{0,16}(\d[\d\u00a0\u202f .,]*)", label, re.I)
    )
    if not stay:
        return None
    return parse_amount(stay.group(1))


_MOIS = {
    "janv": 1, "jan": 1, "janvier": 1, "fevr": 2, "fev": 2, "fevrier": 2, "mars": 3,
    "avr": 4, "avril": 4, "mai": 5, "juin": 6, "juil": 7, "juillet": 7, "aout": 8,
    "sept": 9, "sep": 9, "septembre": 9, "oct": 10, "octobre": 10, "nov": 11,
    "novembre": 11, "dec": 12, "decembre": 12,
}
_PLAGE_RE = re.compile(r"(\d{1,2})(?:\s+([a-z]+)\.?)?\s*[–—-]\s*(\d{1,2})\s+([a-z]+)\.?")
_NUITS_RE = re.compile(r"pour\s+(\d+)\s+nuits?", re.I)
_ISO_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")


def _sans_accents(s: str) -> str:
    import unicodedata

    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)).lower()


def nuits_entre(check_in: str | None, check_out: str | None) -> int | None:
    from datetime import date

    try:
        a = date.fromisoformat(str(check_in)[:10])
        b = date.fromisoformat(str(check_out)[:10])
    except (TypeError, ValueError):
        return None
    n = (b - a).days
    return n if n > 0 else None


def dates_surchargees(record: Any) -> dict[str, str]:
    """Dates de `listingParamOverrides`, en objet ou en liste `{key, value}`."""
    out: dict[str, str] = {}

    def poser(k: str, v: Any) -> None:
        if not isinstance(v, str):
            return
        cle = k.lower().replace("_", "")
        if cle == "checkin":
            out["check_in"] = v
        elif cle == "checkout":
            out["check_out"] = v

    def walk(value: Any, depth: int, dans: bool) -> None:
        if depth > 8 or value is None or not isinstance(value, (dict, list)):
            return
        if isinstance(value, list):
            for item in value:
                walk(item, depth + 1, dans)
            return
        if dans:
            if isinstance(value.get("key"), str):
                poser(value["key"], value.get("value"))
            for k, v in value.items():
                poser(k, v)
        for k, v in value.items():
            walk(v, depth + 1, dans or bool(re.search(r"paramoverrides", k, re.I)))

    walk(record, 0, False)
    return out


def plages_ecrites(lines: list[str]) -> list[tuple[tuple[int, int], tuple[int, int]]]:
    """Plages écrites sur la tuile (« 20–27 déc. ») : (jour, mois) de début et de fin."""
    out: list[tuple[tuple[int, int], tuple[int, int]]] = []
    for line in lines:
        for m in _PLAGE_RE.finditer(_sans_accents(line)):
            fin = _MOIS.get(m.group(4))
            if not fin:
                continue
            debut = _MOIS.get(m.group(2)) if m.group(2) else fin
            if not debut:
                continue
            out.append(((int(m.group(1)), debut), (int(m.group(3)), fin)))
    return out


def prix_hors_sejour(
    record: Any,
    label: str | None,
    lines: list[str],
    check_in: str | None,
    check_out: str | None,
) -> bool:
    """La tuile dit-elle que son prix porte sur d'autres dates que le séjour ?

    Airbnb complète une recherche datée avec des biens libres à d'autres dates,
    et leur tuile affiche le total de ces autres dates. Lu comme un total du
    séjour demandé, il faisait passer pour disponible un logement qui ne l'est
    pas. Sans indice lisible, le total est gardé.
    """
    if not check_in or not check_out:
        return False
    nuits = nuits_entre(check_in, check_out)
    m = _NUITS_RE.search(label or "")
    if nuits is not None and m and int(m.group(1)) != nuits:
        return True
    sur = dates_surchargees(record)
    if sur.get("check_in") and sur["check_in"][:10] != check_in[:10]:
        return True
    if sur.get("check_out") and sur["check_out"][:10] != check_out[:10]:
        return True
    a = _ISO_RE.match(check_in)
    b = _ISO_RE.match(check_out)
    if a and b:
        voulu = ((int(a.group(3)), int(a.group(2))), (int(b.group(3)), int(b.group(2))))
        for plage in plages_ecrites(lines):
            if plage != voulu:
                return True
    return False


def _walk_labels(node: Any, out: list[str]) -> None:
    if node is None or not isinstance(node, (dict, list)):
        return
    if isinstance(node, list):
        for item in node:
            _walk_labels(item, out)
        return
    label = node.get("accessibilityLabel")
    if isinstance(label, str) and "€" in label:
        out.append(label)
    for value in node.values():
        _walk_labels(value, out)


def price_label_of(node: Any) -> str | None:
    labels: list[str] = []
    _walk_labels(node, labels)
    for label in labels:
        if STAY_MARK.search(label):
            return label
    for label in labels:
        if not FROM_PRICE.search(label) and not NIGHTLY.search(label):
            return label
    return None


def published_price_label(node: Any) -> str | None:
    """Le libellé de prix affiché, même quand ce n'est pas un total de séjour.

    `price_label_of` ne rend que ce qui peut porter un total ; une tuile qui
    n'annonce qu'un prix par nuit ou un « à partir de » n'en a pas, et ses mots
    partaient avec l'annonce supprimée. Ils restent : le total vaudra 0, et le
    libellé dira de lui-même ce qu'Airbnb a écrit.
    """
    stay = price_label_of(node)
    if stay:
        return stay
    labels: list[str] = []
    _walk_labels(node, labels)
    return labels[0] if labels else None


def occupancy_from_text(*texts: str | None) -> tuple[int | None, int | None, int | None]:
    """Rend (voyageurs, chambres, pièces) tels que le texte les écrit.

    Les pièces sortent comme des pièces. « 2 pièces » n'est pas « 1 chambre » :
    c'est une conversion juste, mais que la source n'a pas écrite, et elle
    appartient à la comparaison (`src/lib/stay/occupancy.ts`), pas au relevé.
    Elle était rangée dans les chambres, d'où une vignette annonçant une
    chambre de moins que la tuile.
    """
    blob = " · ".join(t for t in texts if t and t.strip())
    if not blob:
        return None, None, None
    guests = bedrooms = rooms = None
    if not MULTI_RE.search(blob) and not MULTI_SLUG_RE.search(blob):
        pers = GUESTS_RE.search(blob)
        if pers:
            a = int(pers.group(1))
            b = int(pers.group(2)) if pers.group(2) else a
            n = max(a, b)
            if 0 < n <= 50:
                guests = n
        else:
            p = GUESTS_P_RE.search(blob)
            if p:
                n = int(p.group(1))
                if 0 < n <= 50:
                    guests = n
    ch = BEDROOMS_RE.search(blob)
    if ch:
        n = int(ch.group(1))
        if 0 <= n <= 50:
            bedrooms = n
    pi = PIECES_RE.search(blob)
    if pi:
        n = int(pi.group(1))
        if 0 < n <= 50:
            rooms = n
    if rooms is None:
        t = T_TYPE_RE.search(blob)
        if t:
            rooms = int(t.group(1))
    if STUDIO_RE.search(blob):
        # « Studio » est un mot publié qui dit deux choses à la fois : une
        # pièce, et aucune chambre séparée. Les deux sont des lectures.
        if rooms is None:
            rooms = 1
        if bedrooms is None:
            bedrooms = 0
    return guests, bedrooms, rooms


def beds_from_text(*texts: str | None) -> int | None:
    """Le nombre de lits annoncé, quand la tuile l'écrit (« 6 lits »).

    Un lit n'est pas un voyageur, et ce n'est pas non plus un couchage
    annoncé : `Listing.beds` le porte à part. La ligne était collectée par
    `structured_lines` et jetée, faute de champ pour la recevoir.
    """
    blob = " · ".join(t for t in texts if t and t.strip())
    if not blob:
        return None
    m = BEDS_RE.search(blob)
    if not m:
        return None
    n = int(m.group(1))
    return n if 0 < n <= 50 else None


def occupancy_from_stay(record: dict[str, Any]) -> tuple[int | None, int | None, int | None]:
    guests = bedrooms = rooms = None

    def take_guests(n: Any) -> int | None:
        return n if isinstance(n, int) and 0 < n <= 50 else None

    def take_beds(n: Any) -> int | None:
        return n if isinstance(n, int) and 0 <= n <= 50 else None

    def walk(value: Any, depth: int) -> None:
        nonlocal guests, bedrooms
        if depth > 8 or value is None or not isinstance(value, (dict, list)):
            return
        if isinstance(value, list):
            for item in value:
                walk(item, depth + 1)
            return
        for key, val in value.items():
            k = key.lower()
            if guests is None and k in (
                "personcapacity",
                "guestcapacity",
                "maxguestcapacity",
                "maxpersons",
                "numberofguests",
            ):
                guests = take_guests(val)
            if bedrooms is None and k in (
                "bedroomcount",
                "bedrooms",
                "bedroom",
                "numberofbedrooms",
                "bedroomscount",
            ):
                bedrooms = take_beds(val)
            walk(val, depth + 1)

    walk(record, 0)
    t_g, t_b, t_r = occupancy_from_text(
        record.get("title") if isinstance(record.get("title"), str) else None,
        record.get("subtitle") if isinstance(record.get("subtitle"), str) else None,
    )
    if guests is None:
        guests = t_g
    if bedrooms is None:
        bedrooms = t_b
    if rooms is None:
        rooms = t_r
    return guests, bedrooms, rooms


def decode_listing_id(encoded: Any) -> str:
    if isinstance(encoded, int) and encoded > 0:
        return str(encoded)
    if not isinstance(encoded, str) or not encoded:
        return ""
    if encoded.isdigit():
        return encoded
    import base64

    try:
        decoded = base64.b64decode(encoded).decode("utf-8")
    except Exception:
        return ""
    colon = decoded.rfind(":")
    tail = decoded[colon + 1 :] if colon >= 0 else decoded
    return tail if tail.isdigit() else ""


def photos_of(record: dict[str, Any]) -> list[str]:
    """Toutes les photos publiées par la tuile, dans l'ordre.

    `contextualPictures` en porte plusieurs ; on n'en gardait que la première
    et les autres tombaient. Attention : la longueur de ce tableau n'est pas le
    nombre de photos du bien — la tuile n'en montre qu'un aperçu, et ce total
    n'est publié nulle part ici. On ne le déduit donc pas.
    """
    pics = record.get("contextualPictures")
    out: list[str] = []
    if not isinstance(pics, list):
        return out
    for pic in pics:
        if not isinstance(pic, dict):
            continue
        url = pic.get("picture")
        if isinstance(url, str) and url.strip() and url.strip() not in out:
            out.append(url.strip())
    return out


def first_photo(record: dict[str, Any]) -> str | None:
    photos = photos_of(record)
    return photos[0] if photos else None


def rating_of(record: dict[str, Any]) -> tuple[float | None, int | None]:
    """Note et nombre d'avis, seulement quand la tuile les écrit.

    Lecture défensive, et assumée comme telle : aucune fixture du dépôt ne
    porte ces clés. La seule mention d'`avgRatingLocalized` vit dans
    pyairbnb/standardize.py, code tiers vendu que Skitrack n'exécute jamais —
    ce n'est pas une preuve que la clé existe sur le chemin lu ici. Toutes les
    lectures sont donc optionnelles et rendent None quand rien n'est publié :
    une note fabriquée serait pire qu'une note absente.
    """
    rating: float | None = None
    reviews: int | None = None
    brut = record.get("avgRating")
    if isinstance(brut, (int, float)) and not isinstance(brut, bool) and 0 < float(brut) <= 5:
        rating = round(float(brut), 2)
    compte = record.get("reviewsCount")
    if isinstance(compte, int) and not isinstance(compte, bool) and 0 <= compte <= 1_000_000:
        reviews = compte
    for cle in ("avgRatingLocalized", "avgRatingA11yLabel"):
        label = record.get(cle)
        if not isinstance(label, str) or not label.strip():
            continue
        if rating is None:
            m = RATING_SUR_CINQ_RE.search(label) or RATING_TETE_RE.search(label)
            if m:
                try:
                    n = float(m.group(1).replace(",", "."))
                except ValueError:
                    n = -1.0
                if 0 < n <= 5:
                    rating = round(n, 2)
        if reviews is None:
            m = REVIEWS_MOT_RE.search(label) or REVIEWS_PAREN_RE.search(label)
            if m:
                token = re.sub(r"\D", "", m.group(1))
                if token and int(token) <= 1_000_000:
                    reviews = int(token)
    return rating, reviews


def _nested_name(node: Any) -> str:
    if isinstance(node, str) and node.strip():
        return node.strip()
    if isinstance(node, dict):
        for key in ("localizedStringWithTranslationPreference", "localizedString", "full", "name"):
            val = node.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
            if isinstance(val, dict):
                found = _nested_name(val)
                if found:
                    return found
    return ""


def listing_name(record: dict[str, Any]) -> str:
    for candidate in (
        record.get("title"),
        record.get("name"),
        record.get("nameLocalized"),
        record.get("subtitle"),
    ):
        found = _nested_name(candidate)
        if found:
            return found
    demand = record.get("demandStayListing") if isinstance(record.get("demandStayListing"), dict) else {}
    desc = demand.get("description") if isinstance(demand.get("description"), dict) else {}
    return _nested_name(desc.get("name"))


def structured_lines(record: dict[str, Any]) -> list[str]:
    lines: list[str] = []

    def walk(value: Any, depth: int) -> None:
        if depth > 6 or value is None:
            return
        if isinstance(value, list):
            for item in value:
                walk(item, depth + 1)
            return
        if not isinstance(value, dict):
            return
        body = value.get("body")
        if isinstance(body, str) and body.strip():
            lines.append(body.strip())
        for item in value.values():
            walk(item, depth + 1)

    walk(record.get("structuredContent"), 0)
    return lines


def stay_to_listing(
    record: dict[str, Any],
    *,
    check_in: str | None,
    check_out: str | None,
    adults: int | None,
) -> dict[str, Any] | None:
    if record.get("__typename") != "StaySearchResult":
        return None
    demand = record.get("demandStayListing") if isinstance(record.get("demandStayListing"), dict) else {}
    listing_id = decode_listing_id(demand.get("id")) or decode_listing_id(record.get("propertyId"))
    name = listing_name(record)
    title = record.get("title") if isinstance(record.get("title"), str) else ""
    subtitle = record.get("subtitle") if isinstance(record.get("subtitle"), str) else ""
    if not listing_id or not name:
        return None
    if is_dropped_listing(name) or is_dropped_listing(title) or is_dropped_listing(subtitle):
        return None
    label = published_price_label(record.get("structuredDisplayPrice"))
    lines = structured_lines(record)
    # Un total pour d'autres dates n'est pas un prix pour ce séjour.
    hors_sejour = prix_hors_sejour(record, label, lines, check_in, check_out)
    total = None if hors_sejour else stay_total_from_label(label)
    guests, bedrooms, rooms = occupancy_from_stay(record)
    extra_g, extra_b, extra_r = occupancy_from_text(name, *lines)
    if guests is None:
        guests = extra_g
    if bedrooms is None:
        bedrooms = extra_b
    if rooms is None:
        rooms = extra_r
    # Les lignes de `structuredContent` d'abord : c'est là qu'Airbnb compte les
    # lits (« 6 lits »), le titre n'en parle qu'en passant.
    beds = beds_from_text(*lines, name, subtitle)
    rating, review_count = rating_of(record)
    photos = photos_of(record)
    loc = demand.get("location") if isinstance(demand.get("location"), dict) else {}
    coord = loc.get("coordinate") if isinstance(loc.get("coordinate"), dict) else {}
    lat = coord.get("latitude") if isinstance(coord.get("latitude"), (int, float)) else None
    lon = coord.get("longitude") if isinstance(coord.get("longitude"), (int, float)) else None
    url = f"https://www.airbnb.fr/rooms/{listing_id}"
    if check_in:
        url += f"?check_in={check_in}"
        if check_out:
            url += f"&check_out={check_out}"
        if adults:
            url += f"&adults={adults}"
    return {
        "id": listing_id,
        "name": name,
        "subtitle": subtitle or None,
        # Le libellé tel qu'Airbnb l'écrit. On le lisait pour en tirer le
        # total, puis on le remplaçait par « N € au total » : le prix barré, la
        # remise et le nombre de nuits affichés par la plateforme partaient
        # avec. Ses mots valent mieux que les nôtres.
        "priceLabel": label,
        "priceIndicative": bool(FROM_PRICE.search(label)) if label else None,
        "lat": lat,
        "lon": lon,
        "image": photos[0] if photos else None,
        "photos": photos,
        "url": url,
        "guests": guests,
        "bedrooms": bedrooms,
        "rooms": rooms,
        "beds": beds,
        "rating": rating,
        "reviewCount": review_count,
        # Airbnb liste des biens qu'il ne peut pas vendre à ces dates : sa
        # tuile sort alors sans total de séjour. On les supprimait, ce qui
        # effaçait l'information au lieu de la dire. `0` est la convention
        # « prix non publié » de `src/lib/listings.ts` — jamais « gratuit ».
        "total": int(round(total)) if total is not None else 0,
    }


def par_prix(row: dict[str, Any]) -> tuple[int, float]:
    """Clé de tri : ce qui n'a pas de prix publié passe après ce qui en a un.

    `total: 0` veut dire « prix non publié » ; un tri croissant brut rangerait
    ces annonces en tête, devant les moins chères réellement relevées.
    """
    total = row.get("total") or 0
    return (1, 0.0) if total <= 0 else (0, float(total))


def collect_stays(root: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    def walk(value: Any) -> None:
        if value is None:
            return
        if isinstance(value, list):
            for item in value:
                walk(item)
            return
        if not isinstance(value, dict):
            return
        if value.get("__typename") == "StaySearchResult":
            out.append(value)
            return
        for item in value.values():
            walk(item)

    walk(root)
    return out


def listings_from_raw(
    raw: Any,
    *,
    check_in: str | None = None,
    check_out: str | None = None,
    adults: int | None = None,
    min_guests: int | None = None,
    min_bedrooms: int | None = None,
) -> list[dict[str, Any]]:
    seen: set[str] = set()
    listings: list[dict[str, Any]] = []
    for stay in collect_stays(raw):
        row = stay_to_listing(stay, check_in=check_in, check_out=check_out, adults=adults)
        if row is None or row["id"] in seen:
            continue
        if min_guests and row.get("guests") is not None and row["guests"] < min_guests:
            continue
        if min_bedrooms and row.get("bedrooms") is not None and row["bedrooms"] < min_bedrooms:
            continue
        seen.add(row["id"])
        listings.append(row)
    listings.sort(key=par_prix)
    return listings
