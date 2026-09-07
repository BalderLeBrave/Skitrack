"""Écran 1 — recherche de domaines skiables."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ...db.session import get_session
from ...models import DomainAccess, SkiDomain
from ...schemas.domain import (
    DomainAccessOut,
    DomainDetailOut,
    DomainSearchRequest,
    DomainSearchResponse,
    DomainSummaryOut,
    LiftOut,
)
from ...services.massif import known_massifs
from ...services.scoring import score_rows

router = APIRouter(prefix="/domains", tags=["domains"])


@router.post("/search", response_model=DomainSearchResponse)
def search_domains(
    req: DomainSearchRequest, session: Session = Depends(get_session)
) -> DomainSearchResponse:
    warnings: list[str] = []

    stmt = select(SkiDomain)
    if req.status:
        stmt = stmt.where(SkiDomain.status.in_(req.status))
    if req.countries:
        stmt = stmt.where(SkiDomain.country.in_([c.upper() for c in req.countries]))
    if req.massifs:
        stmt = stmt.where(SkiDomain.massif.in_(req.massifs))
    if req.query:
        like = f"%{req.query.strip()}%"
        stmt = stmt.where(or_(SkiDomain.name.ilike(like), SkiDomain.slug.ilike(like)))

    if req.altitude_min_m is not None:
        stmt = stmt.where(SkiDomain.altitude_min_m >= req.altitude_min_m)
    if req.altitude_max_m is not None:
        stmt = stmt.where(SkiDomain.altitude_max_m >= req.altitude_max_m)
    if req.altitude_village_min_m is not None:
        stmt = stmt.where(SkiDomain.altitude_village_m >= req.altitude_village_min_m)
    if req.slopes_km_min is not None:
        stmt = stmt.where(SkiDomain.slopes_km_total >= req.slopes_km_min)
    if req.lifts_count_min is not None:
        stmt = stmt.where(SkiDomain.lifts_count >= req.lifts_count_min)
    if req.glacier is True:
        stmt = stmt.where(SkiDomain.glacier.is_(True))
    if req.snowmaking_pct_min is not None:
        stmt = stmt.where(SkiDomain.snowmaking_pct >= req.snowmaking_pct_min)
        warnings.append(
            "Le taux de neige de culture n'est renseigné dans OpenStreetMap que "
            "pour une petite minorité de domaines : ce filtre en écarte beaucoup "
            "faute de donnée, pas faute d'équipement."
        )
    if req.linked_only:
        stmt = stmt.where(
            or_(SkiDomain.linked_domain_id.is_not(None), SkiDomain.linked_pass_name.is_not(None))
        )

    domains = list(session.execute(stmt).scalars())

    # --- Jointure des temps de trajet ---------------------------------------
    profile = "car_no_toll" if req.avoid_tolls else "car"
    access_by_domain: dict[int, DomainAccess] = {}
    if req.origin_id is not None:
        rows = session.execute(
            select(DomainAccess).where(
                DomainAccess.origin_id == req.origin_id,
                DomainAccess.profile == profile,
            )
        ).scalars()
        access_by_domain = {row.domain_id: row for row in rows}

        if req.max_car_time_min is not None or req.max_car_distance_km is not None:
            kept, missing = [], 0
            for domain in domains:
                access = access_by_domain.get(domain.id)
                if access is None or access.duration_min is None:
                    missing += 1
                    continue
                if req.max_car_time_min is not None and access.duration_min > req.max_car_time_min:
                    continue
                if (
                    req.max_car_distance_km is not None
                    and (access.distance_km or 0) > req.max_car_distance_km
                ):
                    continue
                kept.append(domain)
            if missing:
                warnings.append(
                    f"{missing} domaine(s) exclu(s) : temps de trajet pas encore calculé "
                    f"pour cette origine. Lancez le pré-calcul depuis Réglages → Trajets."
                )
            domains = kept

    # --- Score ---------------------------------------------------------------
    scoring_rows = [
        {
            "altitude_min": d.altitude_min_m,
            "altitude_max": d.altitude_max_m,
            "slopes_km": d.slopes_km_total,
            "travel_time": (access_by_domain.get(d.id).duration_min if access_by_domain.get(d.id) else None),
        }
        for d in domains
    ]
    scores = score_rows(scoring_rows)

    items: list[DomainSummaryOut] = []
    for domain, (score, breakdown) in zip(domains, scores, strict=True):
        summary = DomainSummaryOut.model_validate(domain)
        access = access_by_domain.get(domain.id)
        if access is not None:
            summary.access = DomainAccessOut.model_validate(access)
        summary.score = score
        summary.score_breakdown = breakdown
        items.append(summary)

    sort_key = {
        "relevance": lambda i: -(i.score or 0),
        "altitude_min_desc": lambda i: -(i.altitude_min_m or -1),
        "altitude_max_desc": lambda i: -(i.altitude_max_m or -1),
        "slopes_km_desc": lambda i: -(i.slopes_km_total or -1),
        "travel_time_asc": lambda i: (i.access.duration_min if i.access and i.access.duration_min is not None else 1e9),
        "name_asc": lambda i: i.name.lower(),
    }[req.sort]
    items.sort(key=sort_key)

    total = len(items)
    return DomainSearchResponse(
        total=total,
        items=items[req.offset : req.offset + req.limit],
        warnings=warnings,
    )


@router.get("/facets")
def facets(session: Session = Depends(get_session)) -> dict:
    """Valeurs disponibles pour alimenter les filtres — évite de proposer un
    massif ou un pays qui ne renverrait aucun résultat."""
    countries = [
        {"code": code, "count": count}
        for code, count in session.execute(
            select(SkiDomain.country, func.count(SkiDomain.id))
            .where(SkiDomain.country.is_not(None))
            .group_by(SkiDomain.country)
            .order_by(func.count(SkiDomain.id).desc())
        ).all()
    ]
    massifs = [
        {"name": name, "count": count}
        for name, count in session.execute(
            select(SkiDomain.massif, func.count(SkiDomain.id))
            .where(SkiDomain.massif.is_not(None))
            .group_by(SkiDomain.massif)
            .order_by(func.count(SkiDomain.id).desc())
        ).all()
    ]
    bounds = session.execute(
        select(
            func.min(SkiDomain.altitude_min_m),
            func.max(SkiDomain.altitude_min_m),
            func.max(SkiDomain.altitude_max_m),
            func.max(SkiDomain.slopes_km_total),
        )
    ).one()
    return {
        "countries": countries,
        "massifs": massifs,
        "known_massifs": known_massifs(),
        "altitude_min_bounds": [bounds[0] or 0, bounds[1] or 3000],
        "altitude_max_max": bounds[2] or 4000,
        "slopes_km_max": bounds[3] or 600,
    }


@router.get("/map")
def map_points(
    session: Session = Depends(get_session),
    status: str = Query("operating"),
) -> dict:
    """Points pour la carte, en GeoJSON minimal.

    Endpoint séparé de la recherche : la carte a besoin de *tous* les domaines
    pour le clustering, la liste n'a besoin que de la page courante. Les
    mélanger obligerait à renvoyer 300 fiches complètes à chaque frappe.
    """
    rows = session.execute(
        select(
            SkiDomain.id,
            SkiDomain.name,
            SkiDomain.slug,
            SkiDomain.centroid_lat,
            SkiDomain.centroid_lon,
            SkiDomain.altitude_min_m,
            SkiDomain.altitude_max_m,
            SkiDomain.slopes_km_total,
            SkiDomain.country,
            SkiDomain.massif,
        ).where(SkiDomain.status == status, SkiDomain.centroid_lat.is_not(None))
    ).all()
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": r.id,
                "geometry": {"type": "Point", "coordinates": [r.centroid_lon, r.centroid_lat]},
                "properties": {
                    "id": r.id,
                    "name": r.name,
                    "slug": r.slug,
                    "altitude_min_m": r.altitude_min_m,
                    "altitude_max_m": r.altitude_max_m,
                    "slopes_km_total": r.slopes_km_total,
                    "country": r.country,
                    "massif": r.massif,
                },
            }
            for r in rows
        ],
    }


@router.get("/{domain_id}", response_model=DomainDetailOut)
def get_domain(
    domain_id: int,
    origin_id: int | None = None,
    avoid_tolls: bool = False,
    session: Session = Depends(get_session),
) -> DomainDetailOut:
    domain = session.get(SkiDomain, domain_id)
    if domain is None:
        raise HTTPException(status_code=404, detail="Domaine introuvable")

    detail = DomainDetailOut.model_validate(domain)
    detail.lifts = [LiftOut.model_validate(lift) for lift in domain.lifts]
    detail.slopes_available = bool(domain.slopes)

    if origin_id is not None:
        access = session.execute(
            select(DomainAccess).where(
                DomainAccess.origin_id == origin_id,
                DomainAccess.domain_id == domain_id,
                DomainAccess.profile == ("car_no_toll" if avoid_tolls else "car"),
            )
        ).scalar_one_or_none()
        if access is not None:
            detail.access = DomainAccessOut.model_validate(access)
    return detail
