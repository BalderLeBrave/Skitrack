from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class GeocodeResult(BaseModel):
    label: str
    lat: float
    lon: float
    score: float | None = None
    city: str | None = None
    postcode: str | None = None
    provider: str


class OriginIn(BaseModel):
    label: str = Field(..., min_length=1, max_length=128)
    address: str = Field(..., min_length=3, max_length=512)
    lat: float | None = None
    lon: float | None = None
    """Si absent, l'adresse est géocodée côté sidecar (BAN en France, Nominatim ailleurs)."""
    is_default: bool = True


class OriginOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    address: str
    lat: float
    lon: float
    geocoder: str | None = None
    is_default: bool


class ElevationRequest(BaseModel):
    points: list[tuple[float, float]] = Field(
        ..., min_length=1, max_length=2000, description="Liste de (lat, lon)"
    )
    prefer: Literal["auto", "ign", "opentopodata"] = "auto"
    """`auto` route vers l'IGN (RGE ALTI, précision métrique) si le point tombe en
    France métropolitaine, vers OpenTopoData sinon."""


class ElevationPoint(BaseModel):
    lat: float
    lon: float
    elevation_m: float | None
    provider: str | None = None


class ElevationResponse(BaseModel):
    points: list[ElevationPoint]
    cached: int = 0
    fetched: int = 0


class IsochroneRequest(BaseModel):
    origin_id: int
    ranges_min: list[int] = Field(default_factory=lambda: [120, 240, 300], max_length=5)
    profile: Literal["car", "car_no_toll"] = "car"


class IsochroneResponse(BaseModel):
    geojson: dict[str, Any]
    provider: str
    cached: bool = False


class RoutePrecomputeRequest(BaseModel):
    origin_id: int
    profile: Literal["car", "car_no_toll"] = "car"
    max_crow_km: float = Field(
        900,
        gt=0,
        description=(
            "Pré-filtre à vol d'oiseau. Au-delà, aucun appel au routeur : "
            "le quota gratuit d'OpenRouteService ne survit pas à 300 itinéraires "
            "vers des domaines évidemment hors de portée."
        ),
    )
    domain_ids: list[int] | None = None
