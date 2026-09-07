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
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class LodgingIn(BaseModel):
    """Un logement à enrichir. Le strict minimum : de quoi le situer."""

    ref: str = Field(description="Identifiant côté client, renvoyé tel quel pour recoller le résultat.")
    lat: float
    lon: float
    location_precision: str = Field(
        default="exact",
        description="'exact' ou 'approximate'. Airbnb ne publie qu'un cercle flou avant réservation ; "
        "sur 'approximate' les distances sont arrondies à la centaine plutôt que de mentir au mètre.",
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
    slope_access_type: str | None = Field(
        default=None, description="skis_aux_pieds / navette / voiture."
    )
    precision: str = "exact"


class LodgingAccessResponse(BaseModel):
    domain_id: int
    #: Nombre de tracés effectivement disponibles pour ce domaine. Zéro = le
    #: référentiel a été importé sans `--with-runs`, aucune distance calculable.
    slopes_available: int
    lifts_available: int
    results: list[LodgingAccessOut]
