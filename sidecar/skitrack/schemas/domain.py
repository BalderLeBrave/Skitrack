from __future__ import annotations

import datetime as dt
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SortKey = Literal[
    "relevance",
    "altitude_min_desc",
    "altitude_max_desc",
    "slopes_km_desc",
    "travel_time_asc",
    "name_asc",
]


class DomainSearchRequest(BaseModel):
    """Filtres de l'écran 1.

    Tout est optionnel : une requête vide renvoie tous les domaines en
    exploitation, ce qui rend l'écran utilisable avant même d'avoir saisi une
    adresse de départ.
    """

    query: str | None = Field(None, description="Recherche plein texte sur le nom")
    countries: list[str] | None = Field(None, description="Codes ISO 3166-1 alpha-2")
    massifs: list[str] | None = None
    status: list[str] = Field(default_factory=lambda: ["operating"])

    altitude_min_m: int | None = Field(
        None, ge=0, le=4000, description="Bas des pistes ≥ cette valeur — critère neige décisif"
    )
    altitude_max_m: int | None = Field(None, ge=0, le=5000, description="Point culminant ≥")
    altitude_village_min_m: int | None = Field(None, ge=0, le=4000)

    slopes_km_min: float | None = Field(None, ge=0)
    lifts_count_min: int | None = Field(None, ge=0)
    glacier: bool | None = None
    snowmaking_pct_min: int | None = Field(None, ge=0, le=100)
    linked_only: bool = False

    # --- Accessibilité -------------------------------------------------------
    origin_id: int | None = Field(
        None, description="Si fourni, joint les temps de trajet et permet de filtrer dessus"
    )
    max_car_time_min: float | None = Field(None, gt=0)
    max_car_distance_km: float | None = Field(None, gt=0)
    avoid_tolls: bool = False

    sort: SortKey = "relevance"
    limit: int = Field(200, ge=1, le=1000)
    offset: int = Field(0, ge=0)

    @model_validator(mode="after")
    def _check_travel_filter(self) -> DomainSearchRequest:
        if (self.max_car_time_min or self.max_car_distance_km) and self.origin_id is None:
            raise ValueError(
                "Un filtre de temps ou de distance de trajet exige `origin_id` "
                "(le point de départ depuis lequel mesurer)."
            )
        return self


class DomainAccessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    profile: str
    duration_min: float | None = None
    distance_km: float | None = None
    crow_km: float | None = None
    provider: str | None = None
    computed_at: dt.datetime | None = None


class DomainSummaryOut(BaseModel):
    """Charge utile d'une ligne de résultat. Volontairement sans `geometry` :
    300 emprises polygonales alourdiraient la réponse de plusieurs Mo alors que
    la carte se contente des centroïdes pour le clustering."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    country: str | None = None
    region: str | None = None
    massif: str | None = None
    status: str

    altitude_min_m: int | None = None
    altitude_max_m: int | None = None
    altitude_village_m: int | None = None
    altitude_source: str

    slopes_km_total: float | None = None
    slopes_km_by_color: dict[str, float] | None = None
    slopes_count_by_color: dict[str, int] | None = None
    lifts_count: int | None = None
    glacier: bool | None = None
    snowmaking_pct: int | None = None

    linked_pass_name: str | None = None
    official_website_url: str | None = None
    official_booking_url: str | None = None

    centroid_lat: float | None = None
    centroid_lon: float | None = None
    curated: bool = False

    access: DomainAccessOut | None = None
    score: float | None = None
    score_breakdown: dict[str, float] | None = None



class SlopeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None = None
    difficulty: str | None = None
    color: str | None = None
    length_m: float | None = None
    elevation_min_m: float | None = None
    elevation_max_m: float | None = None
    geometry: dict[str, Any] | None = None


class LiftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None = None
    lift_type: str | None = None
    length_m: float | None = None
    elevation_min_m: float | None = None
    elevation_max_m: float | None = None
    base_lat: float | None = None
    base_lon: float | None = None


class DomainDetailOut(DomainSummaryOut):
    localities: list[str] | None = None
    admin_code: str | None = None
    lifts_count_by_type: dict[str, int] | None = None
    lifts_km_total: float | None = None
    north_facing_pct: int | None = None
    season_open_typical: dt.date | None = None
    season_close_typical: dt.date | None = None
    wikidata_id: str | None = None
    osm_id: str | None = None
    source: str
    source_id: str
    bbox: list[float] | None = None
    geometry: dict[str, Any] | None = None
    notes: str | None = None
    lifts: list[LiftOut] = Field(default_factory=list)
    slopes_available: bool = False
    """Faux tant que les tracés n'ont pas été importés (`--with-runs`)."""


class DomainSearchResponse(BaseModel):
    total: int
    items: list[DomainSummaryOut]
    warnings: list[str] = Field(default_factory=list)
    """Ex. « 21 domaines exclus : temps de trajet non encore calculé pour cette
    origine ». Un filtre qui masque silencieusement des résultats est pire qu'un
    filtre absent."""
