"""Offres datées et historique de prix."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import Date, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base, JSONType, UTCDateTime, utcnow


class Offer(Base):
    """Une offre = un logement × une période × un nombre de voyageurs × une source.

    `guests` fait partie de la clé : chez la plupart des sources le prix dépend du
    nombre d'occupants (personne supplémentaire, taxe de séjour). Une offre
    « 6 personnes » ne peut pas servir à répondre pour 4.
    """

    __tablename__ = "offer"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    accommodation_id: Mapped[int] = mapped_column(
        ForeignKey("accommodation.id", ondelete="CASCADE"), index=True
    )
    source: Mapped[str] = mapped_column(String(32), index=True)

    check_in: Mapped[dt.date] = mapped_column(Date, index=True)
    check_out: Mapped[dt.date] = mapped_column(Date, index=True)
    nights: Mapped[int] = mapped_column(Integer)
    guests: Mapped[int] = mapped_column(Integer)

    # --- Prix ----------------------------------------------------------------
    price_total: Mapped[float | None] = mapped_column(Float, index=True)
    """**Tout compris** : hébergement + ménage + taxe de séjour + charges + frais
    de service. C'est la seule valeur affichée en gros dans l'UI. Hors caution
    (remboursable, donc pas un coût)."""
    price_base: Mapped[float | None] = mapped_column(Float)
    """Prix d'appel hors frais — conservé uniquement pour afficher l'écart."""
    price_per_person: Mapped[float | None] = mapped_column(Float, index=True)
    price_per_person_per_night: Mapped[float | None] = mapped_column(Float, index=True)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    price_total_eur: Mapped[float | None] = mapped_column(Float, index=True)
    """Converti en EUR au taux du jour — indispensable pour trier un chalet suisse
    et un appartement français dans la même liste."""
    fx_rate: Mapped[float | None] = mapped_column(Float)
    fx_date: Mapped[dt.date | None] = mapped_column(Date)

    fees_breakdown: Mapped[dict | None] = mapped_column(JSONType)
    """{"cleaning": 120, "tourist_tax": 18.9, "service": 45, "utilities": 60,
        "deposit": 500, "deposit_refundable": true}"""

    cancellation_policy: Mapped[str | None] = mapped_column(String(64))
    availability_status: Mapped[str] = mapped_column(String(24), default="available", index=True)
    """available / on_request / unavailable / unknown."""

    fetched_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    expires_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, index=True)
    """`fetched_at + ttl_offer_s`. Une offre expirée reste lisible hors ligne mais
    l'UI l'affiche grisée avec sa date — plutôt que de mentir sur un prix périmé."""
    raw: Mapped[dict | None] = mapped_column(JSONType)

    price_points: Mapped[list[PricePoint]] = relationship(
        back_populates="offer", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint(
            "accommodation_id", "source", "check_in", "check_out", "guests", name="uq_offer_key"
        ),
        Index("ix_offer_period", "check_in", "check_out", "price_total_eur"),
    )


class PricePoint(Base):
    """Un relevé de prix. Alimente le graphique d'historique et les alertes."""

    __tablename__ = "price_point"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    offer_id: Mapped[int] = mapped_column(ForeignKey("offer.id", ondelete="CASCADE"), index=True)
    observed_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    price_total: Mapped[float | None] = mapped_column(Float)
    price_total_eur: Mapped[float | None] = mapped_column(Float)
    availability_status: Mapped[str | None] = mapped_column(String(24))

    offer: Mapped[Offer] = relationship(back_populates="price_points")
