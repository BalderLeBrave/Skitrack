"""Création du schéma + seed initial.

Pas d'Alembic en phase 1 : `create_all` suffit tant que le schéma n'a pas été
livré à un utilisateur. `SCHEMA_VERSION` est stocké en base ; dès qu'un premier
build est distribué, on bascule sur Alembic et cette valeur devient le point de
départ des migrations (voir docs/ARCHITECTURE.md § « Migrations »).
"""

from __future__ import annotations

import logging

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from .. import models  # noqa: F401  (peuple Base.metadata)
from ..models import AppSetting, ScoringProfile
from .base import Base
from .session import get_engine

log = logging.getLogger(__name__)

SCHEMA_VERSION = 1

DEFAULT_SETTINGS: dict[str, object] = {
    "schema_version": SCHEMA_VERSION,
    "language": "fr",
    "currency": "EUR",
    "units": "metric",
    "routing_provider": "openrouteservice",
    "elevation_provider_fr": "ign",
    "elevation_provider_world": "opentopodata",
    "ttl_offer_s": 6 * 3600,
    "map_style": "opentopomap",
    "avoid_tolls": False,
}

DEFAULT_SCORING_WEIGHTS = {
    "altitude": 0.30,
    "price_per_person": 0.25,
    "slope_proximity": 0.20,
    "travel_time": 0.15,
    "rating": 0.10,
}


def create_schema() -> None:
    Base.metadata.create_all(get_engine())


def seed(session: Session) -> None:
    existing = {row[0] for row in session.execute(select(AppSetting.key))}
    for key, value in DEFAULT_SETTINGS.items():
        if key not in existing:
            session.add(AppSetting(key=key, value=value))

    has_profile = session.execute(select(ScoringProfile.id).limit(1)).first()
    if not has_profile:
        session.add(
            ScoringProfile(name="Équilibré", weights=dict(DEFAULT_SCORING_WEIGHTS), is_default=True)
        )
    session.commit()


def check_version(session: Session) -> None:
    row = session.get(AppSetting, "schema_version")
    if row is None:
        return
    if row.value != SCHEMA_VERSION:
        log.warning(
            "Version de schéma en base (%s) != version du code (%s). "
            "Aucune migration n'est appliquée automatiquement en phase 1.",
            row.value,
            SCHEMA_VERSION,
        )


def initialize(session: Session) -> None:
    create_schema()
    seed(session)
    check_version(session)
    tables = inspect(get_engine()).get_table_names()
    log.info("Base prête — %d tables : %s", len(tables), ", ".join(sorted(tables)))
