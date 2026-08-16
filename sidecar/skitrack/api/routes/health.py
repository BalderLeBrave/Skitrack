from __future__ import annotations

import platform
import sys

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ... import __version__
from ...db.session import get_session
from ...models import SkiDomain

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    """Sonde du handshake Electron. Volontairement hors authentification et sans
    accès base : elle doit répondre même si SQLite est verrouillé."""
    return {
        "status": "ok",
        "service": "skitrack-sidecar",
        "version": __version__,
        "python": sys.version.split()[0],
        "platform": platform.platform(),
    }


@router.get("/status")
def status(session: Session = Depends(get_session)) -> dict:
    """État fonctionnel : y a-t-il un référentiel exploitable ?"""
    total = session.execute(select(func.count(SkiDomain.id))).scalar_one()
    with_alt = session.execute(
        select(func.count(SkiDomain.id)).where(SkiDomain.altitude_min_m.is_not(None))
    ).scalar_one()
    by_country = dict(
        session.execute(
            select(SkiDomain.country, func.count(SkiDomain.id)).group_by(SkiDomain.country)
        ).all()
    )
    return {
        "domains_total": total,
        "domains_with_altitude": with_alt,
        "domains_by_country": by_country,
        "referential_ready": total > 0,
    }
