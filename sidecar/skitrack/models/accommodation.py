"""Logements et métriques d'accès. Alimenté en phase 2 (import manuel) et 3 (API).

Le modèle est posé dès la phase 1 pour deux raisons : figer le schéma évite une
migration au milieu du projet, et surtout **un logement importé à la main et un
logement issu d'une API partagent exactement la même table**. C'est la condition
pour que le comparateur, les tris et les calculs de distance soient identiques
quelle que soit la provenance (cf. cahier des charges, niveau 2).
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base, JSONType, UTCDateTime, utcnow


class Accommodation(Base):
    __tablename__ = "accommodation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    source: Mapped[str] = mapped_column(String(32), index=True)
    """expedia_rapid / booking / manual / deeplink. `manual` = saisi ou importé
    depuis les métadonnées publiques d'une URL collée par l'utilisateur."""
    source_id: Mapped[str] = mapped_column(String(128))
    deep_link: Mapped[str | None] = mapped_column(Text)
    """URL de l'annonce chez la source. Toujours renseignée : la réservation se
    fait chez eux, jamais dans l'app."""

    domain_id: Mapped[int | None] = mapped_column(
        ForeignKey("ski_domain.id", ondelete="SET NULL"), index=True
    )

    title: Mapped[str] = mapped_column(String(512))
    description_raw: Mapped[str | None] = mapped_column(Text)
    description_summary: Mapped[str | None] = mapped_column(Text)

    lat: Mapped[float | None] = mapped_column(Float, index=True)
    lon: Mapped[float | None] = mapped_column(Float, index=True)
    address: Mapped[str | None] = mapped_column(String(512))
    location_precision: Mapped[str | None] = mapped_column(String(16))
    """exact / approximate. Airbnb et consorts ne publient qu'un cercle flou tant
    que la réservation n'est pas confirmée : sans ce drapeau, un
    `dist_to_nearest_slope_m` calculé au mètre près serait une fausse précision."""

    altitude_m: Mapped[int | None] = mapped_column(Integer)
    """**Toujours** calculée par API altimétrique depuis (lat, lon), jamais reprise
    de l'annonce."""
    altitude_source: Mapped[str | None] = mapped_column(String(16))

    bedrooms: Mapped[int | None] = mapped_column(Integer, index=True)
    beds: Mapped[int | None] = mapped_column(Integer)
    capacity_max: Mapped[int | None] = mapped_column(Integer, index=True)
    bathrooms: Mapped[float | None] = mapped_column(Float)
    surface_m2: Mapped[float | None] = mapped_column(Float)
    property_type: Mapped[str | None] = mapped_column(String(32), index=True)
    """appartement / chalet / gite / hotel / studio / residence / autre."""
    amenities: Mapped[list[str] | None] = mapped_column(JSONType)
    """Vocabulaire normalisé maison (ski_room, sauna, dishwasher, parking, pets,
    wifi, fireplace…). Chaque provider mappe vers ce vocabulaire dans `normalize()`."""

    rating: Mapped[float | None] = mapped_column(Float)
    rating_scale: Mapped[float | None] = mapped_column(Float)
    """Booking note sur 10, Airbnb sur 5. Comparer sans l'échelle est un piège."""
    reviews_count: Mapped[int | None] = mapped_column(Integer)

    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    user_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    photos: Mapped[list[AccommodationPhoto]] = relationship(
        back_populates="accommodation", cascade="all, delete-orphan", lazy="selectin"
    )
    access: Mapped[AccessMetrics | None] = relationship(
        back_populates="accommodation", cascade="all, delete-orphan", uselist=False, lazy="selectin"
    )

    __table_args__ = (UniqueConstraint("source", "source_id", name="uq_accommodation_source"),)


class AccommodationPhoto(Base):
    __tablename__ = "accommodation_photo"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    accommodation_id: Mapped[int] = mapped_column(
        ForeignKey("accommodation.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(Text)
    thumbnail_path: Mapped[str | None] = mapped_column(Text)
    """Chemin local de la miniature. On ne recopie pas la photo pleine résolution :
    seules les vignettes sont mises en cache, pour la navigation hors ligne."""
    position: Mapped[int] = mapped_column(Integer, default=0)

    accommodation: Mapped[Accommodation] = relationship(back_populates="photos")


class AccessMetrics(Base):
    """Distances d'un logement — toutes pré-calculées, jamais recalculées à l'affichage."""

    __tablename__ = "access_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    accommodation_id: Mapped[int] = mapped_column(
        ForeignKey("accommodation.id", ondelete="CASCADE"), unique=True, index=True
    )

    # --- Pistes et remontées -------------------------------------------------
    dist_to_nearest_slope_m: Mapped[float | None] = mapped_column(Float, index=True)
    """À vol d'oiseau."""
    walk_dist_to_slope_m: Mapped[float | None] = mapped_column(Float)
    """Distance réelle à pied (itinéraire piéton) — souvent 1,5× le vol d'oiseau."""
    walk_time_to_slope_min: Mapped[float | None] = mapped_column(Float, index=True)
    nearest_slope_id: Mapped[int | None] = mapped_column(
        ForeignKey("domain_slope.id", ondelete="SET NULL")
    )

    dist_to_nearest_lift_m: Mapped[float | None] = mapped_column(Float, index=True)
    walk_time_to_lift_min: Mapped[float | None] = mapped_column(Float, index=True)
    nearest_lift_id: Mapped[int | None] = mapped_column(
        ForeignKey("domain_lift.id", ondelete="SET NULL")
    )

    denivele_to_slope_m: Mapped[float | None] = mapped_column(Float)
    """Dénivelé (signé) logement → point de piste le plus proche. Positif = ça
    monte au retour. 300 m à plat n'est pas 300 m avec 60 m de D+ skis à l'épaule."""
    denivele_to_lift_m: Mapped[float | None] = mapped_column(Float)

    slope_access_type: Mapped[str | None] = mapped_column(String(16), index=True)
    """skis_aux_pieds / navette / voiture — dérivé, voir services/access.py."""

    # --- Centre station ------------------------------------------------------
    dist_to_center_m: Mapped[float | None] = mapped_column(Float)
    walk_time_to_center_min: Mapped[float | None] = mapped_column(Float)

    # --- Depuis l'origine ----------------------------------------------------
    origin_id: Mapped[int | None] = mapped_column(ForeignKey("origin.id", ondelete="SET NULL"))
    car_time_from_origin_min: Mapped[float | None] = mapped_column(Float, index=True)
    car_distance_from_origin_km: Mapped[float | None] = mapped_column(Float)
    transit_time_from_origin_min: Mapped[float | None] = mapped_column(Float)

    # --- Navette ski ---------------------------------------------------------
    has_ski_bus: Mapped[bool | None] = mapped_column(Boolean)
    walk_time_to_busstop_min: Mapped[float | None] = mapped_column(Float)

    computed_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow)
    computed_with: Mapped[dict | None] = mapped_column(JSONType)
    """Providers et versions de données utilisés — pour invalider sélectivement
    après un ré-import du référentiel plutôt que tout recalculer."""

    accommodation: Mapped[Accommodation] = relationship(back_populates="access")
