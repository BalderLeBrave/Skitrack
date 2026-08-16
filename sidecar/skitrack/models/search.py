"""Recherches sauvegardées, exécutions, profils de score."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base, JSONType, UTCDateTime, utcnow


class SavedSearch(Base):
    """Critères mémorisés. Support du suivi de prix (phase 4)."""

    __tablename__ = "saved_search"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(16), default="domain")  # domain | accommodation
    criteria: Mapped[dict] = mapped_column(JSONType)
    """Payload de recherche sérialisé tel quel. Volontairement schemaless : les
    filtres évoluent à chaque phase et on ne veut pas migrer les recherches
    existantes à chaque ajout de critère."""
    origin_id: Mapped[int | None] = mapped_column(ForeignKey("origin.id", ondelete="SET NULL"))
    notify_on_price_drop: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_threshold_pct: Mapped[float | None] = mapped_column(Float)
    schedule_cron: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_run_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime)


class SearchRun(Base):
    """Trace d'exécution : quelles sources ont répondu, lesquelles ont échoué.

    Sans ça, « 12 résultats » est ininterprétable — on ne sait pas si Booking
    n'avait rien ou si le connecteur était en erreur.
    """

    __tablename__ = "search_run"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saved_search_id: Mapped[int | None] = mapped_column(
        ForeignKey("saved_search.id", ondelete="CASCADE"), index=True
    )
    started_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    finished_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime)
    criteria: Mapped[dict | None] = mapped_column(JSONType)
    results_count: Mapped[int | None] = mapped_column(Integer)
    provider_report: Mapped[dict | None] = mapped_column(JSONType)
    """{"expedia_rapid": {"status": "ok", "count": 42, "ms": 1830},
        "booking": {"status": "disabled", "reason": "no_api_key"}}"""
    error: Mapped[str | None] = mapped_column(Text)


class ScoringProfile(Base):
    """Pondérations du score de pertinence, éditables par sliders."""

    __tablename__ = "scoring_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    weights: Mapped[dict] = mapped_column(JSONType)
    """{"altitude": 0.3, "price_per_person": 0.25, "slope_proximity": 0.2,
        "travel_time": 0.15, "rating": 0.1} — somme normalisée à 1 au calcul."""
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow)
