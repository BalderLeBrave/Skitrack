"""Métriques d'accès aux pistes pour un lot de logements.

Point d'entrée unique : `POST /api/lodgings/access`. Il prend des logements
(référence, GPS facultatif, adresse) et un domaine, raffine les coordonnées
(BAN / Nominatim, jamais le centroïde du domaine), puis renvoie pour chacun la
distance aux remontées, le dénivelé et l'altitude — calculés localement à partir
des tracés OpenSkiMap déjà en base.

Il ne persiste rien : c'est un enrichisseur sans état, appelé par le renderer
après un import LiteAPI ou un collage Airbnb. Voir `schemas/lodging.py` pour le
pourquoi de ce choix.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ...db.session import get_session
from ...models import DomainLift, DomainSlope, SkiDomain
from ...schemas.lodging import (
    LodgingAccessOut,
    LodgingAccessRequest,
    LodgingAccessResponse,
    LodgingIn,
    VisualGpsIn,
    VisualGpsOut,
)
from ...services.access import compute_access
from ...services.elevation import elevations
from ...services.geo_math import plausible_point
from ...services.geolocate import RefinedPoint, refine_listing_coords
from ...services.visual_gps import apply_osm_enrichment, query_osm_bbox

router = APIRouter(prefix="/lodgings", tags=["lodgings"])

#: Au-delà de ce lot, on refuse : une recherche ramène 20 à 50 logements, pas des
#: milliers. Un appel démesuré est un signe d'erreur d'usage, pas un cas à servir.
MAX_LODGINGS = 200


async def _refine_one(item: LodgingIn, domain: SkiDomain) -> RefinedPoint:
    try:
        return await refine_listing_coords(
            lat=item.lat,
            lon=item.lon,
            precision=item.location_precision,
            address=item.address,
            commune=item.commune,
            domain_lat=domain.centroid_lat,
            domain_lon=domain.centroid_lon,
        )
    except Exception:
        ok = plausible_point(item.lat, item.lon)
        prec = (item.location_precision or "unknown").lower()
        return RefinedPoint(
            float(item.lat) if ok else None,
            float(item.lon) if ok else None,
            prec if prec in {"exact", "address", "approximate"} else ("approximate" if ok else "unknown"),
            "provider" if ok else "none",
        )


@router.post("/access", response_model=LodgingAccessResponse)
async def lodgings_access(
    payload: LodgingAccessRequest, session: Session = Depends(get_session)
) -> LodgingAccessResponse:
    if not payload.lodgings:
        return LodgingAccessResponse(
            domain_id=payload.domain_id, slopes_available=0, lifts_available=0, results=[]
        )
    if len(payload.lodgings) > MAX_LODGINGS:
        raise HTTPException(
            status_code=413,
            detail=f"Trop de logements en un appel ({len(payload.lodgings)} > {MAX_LODGINGS}). "
            "Découpez la recherche.",
        )

    domain = session.get(SkiDomain, payload.domain_id)
    if domain is None:
        raise HTTPException(status_code=404, detail=f"Domaine {payload.domain_id} inconnu.")

    # Tracés du domaine, chargés une seule fois et partagés par tous les
    # logements du lot. Sans `--with-runs` à l'import, ces tables sont vides :
    # on le signale au client plutôt que de renvoyer des distances nulles qui se
    # liraient comme « au bord des pistes ».
    slopes = list(
        session.execute(
            select(DomainSlope).where(
                DomainSlope.domain_id == domain.id, DomainSlope.geometry.is_not(None)
            )
        ).scalars()
    )
    lifts = list(
        session.execute(
            select(DomainLift).where(
                DomainLift.domain_id == domain.id,
                or_(DomainLift.geometry.is_not(None), DomainLift.base_lat.is_not(None)),
            )
        ).scalars()
    )

    center = (
        (domain.centroid_lat, domain.centroid_lon)
        if domain.centroid_lat is not None and domain.centroid_lon is not None
        else None
    )

    refined: list[RefinedPoint] = []
    for item in payload.lodgings:
        refined.append(await _refine_one(item, domain))

    osm_hits = await _osm_hits_for_domain(domain, refined)
    osm_fill: list[tuple[int | None, int | None, str | None]] = []
    if osm_hits:
        from ...services.visual_gps import _place_stopwords

        extra = _place_stopwords(domain.name, getattr(domain, "region", None))
        for item, point in zip(payload.lodgings, refined):
            extra_stop = extra | _place_stopwords(item.commune)
            enrich = apply_osm_enrichment(
                name=item.name,
                lat=point.lat,
                lon=point.lon,
                precision=point.precision,
                bedrooms=item.bedrooms,
                capacity=item.capacity_max,
                hits=osm_hits,
                extra_stop=extra_stop,
            )
            if enrich.lat is not None and enrich.lon is not None:
                point.lat = enrich.lat
                point.lon = enrich.lon
                point.precision = enrich.precision or "exact"
                point.source = enrich.geocode_source or "osm"
            osm_fill.append((enrich.bedrooms, enrich.capacity_max, enrich.capacity_source))
    else:
        osm_fill = [(None, None, None)] * len(payload.lodgings)

    # Altitudes en un seul lot, **sur le point raffiné** : un (0, 0) ou un GPS
    # parisien pour Valloire ne doit pas aller à l'IGN. Le centroïde du domaine
    # n'est jamais substitué.
    altitudes: list[float | None] = [None] * len(payload.lodgings)
    altitude_sources: list[str | None] = [None] * len(payload.lodgings)
    if payload.with_elevation:
        indexed = [(i, point) for i, point in enumerate(refined) if point.lat is not None and point.lon is not None]
        if indexed:
            try:
                resolved = await elevations([(point.lat, point.lon) for _i, point in indexed])
                for (i, _point), (alt, source) in zip(indexed, resolved):
                    altitudes[i] = alt
                    altitude_sources[i] = _canonical_alt_source(source)
            except Exception:
                altitudes = [None] * len(payload.lodgings)
                altitude_sources = [None] * len(payload.lodgings)

    results: list[LodgingAccessOut] = []
    for item, point, altitude, alt_source, osm in zip(
        payload.lodgings, refined, altitudes, altitude_sources, osm_fill
    ):
        osm_bedrooms, osm_capacity, osm_cap_src = osm
        if point.lat is None or point.lon is None:
            results.append(
                LodgingAccessOut(
                    ref=item.ref,
                    lat=None,
                    lon=None,
                    location_precision="unknown",
                    geocode_source=point.source,
                    precision="unknown",
                    bedrooms=osm_bedrooms,
                    capacity_max=osm_capacity,
                    capacity_source=osm_cap_src,
                )
            )
            continue
        access = compute_access(
            lat=point.lat,
            lon=point.lon,
            altitude_m=altitude,
            slopes=slopes,
            lifts=lifts,
            center=center,
            precision=point.precision,
        )
        results.append(
            LodgingAccessOut(
                ref=item.ref,
                dist_to_nearest_slope_m=access.dist_to_nearest_slope_m,
                denivele_to_slope_m=access.denivele_to_slope_m,
                dist_to_nearest_lift_m=access.dist_to_nearest_lift_m,
                denivele_to_lift_m=access.denivele_to_lift_m,
                dist_to_slopes_m=access.dist_to_slopes_m,
                denivele_m=access.denivele_m,
                dist_to_center_m=access.dist_to_center_m,
                altitude_m=altitude,
                altitude_source=alt_source if altitude is not None else None,
                nearest_lift_id=access.nearest_lift_id,
                slope_access_type=access.slope_access_type,
                precision=access.precision,
                lat=point.lat,
                lon=point.lon,
                location_precision=point.precision,
                geocode_source=point.source,
                bedrooms=osm_bedrooms,
                capacity_max=osm_capacity,
                capacity_source=osm_cap_src,
            )
        )

    return LodgingAccessResponse(
        domain_id=domain.id,
        slopes_available=len(slopes),
        lifts_available=len(lifts),
        results=results,
    )


def _canonical_alt_source(provider: str | None) -> str | None:
    if not provider:
        return None
    key = provider.lower()
    if key == "ign" or key.startswith("ign"):
        return "ign"
    if "eudem" in key:
        return "eudem"
    if "srtm" in key or "opentopo" in key:
        return "eudem"
    return None


def _bbox_of(domain: SkiDomain, points: list[RefinedPoint]) -> tuple[float, float, float, float] | None:
    """south, west, north, east. Emprise du domaine, sinon le nuage des GPS."""
    raw = getattr(domain, "bbox", None)
    pad = 0.006
    if isinstance(raw, (list, tuple)) and len(raw) == 4:
        try:
            west, south, east, north = (float(raw[0]), float(raw[1]), float(raw[2]), float(raw[3]))
        except (TypeError, ValueError):
            west = south = east = north = None  # type: ignore[assignment]
        else:
            return south - pad, west - pad, north + pad, east + pad
    lats = [p.lat for p in points if p.lat is not None]
    lons = [p.lon for p in points if p.lon is not None]
    if not lats or not lons:
        if domain.centroid_lat is None or domain.centroid_lon is None:
            return None
        # ~1 km autour du centroïde : uniquement pour Overpass, jamais écrit comme GPS.
        return (
            domain.centroid_lat - 0.01,
            domain.centroid_lon - 0.01,
            domain.centroid_lat + 0.01,
            domain.centroid_lon + 0.01,
        )
    return min(lats) - pad, min(lons) - pad, max(lats) + pad, max(lons) + pad


async def _osm_hits_for_domain(domain: SkiDomain, points: list[RefinedPoint]):
    box = _bbox_of(domain, points)
    if box is None:
        return []
    try:
        return await query_osm_bbox(*box)
    except Exception:  # noqa: BLE001
        return []


@router.post("/pin-exact", response_model=VisualGpsOut)
async def pin_exact(payload: VisualGpsIn) -> VisualGpsOut:
    """Épingle exacte d'un cercle flou. À la demande, pas dans le lot d'accès.

    Google Lens (SerpApi) retrouve la façade sur Gîtes ou Booking ; OSM vote
    **avec** Lens (même bâtiment = 2 sources). Un hameau dense refuse un GPS
    anonyme. Jamais le centroïde du domaine. Sans clé SerpApi, Lens est sauté
    et Overpass reste disponible.
    """
    from ...services.visual_gps import resolve_exact_coords

    out = await resolve_exact_coords(payload.model_dump())
    return VisualGpsOut.model_validate(out)
