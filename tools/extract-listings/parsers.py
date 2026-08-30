"""Extraction de la capacite et de la position, par plate-forme.

Tous les chemins de ce fichier ont ete **releves le 2026-08-30** sur des fiches
reelles, par `discover.py`, et non recopies d'une documentation. Chacun est
cite dans `REPORT.md` avec la fiche qui l'a fourni.

Deux regles gouvernent le module.

**Une valeur sans chemin n'existe pas.** Chaque extraction rend le chemin JSON
qui l'a produite. C'est ce qui rend un resultat auditable : on peut rouvrir le
dump et verifier. Un champ rempli sans `source_path` serait une affirmation.

**On prefere la liste connue, puis la recherche.** Les chemins releves sont
essayes en premier ; s'ils ont tous disparu, une recherche recursive cherche
les memes cles ailleurs et le resultat est marque `JSON_SCHEMA_CHANGED`. Le
schema de ces pages bouge — l'outil doit le dire plutot que rendre `None` en
laissant croire que la donnee n'existe plus.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterator

from schema import Confidence, GpsPrecision, RoomType

# ---------------------------------------------------------------------------
# Parcours generique
# ---------------------------------------------------------------------------


def parcourir(noeud: Any, chemin: str = "$") -> Iterator[tuple[str, str, Any]]:
    """Rend (chemin, cle, valeur) pour chaque cle d'un objet JSON."""
    if isinstance(noeud, dict):
        for k, v in noeud.items():
            sous = f"{chemin}.{k}"
            yield sous, k, v
            yield from parcourir(v, sous)
    elif isinstance(noeud, list):
        for i, v in enumerate(noeud):
            yield from parcourir(v, f"{chemin}[{i}]")


def suivre(racine: Any, chemin: list[str | int]) -> Any:
    """Suit un chemin connu, sans lever si un maillon manque."""
    n = racine
    for pas in chemin:
        try:
            n = n[pas]  # type: ignore[index]
        except Exception:
            return None
    return n


def _norm(cle: str) -> str:
    return re.sub(r"[^a-z0-9]", "", cle.lower())


def entier(v: Any) -> int | None:
    """Un entier strictement positif, ou rien.

    Les zeros sont refuses : sur les deux plates-formes, un `0` signale un champ
    non renseigne, jamais un logement pour zero personne.
    """
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v if v > 0 else None
    if isinstance(v, float):
        return int(v) if v > 0 and float(v).is_integer() else None
    if isinstance(v, str):
        m = re.search(r"\d+", v.replace(" ", "").replace(" ", ""))
        if m:
            n = int(m.group())
            return n if n > 0 else None
    return None


def nombre_localise(v: Any) -> float | None:
    """« 4,5 salles de bain » -> 4.5. Virgule decimale francaise comprise."""
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    if isinstance(v, str):
        m = re.search(r"\d+(?:[.,]\d+)?", v)
        if m:
            return float(m.group().replace(",", "."))
    return None


# ---------------------------------------------------------------------------
# Resultats
# ---------------------------------------------------------------------------


@dataclass
class ResultatCapacite:
    guest_capacity_max: int | None = None
    bedrooms: int | None = None
    beds: int | None = None
    bathrooms: float | None = None
    sleeping_arrangement_text: str | None = None
    room_types: list[RoomType] = field(default_factory=list)
    scope: str = "unknown"
    confidence: Confidence = "low"
    source_path: str | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass
class ResultatGps:
    lat: float | None = None
    lng: float | None = None
    precision: GpsPrecision = "missing"
    note: str | None = None
    source_path: str | None = None
    map_display_type: str = "unknown"
    warnings: list[str] = field(default_factory=list)


def _plausible(lat: Any, lng: Any) -> bool:
    """Un couple de coordonnees utilisable.

    `(0, 0)` est refuse : le point est au large du golfe de Guinee et n'a
    jamais designe un logement. Il apparait reellement dans les donnees — le
    magasin Apollo de Booking porte des `SkiLift` a `(0, 0)`.
    """
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return False
    if isinstance(lat, bool) or isinstance(lng, bool):
        return False
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return False
    return not (lat == 0 and lng == 0)


def _decimales(x: float) -> int:
    s = repr(float(x))
    return len(s.split(".")[1]) if "." in s else 0


# ---------------------------------------------------------------------------
# Airbnb
# ---------------------------------------------------------------------------

#: Chemins releves le 2026-08-30 dans la reponse `/api/v3/StaysPdpSections`
#: de la fiche 40088811. Les quatre s'accordaient sur la meme valeur.
AIRBNB_CAPACITE = [
    ["data", "presentation", "stayProductDetailPage", "sections", "metadata", "sharingConfig", "personCapacity"],
    ["data", "node", "pdpPresentation", "personCapacity"],
    ["data", "node", "personCapacity"],
    ["data", "presentation", "stayProductDetailPage", "sections", "metadata", "loggingContext", "eventDataLogging", "personCapacity"],
]

AIRBNB_POSITION = [
    (["data", "node", "location", "coordinate", "latitude"], ["data", "node", "location", "coordinate", "longitude"]),
    (["data", "presentation", "stayProductDetailPage", "sections", "metadata", "loggingContext", "eventDataLogging", "listingLat"],
     ["data", "presentation", "stayProductDetailPage", "sections", "metadata", "loggingContext", "eventDataLogging", "listingLng"]),
]

#: Au-dela de ce nombre de decimales, la position est publiee « telle quelle ».
#: En deca, elle est arrondie — 45.456 designe un carre d'une centaine de
#: metres, et l'annoncer comme exacte serait faux.
DECIMALES_EXACTES = 5


def capacite_airbnb(sources: list[tuple[str, Any]]) -> ResultatCapacite:
    r = ResultatCapacite()

    for etiquette, racine in sources:
        for chemin in AIRBNB_CAPACITE:
            v = entier(suivre(racine, chemin))
            if v is not None:
                r.guest_capacity_max = v
                r.scope = "listing"
                r.confidence = "high"
                r.source_path = f"[{etiquette}]$." + ".".join(str(p) for p in chemin)
                break
        if r.guest_capacity_max is not None:
            break

    if r.guest_capacity_max is None:
        # Repli : la cle a peut-etre change de place, pas de nom.
        for etiquette, racine in sources:
            for chemin, cle, valeur in parcourir(racine):
                if _norm(cle) in ("personcapacity", "guestcapacity", "maxguestcapacity"):
                    v = entier(valeur)
                    if v is not None:
                        r.guest_capacity_max = v
                        r.scope = "listing"
                        r.confidence = "medium"
                        r.source_path = f"[{etiquette}]{chemin}"
                        r.warnings.append("JSON_SCHEMA_CHANGED")
                        break
            if r.guest_capacity_max is not None:
                break

    # Chambres, lits, salles de bain : lus dans les sous-titres structures
    # quand ils y sont. Jamais deduits de la capacite.
    for etiquette, racine in sources:
        for chemin, cle, valeur in parcourir(racine):
            if not isinstance(valeur, str) or len(valeur) > 60:
                continue
            bas = valeur.lower()
            if r.bedrooms is None and re.search(r"\d+\s*chambre", bas):
                r.bedrooms = entier(valeur)
            elif r.beds is None and re.search(r"\d+\s*lit", bas):
                r.beds = entier(valeur)
            elif r.bathrooms is None and re.search(r"\d+([.,]\d+)?\s*salle", bas):
                r.bathrooms = nombre_localise(valeur)

    if r.guest_capacity_max is None:
        r.warnings.append("CAPACITY_NOT_IN_PUBLIC_PAGE")
    return r


def gps_airbnb(sources: list[tuple[str, Any]]) -> ResultatGps:
    r = ResultatGps()

    for etiquette, racine in sources:
        for c_lat, c_lng in AIRBNB_POSITION:
            lat, lng = suivre(racine, c_lat), suivre(racine, c_lng)
            if _plausible(lat, lng):
                r.lat, r.lng = float(lat), float(lng)
                r.source_path = f"[{etiquette}]$." + ".".join(str(p) for p in c_lat) + " / …longitude"
                break
        if r.lat is not None:
            break

    if r.lat is None:
        for etiquette, racine in sources:
            for chemin, cle, valeur in parcourir(racine):
                if _norm(cle) != "coordinate" or not isinstance(valeur, dict):
                    continue
                lat, lng = valeur.get("latitude"), valeur.get("longitude")
                if _plausible(lat, lng):
                    r.lat, r.lng = float(lat), float(lng)
                    r.source_path = f"[{etiquette}]{chemin}"
                    r.warnings.append("JSON_SCHEMA_CHANGED")
                    break
            if r.lat is not None:
                break

    if r.lat is None:
        r.precision = "missing"
        r.note = "Aucune coordonnee dans la charge utile publique."
        return r

    # Qualification. Airbnb ne publie pas d'adresse exacte avant reservation et
    # arrondit ses coordonnees : mesure du 2026-08-30, 45.456 / 6.9001, soit
    # trois a quatre decimales — une centaine de metres. On ne peut donc jamais
    # annoncer `exact_public` sans une declaration explicite de la page, qu'on
    # n'a pas trouvee.
    d = max(_decimales(r.lat), _decimales(r.lng))
    r.precision = "approximate_public"
    r.map_display_type = "circle"
    # Le nombre de decimales mesure l'**arrondi de publication**, pas l'erreur
    # de position. Les confondre ferait annoncer « environ 10 m » pour un point
    # qu'Airbnb decale deliberement de plus de cent metres avant reservation :
    # une precision affichee superieure a la precision reelle est pire qu'aucune
    # precision affichee. Les deux sont donc dites separement.
    r.note = (
        f"Coordonnees publiees avec {d} decimale(s). Airbnb ne publie pas la "
        "position exacte avant reservation : le point sert de centre a une zone "
        "et peut s'ecarter du logement d'une centaine de metres. Le nombre de "
        "decimales ne borne pas cet ecart."
    )
    r.warnings.append("GPS_CIRCLE_ONLY")
    return r


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------


def _apollo(blobs: list[dict[str, Any]]) -> dict[str, Any] | None:
    for b in blobs:
        if b.get("id") == "apollo" and isinstance(b.get("data"), dict):
            return b["data"]
    return None


def capacite_booking(blobs: list[dict[str, Any]]) -> ResultatCapacite:
    """Capacite Booking, avec la distinction logement entier / type de chambre.

    Mesure du 2026-08-30, deux fiches de la meme station :

    * `type-relax-challeet-val-frejus` (maison entiere) — **un seul**
      `RTRoomCard`, `occupancy.maxPersons = 10`, plus six `RDSApartmentRoom`
      portant 1, 2, 2, 2, 2, 1, dont la somme fait 10.
    * `le-valfrejus` (hotel) — **six** `RTRoomCard` a 2, 2, 3, 4, 5 et 6, et
      aucun `RDSApartmentRoom`.

    D'ou la regle : un seul type d'unite, c'est la capacite du logement ;
    plusieurs, ce sont des chambres d'hotel et le logement n'a pas de capacite
    propre. Additionner les secondes donnerait « 22 personnes » pour un hotel,
    un chiffre que Booking n'affiche nulle part.
    """
    r = ResultatCapacite()
    store = _apollo(blobs)
    if store is None:
        r.warnings.append("JSON_SCHEMA_CHANGED")
        return r

    cartes: list[tuple[str, str, int]] = []  # (cle store, nom, capacite)
    chambres_appart: list[int] = []

    for cle, valeur in store.items():
        if not isinstance(valeur, dict):
            continue
        if cle.startswith("RTRoomCard"):
            v = entier(suivre(valeur, ["occupancy", "maxPersons"])) or entier(
                suivre(valeur, ["occupancy", "maxGuests"])
            )
            if v is not None:
                nom = ""
                for k in ("name", "roomName", "title"):
                    if isinstance(valeur.get(k), str):
                        nom = valeur[k]
                        break
                cartes.append((cle, nom, v))
        elif cle.startswith("RDSApartmentRoom"):
            v = entier(valeur.get("maxPersons"))
            if v is not None:
                chambres_appart.append(v)

    if not cartes:
        r.warnings.append("CAPACITY_NOT_IN_PUBLIC_PAGE")
        return r

    if len(cartes) == 1:
        cle, nom, v = cartes[0]
        r.guest_capacity_max = v
        r.scope = "listing"
        r.confidence = "high"
        r.source_path = f"[apollo].{cle}.occupancy.maxPersons"
        if chambres_appart:
            r.bedrooms = len(chambres_appart)
            r.sleeping_arrangement_text = " + ".join(
                f"{n} pers." for n in chambres_appart
            )
            somme = sum(chambres_appart)
            if somme != v:
                # Ecart signale, jamais corrige : la valeur publiee par Booking
                # fait foi, la somme des pieces n'est qu'un controle.
                r.warnings.append(
                    f"INCOHERENCE_CAPACITE: maxPersons={v} mais somme des pieces={somme}"
                )
    else:
        r.scope = "room_type"
        r.confidence = "high"
        r.source_path = f"[apollo].RTRoomCard[*].occupancy.maxPersons ({len(cartes)} types)"
        r.room_types = [
            RoomType(name=nom or cle, occupancy_max=v, source_path=f"[apollo].{cle}.occupancy.maxPersons")
            for cle, nom, v in cartes
        ]
        r.warnings.append("ROOM_LEVEL_ONLY")

    return r


def gps_booking(blobs: list[dict[str, Any]], html: str) -> ResultatGps:
    """Position Booking, prise sur l'etablissement et non sur un voisin.

    Le magasin Apollo contient d'autres points que celui du bien — la fiche
    `le-valfrejus` porte un `SkiLift:42395` a `(0, 0)`. On ne prend donc que
    `BasicPropertyData:<id>.location`, et `_plausible` ecarte `(0, 0)`.
    """
    r = ResultatGps()
    store = _apollo(blobs)

    if store:
        for cle, valeur in store.items():
            if not cle.startswith("BasicPropertyData") or not isinstance(valeur, dict):
                continue
            loc = valeur.get("location")
            if isinstance(loc, dict) and _plausible(loc.get("latitude"), loc.get("longitude")):
                r.lat, r.lng = float(loc["latitude"]), float(loc["longitude"])
                r.source_path = f"[apollo].{cle}.location.latitude / .longitude"
                break

    if r.lat is None:
        m = re.search(r'data-atlas-latlng="(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)"', html)
        if m and _plausible(float(m.group(1)), float(m.group(2))):
            r.lat, r.lng = float(m.group(1)), float(m.group(2))
            r.source_path = "html[data-atlas-latlng]"

    if r.lat is None:
        for b in blobs:
            data = b.get("data")
            if not isinstance(data, dict) or data.get("@type") is None:
                continue
            geo = data.get("geo")
            if isinstance(geo, dict) and _plausible(geo.get("latitude"), geo.get("longitude")):
                r.lat, r.lng = float(geo["latitude"]), float(geo["longitude"])
                r.source_path = "ld+json $.geo.latitude / .longitude"
                break

    if r.lat is None:
        r.precision = "missing"
        r.note = "Aucune coordonnee publiee sur la fiche."
        return r

    # Booking publie l'adresse de l'etablissement et une epingle : le point est
    # assume comme exact, faute d'indice contraire sur la page.
    r.precision = "exact_public"
    r.map_display_type = "pin"
    r.note = (
        f"Position publiee par la fiche, {max(_decimales(r.lat), _decimales(r.lng))} "
        "decimales. Booking affiche une epingle et l'adresse de l'etablissement."
    )
    return r
