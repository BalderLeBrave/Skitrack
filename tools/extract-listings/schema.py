"""Schema de sortie de l'extracteur, ecrit AVANT le parser.

L'ordre n'est pas cosmetique : un parser ecrit en premier finit toujours par
produire le champ qu'il sait remplir plutot que le champ dont on a besoin, et
c'est ainsi qu'un « 4 » venant d'un nombre de lits atterrit dans une colonne
« capacite ». Le schema fixe d'abord ce qu'on veut savoir ; l'extraction doit
ensuite s'y conformer ou declarer qu'elle ne peut pas.

Trois principes tiennent tout le fichier.

1. **Aucune valeur n'est inventee.** Chaque champ mesurable est `None` par
   defaut, et une absence se declare avec un `reason_code`.
2. **Chaque valeur porte sa provenance.** `capacity_source_path` et
   `gps_source_path` disent ou la valeur a ete lue. Une valeur sans chemin est
   invererifiable, donc suspecte.
3. **La precision d'un GPS fait partie du GPS.** Un point publie par une plate-
   forme qui decale volontairement ses cartes n'est pas la meme donnee qu'un
   point exact, et les confondre trompe l'utilisateur en aval.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

Platform = Literal["airbnb", "booking", "unknown"]

#: Portee de la capacite extraite.
#:
#: Booking impose cette distinction : un hotel n'a pas « une » capacite. Un
#: appartement entier en publie une (« Max. 4 personnes ») ; un hotel classique
#: n'en publie qu'au niveau de chaque type de chambre. Ecrire la seconde dans
#: le champ de la premiere donnerait « capacite 2 » pour un hotel de 80 lits.
CapacityScope = Literal["listing", "room_type", "hotel_property", "unknown"]

Confidence = Literal["high", "medium", "low"]

#: Qualification obligatoire d'un point GPS.
#:
#: `exact_public`        la fiche publie une position precise, assumee comme telle
#: `approximate_public`  position publiee mais declaree ou connue comme approchee
#: `neighborhood_circle` la carte montre un cercle de quartier, pas un point
#: `inferred_from_address` deduit d'une adresse — jamais produit par cet outil
#: `missing`             rien de lisible sur la page publique
GpsPrecision = Literal[
    "exact_public",
    "approximate_public",
    "neighborhood_circle",
    "inferred_from_address",
    "missing",
]

MapDisplayType = Literal["pin", "circle", "none", "unknown"]

ExtractionStatus = Literal["ok", "partial", "blocked", "not_found", "parse_error"]

#: Codes d'echec nommes. Un echec sans code est un echec qu'on ne saura pas
#: reproduire ; ils sont donc fermes et documentes ici plutot que rediges au fil
#: de l'eau dans les messages.
REASON_CODES = {
    "CAPACITY_NOT_IN_PUBLIC_PAGE": "La page publique n'affiche aucune capacite.",
    "GPS_CIRCLE_ONLY": "La carte ne montre qu'un cercle de quartier, pas un point.",
    "BOT_CHALLENGE": "Captcha, challenge ou coquille vide anti-robot.",
    "JSON_SCHEMA_CHANGED": "Page chargee, blobs presents, chemins connus absents.",
    "ROOM_LEVEL_ONLY": "Capacite disponible seulement par type de chambre.",
    "PAGE_NOT_FOUND": "404 ou annonce retiree.",
    "NAVIGATION_FAILED": "La page n'a pas pu etre chargee (reseau, delai).",
}


@dataclass
class RoomType:
    """Type de chambre Booking, avec sa capacite propre."""

    name: str
    occupancy_max: int | None = None
    source_path: str = ""


@dataclass
class Listing:
    """Une ligne de `out/listings.jsonl`.

    Les champs mesurables valent `None` tant qu'une source ne les a pas fournis.
    `warnings` accueille les `reason_code` et les incoherences relevees par la
    validation ; il est volontairement une liste, un echec pouvant avoir
    plusieurs causes simultanees.
    """

    input_url: str
    canonical_url: str
    platform: Platform
    listing_id: str

    title: str | None = None
    property_type: str | None = None
    location_text: str | None = None

    # --- Capacite -----------------------------------------------------------
    guest_capacity_max: int | None = None
    adults_max: int | None = None
    children_allowed: bool | None = None
    infants_allowed: bool | None = None
    pets_allowed: bool | None = None
    bedrooms: int | None = None
    beds: int | None = None
    bathrooms: float | None = None
    sleeping_arrangement_text: str | None = None
    room_types: list[RoomType] = field(default_factory=list)
    capacity_scope: CapacityScope = "unknown"
    capacity_confidence: Confidence = "low"
    capacity_source_path: str | None = None

    # --- Position -----------------------------------------------------------
    lat: float | None = None
    lng: float | None = None
    gps_precision: GpsPrecision = "missing"
    gps_precision_note: str | None = None
    gps_source_path: str | None = None
    address_public: str | None = None
    map_display_type: MapDisplayType = "unknown"

    # --- Suivi --------------------------------------------------------------
    extraction_status: ExtractionStatus = "not_found"
    http_status: int | None = None
    warnings: list[str] = field(default_factory=list)
    extracted_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")
    )

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


#: Colonnes du CSV, dans l'ordre. Les listes y sont serialisees en JSON compact :
#: un CSV reste lisible par un tableur, et `room_types` y perdrait sa structure
#: si on l'aplatissait en colonnes numerotees.
CSV_COLUMNS = [
    "input_url",
    "canonical_url",
    "platform",
    "listing_id",
    "title",
    "property_type",
    "location_text",
    "guest_capacity_max",
    "adults_max",
    "bedrooms",
    "beds",
    "bathrooms",
    "sleeping_arrangement_text",
    "room_types",
    "capacity_scope",
    "capacity_confidence",
    "capacity_source_path",
    "lat",
    "lng",
    "gps_precision",
    "gps_precision_note",
    "gps_source_path",
    "map_display_type",
    "extraction_status",
    "http_status",
    "warnings",
    "extracted_at",
]
