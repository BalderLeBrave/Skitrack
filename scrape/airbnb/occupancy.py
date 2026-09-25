"""Occupancy extraite d’une fiche STL/PDP Airbnb. Aucune requête.

personCapacity et listingLat viennent de merlin.pdpSections.metadata
(loggingContext / sharingConfig), comme stl-scraper. Les chambres n'y sont pas
chiffrées : la fiche les écrit dans le titre de partage (sonde du 25 sept.
2026 : « Appartement · Morzine · ★4,75 · 2 chambres · 3 lits · 1 salle de
bain »), lu comme un titre de tuile. Les lignes de l'aperçu (« 6 voyageurs »,
« 3 chambres », « Studio »), si une fiche en porte, comblent ce qui manque.
"""

from __future__ import annotations

import re
from typing import Any

from map import is_dropped_listing, occupancy_from_text

# Hébergements « insolites », ni maison ni appartement (consigne du
# propriétaire, 25 sept. 2026). Même liste que le filtre GreenGo de la
# complétion, sans cabane, refuge ni lodge, qui sont de vrais chalets. Lu sur
# le type de logement seulement (« Logement entier : tente »), jamais sur le
# titre de l'annonce ni sur le nom de l'hôte.
INSOLITE_RE = re.compile(
    r"(?:^|[\s\-_'’:(])(?:campings?|glamping|campement|tentes?|tipis?|yourtes?|roulottes?|bulles?|"
    r"mobil-?homes?|caravanes?|camping-?cars?|bateaux?|p[eé]niches?|igloos?|"
    r"cabanes? dans les arbres|emplacements?)(?=$|[\s\-_'’.,:)])",
    re.I,
)
# Les lignes d'aperçu sont courtes ; une phrase de description n'en est pas une.
LIGNE_MAX = 60


def _nested(root: Any, path: str) -> Any:
    cur = root
    for key in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


def _take_int(value: Any, zero_ok: bool = False) -> int | None:
    lo = 0 if zero_ok else 1
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and lo <= value <= 50:
        return value
    if isinstance(value, str) and value.isdigit():
        n = int(value)
        return n if lo <= n <= 50 else None
    return None


def _take_coord(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        n = float(value)
        if n != n:
            return None
        return n
    if isinstance(value, str):
        try:
            n = float(value.replace(",", "."))
        except ValueError:
            return None
        return n
    return None


def _plausible(lat: float | None, lon: float | None) -> bool:
    if lat is None or lon is None:
        return False
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return False
    return not (lat == 0.0 and lon == 0.0)


def apercu_pdp(raw: Any) -> tuple[list[str], str | None]:
    """Les lignes de l'aperçu (« 6 voyageurs », « 3 chambres », « Studio ») et
    son titre (« Logement entier : chalet · Hôte : … »), où qu'ils soient.

    Airbnb les range sous `detailItems` (section OVERVIEW_DEFAULT) ou
    `overviewItems` (PdpOverviewV2Section, que lit pyairbnb/standardize.py).
    La fiche sondée le 25 sept. 2026 n'en portait pas : rien n'est lu s'ils
    n'y sont pas.
    """
    lignes: list[str] = []
    titre: str | None = None

    def walk(value: Any, depth: int) -> None:
        nonlocal titre
        if depth > 14 or value is None:
            return
        if isinstance(value, list):
            for item in value:
                walk(item, depth + 1)
            return
        if not isinstance(value, dict):
            return
        for cle in ("detailItems", "overviewItems"):
            items = value.get(cle)
            if not isinstance(items, list):
                continue
            for item in items:
                t = item.get("title") if isinstance(item, dict) else None
                if isinstance(t, str) and t.strip() and len(t.strip()) <= LIGNE_MAX:
                    lignes.append(t.strip())
            t = value.get("title")
            if titre is None and isinstance(t, str) and t.strip():
                titre = t.strip()
        for item in value.values():
            walk(item, depth + 1)

    walk(raw, 0)
    return lignes, titre


def lignes_partage(share: Any) -> list[str]:
    """Les morceaux du titre de partage qui disent le logement : son type
    (« Appartement », « Studio ») et ses comptes (« 2 chambres », « 3 lits »).

    Le deuxième morceau est le lieu (« Morzine », « Les 2 Alpes ») : il est
    laissé, un chiffre de nom de lieu n'est pas un compte.
    """
    titre = share.get("title") if isinstance(share, dict) else None
    if not isinstance(titre, str) or not titre.strip():
        return []
    morceaux = [m.strip() for m in re.split(r"\s*·\s*", titre.strip()) if m.strip()]
    return [m for i, m in enumerate(morceaux) if i != 1 and len(m) <= LIGNE_MAX]


def type_de_logement(share: Any, titre_apercu: str | None) -> str | None:
    """« Chalet », « Logement entier : tente »… : le type publié, sans le nom de l'hôte."""
    prop = share.get("propertyType") if isinstance(share, dict) else None
    if isinstance(prop, str) and prop.strip():
        return prop.strip()
    if titre_apercu:
        tete = re.split(r"\s*·\s*|\s+-\s+H[oô]te\b|\s+hosted by\b", titre_apercu, maxsplit=1)[0].strip()
        return tete or None
    return None


def occupancy_from_pdp(raw: Any) -> dict[str, Any]:
    # PdpPlatformSections (`merlin`), ou StaysPdpSections (`presentation`, la
    # forme que lit pyairbnb/standardize.py) : le repli si le hash de la
    # première meurt ne demande alors que l'URL, pas un autre lecteur.
    merlin = (
        _nested(raw, "data.merlin.pdpSections")
        or _nested(raw, "data.presentation.stayProductDetailPage.sections")
        or {}
    )
    log = _nested(merlin, "metadata.loggingContext.eventDataLogging") or {}
    share = _nested(merlin, "metadata.sharingConfig") or {}
    prefetch = _nested(merlin, "metadata.bookingPrefetchData") or {}

    guests = _take_int(log.get("personCapacity")) or _take_int(share.get("personCapacity"))
    bedrooms = _take_int(log.get("bedroomCount"), zero_ok=True)
    if bedrooms is None:
        bedrooms = _take_int(share.get("bedroomCount"), zero_ok=True)
    if bedrooms is None:
        bedrooms = _take_int(share.get("bedrooms"), zero_ok=True)
    lat = _take_coord(log.get("listingLat")) or _take_coord(share.get("listingLat"))
    lon = (
        _take_coord(log.get("listingLng"))
        or _take_coord(log.get("listingLon"))
        or _take_coord(share.get("listingLng"))
    )
    if not _plausible(lat, lon):
        lat = lon = None
    # Les champs chiffrés d'abord ; le titre de partage et l'aperçu ne
    # comblent que ce qu'ils taisent.
    lignes, titre_apercu = apercu_pdp(raw)
    textes = [*lignes_partage(share), *lignes]
    t_guests, t_bedrooms, rooms = occupancy_from_text(*textes) if textes else (None, None, None)
    if guests is None:
        guests = t_guests
    if bedrooms is None:
        bedrooms = t_bedrooms
    room_type = None
    for candidate in (log.get("roomType"), share.get("roomType"), prefetch.get("roomType")):
        if isinstance(candidate, str) and candidate.strip():
            room_type = candidate.strip()
            break
    type_logement = type_de_logement(share, titre_apercu)
    hotel = bool(prefetch.get("isHotelRatePlanEnabled")) if isinstance(prefetch, dict) else False
    insolite = bool(type_logement and INSOLITE_RE.search(type_logement))
    dropped = hotel or insolite or is_dropped_listing(room_type) or is_dropped_listing(type_logement)
    return {
        "guests": guests,
        "bedrooms": bedrooms,
        "rooms": rooms,
        "lat": lat,
        "lon": lon,
        "room_type": room_type,
        "type_logement": type_logement,
        "hotel": hotel,
        "insolite": insolite,
        "dropped": dropped,
    }


def merge_occupancy(listing: dict[str, Any], occ: dict[str, Any]) -> dict[str, Any] | None:
    if occ.get("dropped"):
        return None
    out = dict(listing)
    if out.get("guests") is None and occ.get("guests"):
        out["guests"] = occ["guests"]
    if out.get("bedrooms") is None and occ.get("bedrooms") is not None:
        out["bedrooms"] = occ["bedrooms"]
    if out.get("rooms") is None and occ.get("rooms") is not None:
        out["rooms"] = occ["rooms"]
    if out.get("lat") is None and _plausible(occ.get("lat"), occ.get("lon")):
        out["lat"] = occ["lat"]
        out["lon"] = occ["lon"]
    if occ.get("room_type"):
        out["room_type"] = occ["room_type"]
    return out
