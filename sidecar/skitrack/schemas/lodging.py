"""Schémas de l'API logements — métriques d'accès aux pistes.

## Pourquoi un point d'entrée par lot, sans persistance

Une annonce arrive dans SKITRACK par deux chemins que tout oppose sauf la
géométrie : LiteAPI (hôtelier, tarifé, position exacte) et le marque-page Airbnb
(location de particulier, position au champ près). Ni l'un ni l'autre ne connaît
la seule chose qui compte pour un séjour au ski : à quelle distance des pistes on
dort, et combien de dénivelé on remonte le soir.

Ces grandeurs ne se demandent pas — elles se **calculent**, à partir des tracés
OpenSkiMap déjà en base et des coordonnées de l'annonce. Ce point d'entrée fait
exactement ce calcul, **en lot** (une recherche ramène 20 à 50 logements d'un
coup) et **sans rien écrire** : le renderer garde les annonces, le sidecar ne
fait que les enrichir. C'est ce qui permet d'obtenir un résultat visible sans clé
LiteAPI, sans table à migrer, et de manière identique quelle que soit la source.

Avant le calcul, les GPS sont raffinés (`services/geolocate.py`) : un (0, 0)
n'est pas un logement, le centroïde du domaine n'est jamais posé à la place
d'une adresse, et une rue française passe par la BAN.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class LodgingIn(BaseModel):
    """Un logement à enrichir. GPS facultatif si une adresse permet de le poser."""

    ref: str = Field(description="Identifiant côté client, renvoyé tel quel pour recoller le résultat.")
    lat: float | None = Field(default=None, description="GPS publié. (0, 0) est rejeté plus bas, pas ici.")
    lon: float | None = None
    location_precision: str = Field(
        default="exact",
        description="'exact' / 'address' / 'approximate' / 'unknown'. Airbnb ne publie qu'un cercle "
        "flou avant réservation ; sur 'approximate' les distances sont arrondies à la centaine.",
    )
    address: str | None = Field(
        default=None,
        description="Adresse postale publiée. Sert à la BAN si le GPS manque ou est invraisemblable.",
    )
    commune: str | None = Field(
        default=None,
        description="Commune publiée par la source — jamais le nom du domaine inventé.",
    )
    name: str | None = Field(
        default=None,
        description="Nom de l'annonce. Sert à coller un bâtiment OSM unique, jamais à géocoder.",
    )
    bedrooms: int | None = Field(
        default=None,
        description="Chambres déjà connues. OSM ne les écrase pas.",
    )
    capacity_max: int | None = Field(
        default=None,
        description="Capacité déjà connue. OSM ne l'écrase pas.",
    )


class LodgingAccessRequest(BaseModel):
    domain_id: int
    lodgings: list[LodgingIn]
    with_elevation: bool = Field(
        default=True,
        description="Calculer le dénivelé (nécessite un appel altimétrique). Désactivable pour un "
        "aperçu instantané distance-seule.",
    )


class LodgingAccessOut(BaseModel):
    """Ce qu'on sait de l'accès d'un logement. Tout est facultatif : un domaine
    importé sans ses tracés (`--with-runs` non demandé) n'en produit aucun, et
    c'est un état normal, pas une panne."""

    ref: str

    dist_to_nearest_slope_m: float | None = None
    denivele_to_slope_m: float | None = None
    dist_to_nearest_lift_m: float | None = None
    denivele_to_lift_m: float | None = None

    # La grandeur qui répond à « les deux, afficher la plus courte » : le minimum
    # entre l'accès à une piste et l'accès à une remontée.
    dist_to_slopes_m: float | None = Field(
        default=None,
        description="La plus courte des deux distances (piste OU remontée) — ce qu'un skieur "
        "appelle réellement « distance aux pistes ».",
    )
    denivele_m: float | None = Field(
        default=None, description="Dénivelé au point d'accès le plus proche retenu ci-dessus."
    )

    dist_to_center_m: float | None = None
    altitude_m: float | None = None
    altitude_source: str | None = Field(
        default=None, description="ign / eudem / none — jamais le texte de l'annonce."
    )
    nearest_lift_id: int | None = None
    slope_access_type: str | None = Field(
        default=None, description="skis_aux_pieds / navette / voiture."
    )
    precision: str = "exact"
    lat: float | None = Field(default=None, description="GPS retenu après raffinage. Jamais le centroïde du domaine.")
    lon: float | None = None
    location_precision: str = Field(
        default="unknown",
        description="Qualité du GPS retenu : exact / address / approximate / unknown.",
    )
    geocode_source: str | None = Field(
        default=None,
        description="provider / ban / nominatim / osm / none — d'où vient le point retenu.",
    )
    bedrooms: int | None = Field(
        default=None,
        description="Chambres OSM si le provider se taisait. Jamais un 0 inventé.",
    )
    capacity_max: int | None = Field(
        default=None,
        description="Capacité OSM (beds/capacity) si le provider se taisait.",
    )
    capacity_source: str | None = Field(
        default=None,
        description="osm si les chambres ou la capacité viennent d'un nœud unique.",
    )


class LodgingAccessResponse(BaseModel):
    domain_id: int
    #: Nombre de tracés effectivement disponibles pour ce domaine. Zéro = le
    #: référentiel a été importé sans `--with-runs`, aucune distance calculable.
    slopes_available: int
    lifts_available: int
    results: list[LodgingAccessOut]


class VisualGpsIn(BaseModel):
    """Annonce au GPS flou. Lens + fiche Gîtes/Booking, jamais le centroïde."""

    listing_id: str = ""
    source_origine: str | None = None
    source: str | None = None
    lat: float | None = None
    lng: float | None = None
    lon: float | None = None
    latitude: float | None = None
    longitude: float | None = None
    photos: list[str] = Field(default_factory=list)
    images: list[str] = Field(default_factory=list)
    name: str | None = None
    title: str | None = None
    domain_lat: float | None = None
    domain_lon: float | None = None


class VisualGpsOut(BaseModel):
    listing_id: str
    source_origine: str
    lat_exacte: float | None = None
    lng_exacte: float | None = None
    confidence_score: str
    source_resolution: str
