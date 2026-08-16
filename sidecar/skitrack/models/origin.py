"""Points de départ (mon domicile) et métriques d'accès domaine ↔ origine.

Séparé d'`AccessMetrics` (qui porte les distances d'un *logement*) parce que la
cardinalité n'est pas la même : `DomainAccess` est un produit cartésien
origines × domaines (~300 lignes par origine, calculé une fois), alors
qu'`AccessMetrics` suit le cycle de vie d'un logement.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base, UTCDateTime, utcnow


class Origin(Base):
    """Adresse de départ. Plusieurs possibles (domicile, bureau, chez les parents)."""

    __tablename__ = "origin"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(128))
    address: Mapped[str] = mapped_column(String(512))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    geocoder: Mapped[str | None] = mapped_column(String(32))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow)


class DomainAccess(Base):
    """Temps/distance porte-à-porte entre une origine et un domaine.

    Pré-calculé (jamais recalculé à l'affichage) et versionné par `profile` :
    « voiture avec péages » et « voiture sans péage » sont deux lignes distinctes,
    pas deux colonnes — sinon ajouter le profil train imposerait une migration.
    """

    __tablename__ = "domain_access"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    origin_id: Mapped[int] = mapped_column(ForeignKey("origin.id", ondelete="CASCADE"), index=True)
    domain_id: Mapped[int] = mapped_column(
        ForeignKey("ski_domain.id", ondelete="CASCADE"), index=True
    )
    profile: Mapped[str] = mapped_column(String(32), default="car")
    """car / car_no_toll / transit / bike."""

    duration_min: Mapped[float | None] = mapped_column(Float, index=True)
    distance_km: Mapped[float | None] = mapped_column(Float, index=True)
    crow_km: Mapped[float | None] = mapped_column(Float)
    """Distance à vol d'oiseau. Sert de pré-filtre gratuit avant d'appeler le
    routeur : inutile de calculer un itinéraire vers un domaine à 900 km quand
    on filtre à 4 h de route."""
    provider: Mapped[str | None] = mapped_column(String(32))
    """openrouteservice / osrm / google — tracé dans l'UI pour que l'écart entre
    deux sources soit lisible plutôt que suspect."""
    geometry: Mapped[str | None] = mapped_column(String)  # polyline encodée, optionnelle
    computed_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint("origin_id", "domain_id", "profile", name="uq_domain_access"),
    )
