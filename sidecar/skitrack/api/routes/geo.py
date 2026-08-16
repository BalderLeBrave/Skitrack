"""Origines, géocodage, altimétrie, itinéraires et isochrones."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...db.session import get_session, session_scope
from ...models import DomainAccess, Origin, SkiDomain
from ...schemas.common import JobStatus
from ...schemas.geo import (
    ElevationPoint,
    ElevationRequest,
    ElevationResponse,
    GeocodeResult,
    IsochroneRequest,
    IsochroneResponse,
    OriginIn,
    OriginOut,
    RoutePrecomputeRequest,
)
from ...services import jobs
from ...services.elevation import elevations
from ...services.geo_math import haversine_m
from ...services.geocoding import geocode
from ...services.http import ProviderUnavailable
from ...services.routing import get_routing_provider
from ...services.settings_store import get_setting

router = APIRouter(prefix="/geo", tags=["geo"])


# --------------------------------------------------------------------------- #
# Origines
# --------------------------------------------------------------------------- #


@router.get("/origins", response_model=list[OriginOut])
def list_origins(session: Session = Depends(get_session)) -> list[Origin]:
    return list(session.execute(select(Origin).order_by(Origin.id)).scalars())


@router.post("/origins", response_model=OriginOut)
async def create_origin(payload: OriginIn, session: Session = Depends(get_session)) -> Origin:
    lat, lon, geocoder = payload.lat, payload.lon, None
    if lat is None or lon is None:
        results = await geocode(payload.address, limit=1)
        if not results:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Adresse introuvable. Vérifiez l'orthographe ou saisissez "
                    "directement les coordonnées."
                ),
            )
        lat, lon, geocoder = results[0].lat, results[0].lon, results[0].provider

    if payload.is_default:
        for other in session.execute(select(Origin).where(Origin.is_default.is_(True))).scalars():
            other.is_default = False

    origin = Origin(
        label=payload.label,
        address=payload.address,
        lat=lat,
        lon=lon,
        geocoder=geocoder,
        is_default=payload.is_default,
    )
    session.add(origin)
    session.commit()
    session.refresh(origin)
    return origin


@router.delete("/origins/{origin_id}")
def delete_origin(origin_id: int, session: Session = Depends(get_session)) -> dict:
    origin = session.get(Origin, origin_id)
    if origin is None:
        raise HTTPException(status_code=404, detail="Origine introuvable")
    session.delete(origin)
    session.commit()
    return {"deleted": origin_id}


@router.get("/geocode", response_model=list[GeocodeResult])
async def geocode_endpoint(q: str, limit: int = 5) -> list[GeocodeResult]:
    return await geocode(q, limit=limit)


# --------------------------------------------------------------------------- #
# Altimétrie
# --------------------------------------------------------------------------- #


@router.post("/elevation", response_model=ElevationResponse)
async def elevation_endpoint(req: ElevationRequest) -> ElevationResponse:
    values = await elevations(req.points, prefer=req.prefer)
    return ElevationResponse(
        points=[
            ElevationPoint(lat=lat, lon=lon, elevation_m=value, provider=provider)
            for (lat, lon), (value, provider) in zip(req.points, values, strict=True)
        ]
    )


# --------------------------------------------------------------------------- #
# Itinéraires
# --------------------------------------------------------------------------- #


@router.post("/routes/precompute", response_model=JobStatus)
async def precompute_routes(
    req: RoutePrecomputeRequest, session: Session = Depends(get_session)
) -> JobStatus:
    """Pré-calcule les temps de trajet origine → domaines, en tâche de fond.

    Deux garde-fous contre l'explosion de quota :

    1. Pré-filtre à vol d'oiseau (`max_crow_km`) — gratuit, il élimine d'emblée
       les domaines hors de portée.
    2. Réutilisation : un couple (origine, domaine, profil) déjà calculé n'est
       pas recalculé.
    """
    origin = session.get(Origin, req.origin_id)
    if origin is None:
        raise HTTPException(status_code=404, detail="Origine introuvable")

    provider_name = get_setting("routing_provider", "openrouteservice")
    osrm_base = get_setting("osrm_base_url", None)
    provider = get_routing_provider(provider_name, osrm_base_url=osrm_base)
    if not provider.is_configured():
        raise HTTPException(
            status_code=422,
            detail=(
                f"Le fournisseur d'itinéraires « {provider_name} » n'est pas configuré. "
                "Renseignez sa clé dans Réglages → Clés d'API, ou basculez sur OSRM."
            ),
        )

    origin_pt = (origin.lat, origin.lon)
    origin_id = origin.id
    avoid_tolls = req.profile == "car_no_toll"

    async def body(handle: jobs.JobHandle) -> dict:
        with session_scope() as scoped:
            stmt = select(SkiDomain).where(SkiDomain.centroid_lat.is_not(None))
            if req.domain_ids:
                stmt = stmt.where(SkiDomain.id.in_(req.domain_ids))
            domains = list(scoped.execute(stmt).scalars())

            already = {
                row.domain_id
                for row in scoped.execute(
                    select(DomainAccess).where(
                        DomainAccess.origin_id == origin_id,
                        DomainAccess.profile == req.profile,
                    )
                ).scalars()
            }

            targets: list[tuple[SkiDomain, float]] = []
            skipped_far = 0
            for domain in domains:
                crow_km = haversine_m(*origin_pt, domain.centroid_lat, domain.centroid_lon) / 1000.0
                if crow_km > req.max_crow_km:
                    skipped_far += 1
                    continue
                if domain.id in already:
                    continue
                targets.append((domain, crow_km))

            if not targets:
                return {"computed": 0, "skipped_far": skipped_far, "already_known": len(already)}

            batch_size = provider.capabilities.max_matrix_destinations
            computed = 0
            for start in range(0, len(targets), batch_size):
                if handle.cancelled():
                    break
                chunk = targets[start : start + batch_size]
                handle.progress(
                    start / len(targets),
                    f"Itinéraires {start + 1}–{min(start + batch_size, len(targets))} / {len(targets)}",
                )
                try:
                    metrics = await provider.matrix(
                        origin_pt, [(d.centroid_lat, d.centroid_lon) for d, _ in chunk],
                        avoid_tolls=avoid_tolls,
                    )
                except ProviderUnavailable as exc:
                    # On garde ce qui a été calculé : un quota épuisé à mi-parcours
                    # ne doit pas annuler les 200 trajets déjà obtenus.
                    return {
                        "computed": computed,
                        "skipped_far": skipped_far,
                        "stopped_early": True,
                        "reason": str(exc),
                    }

                for (domain, crow_km), metric in zip(chunk, metrics, strict=True):
                    scoped.merge(
                        DomainAccess(
                            origin_id=origin_id,
                            domain_id=domain.id,
                            profile=req.profile,
                            duration_min=metric.duration_min,
                            distance_km=metric.distance_km,
                            crow_km=round(crow_km, 1),
                            provider=metric.provider,
                        )
                    )
                    computed += 1
                scoped.commit()

            note = None
            if avoid_tolls and not provider.capabilities.avoid_tolls_matrix:
                note = (
                    f"{provider.name} ne sait pas éviter les péages sur un calcul en "
                    "masse : ces temps incluent les péages. Ouvrez la fiche d'un "
                    "domaine pour obtenir son trajet sans péage exact."
                )
            return {
                "computed": computed,
                "skipped_far": skipped_far,
                "already_known": len(already),
                "note": note,
            }

    return jobs.start("routes.precompute", body)


@router.post("/routes/{domain_id}")
async def route_to_domain(
    domain_id: int,
    origin_id: int,
    avoid_tolls: bool = False,
    session: Session = Depends(get_session),
) -> dict:
    """Trajet exact vers un domaine — c'est ici que l'évitement des péages est
    réellement appliqué (voir services/routing.py)."""
    origin = session.get(Origin, origin_id)
    domain = session.get(SkiDomain, domain_id)
    if origin is None or domain is None:
        raise HTTPException(status_code=404, detail="Origine ou domaine introuvable")
    if domain.centroid_lat is None:
        raise HTTPException(status_code=422, detail="Domaine sans coordonnées")

    provider = get_routing_provider(
        get_setting("routing_provider", "openrouteservice"),
        osrm_base_url=get_setting("osrm_base_url", None),
    )
    try:
        metric = await provider.route(
            (origin.lat, origin.lon),
            (domain.centroid_lat, domain.centroid_lon),
            avoid_tolls=avoid_tolls,
        )
    except ProviderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    profile = "car_no_toll" if avoid_tolls else "car"
    session.merge(
        DomainAccess(
            origin_id=origin_id,
            domain_id=domain_id,
            profile=profile,
            duration_min=metric.duration_min,
            distance_km=metric.distance_km,
            crow_km=round(
                haversine_m(origin.lat, origin.lon, domain.centroid_lat, domain.centroid_lon) / 1000, 1
            ),
            provider=metric.provider,
        )
    )
    session.commit()
    return {
        "duration_min": metric.duration_min,
        "distance_km": metric.distance_km,
        "provider": metric.provider,
        "profile": profile,
        "avoid_tolls_applied": avoid_tolls and provider.capabilities.avoid_tolls_route,
    }


@router.post("/isochrones", response_model=IsochroneResponse)
async def isochrones(req: IsochroneRequest, session: Session = Depends(get_session)) -> IsochroneResponse:
    origin = session.get(Origin, req.origin_id)
    if origin is None:
        raise HTTPException(status_code=404, detail="Origine introuvable")

    provider = get_routing_provider(
        get_setting("routing_provider", "openrouteservice"),
        osrm_base_url=get_setting("osrm_base_url", None),
    )
    if not provider.capabilities.isochrones:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{provider.name} ne calcule pas d'isochrones. Basculez sur "
                "OpenRouteService dans Réglages → Trajets."
            ),
        )
    try:
        geojson = await provider.isochrone(
            (origin.lat, origin.lon), req.ranges_min, avoid_tolls=req.profile == "car_no_toll"
        )
    except ProviderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return IsochroneResponse(geojson=geojson, provider=provider.name)
