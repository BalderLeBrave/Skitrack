"""Métriques d'accès aux pistes pour un lot de logements.

Point d'entrée unique : `POST /api/lodgings/access`. Il prend des logements
(référence + coordonnées) et un domaine, et renvoie pour chacun la distance aux
pistes, le dénivelé, l'altitude et le type d'accès — calculés localement à partir
des tracés OpenSkiMap déjà en base.

Il ne persiste rien : c'est un enrichisseur sans état, appelé par le renderer
après un import LiteAPI ou un collage Airbnb. Voir `schemas/lodging.py` pour le
pourquoi de ce choix.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...db.session import get_session
from ...models import DomainLift, DomainSlope, SkiDomain
from ...schemas.lodging import (
    LodgingAccessOut,
    LodgingAccessRequest,
    LodgingAccessResponse,
)
from ...services.access import compute_access
from ...services.elevation import elevations

router = APIRouter(prefix="/lodgings", tags=["lodgings"])

#: Au-delà de ce lot, on refuse : une recherche ramène 20 à 50 logements, pas des
#: milliers. Un appel démesuré est un signe d'erreur d'usage, pas un cas à servir.
MAX_LODGINGS = 200


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
                DomainLift.domain_id == domain.id, DomainLift.geometry.is_not(None)
            )
        ).scalars()
    )

    center = (
        (domain.centroid_lat, domain.centroid_lon)
        if domain.centroid_lat is not None and domain.centroid_lon is not None
        else None
    )

    # Altitudes en un seul lot pour tout le monde : un aller-retour altimétrique
    # par logement multiplierait la latence par le nombre d'annonces. Le dénivelé
    # n'a de sens qu'avec l'altitude du logement — sans elle, la distance reste
    # bonne et le dénivelé vaut None (information partielle, jamais fausse).
    altitudes: list[float | None] = [None] * len(payload.lodgings)
    if payload.with_elevation:
        points = [(item.lat, item.lon) for item in payload.lodgings]
        try:
            resolved = await elevations(points)
            altitudes = [alt for alt, _source in resolved]
        except Exception:
            # L'altimétrie est un plus, pas un bloquant : son indisponibilité ne
            # doit pas priver l'utilisateur des distances, qui, elles, sont
            # calculées hors ligne.
            altitudes = [None] * len(payload.lodgings)

    results: list[LodgingAccessOut] = []
    for item, altitude in zip(payload.lodgings, altitudes):
        access = compute_access(
            lat=item.lat,
            lon=item.lon,
            altitude_m=altitude,
            slopes=slopes,
            lifts=lifts,
            center=center,
            precision=item.location_precision,
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
                slope_access_type=access.slope_access_type,
                precision=access.precision,
            )
        )

    return LodgingAccessResponse(
        domain_id=domain.id,
        slopes_available=len(slopes),
        lifts_available=len(lifts),
        results=results,
    )
