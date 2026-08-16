"""Préférences, cache HTTP persistant, état des providers."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base, JSONType, UTCDateTime, utcnow


class AppSetting(Base):
    """Préférences utilisateur (langue, devise, provider de routage, TTL…).

    **Aucune clé d'API ici.** Les secrets sont chiffrés par Electron (safeStorage
    → DPAPI) et transmis en mémoire au sidecar ; ils ne touchent jamais SQLite.
    """

    __tablename__ = "app_setting"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict | list | str | int | float | bool | None] = mapped_column(JSONType)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class HttpCacheEntry(Base):
    """Cache HTTP applicatif, clé = hash(méthode, url, corps).

    On ne s'appuie pas sur les en-têtes de cache des serveurs : IGN et
    OpenTopoData ne renvoient pas de `Cache-Control` exploitable, et on veut un
    TTL choisi par nous et différent par famille d'appel (altitude ≈ éternel,
    offre ≈ 6 h).
    """

    __tablename__ = "http_cache"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    namespace: Mapped[str] = mapped_column(String(32), index=True)
    """elevation / route / geocode / weather / offer — permet de purger par famille."""
    url: Mapped[str] = mapped_column(Text)
    status_code: Mapped[int | None] = mapped_column(Integer)
    body: Mapped[bytes | None] = mapped_column(LargeBinary)
    fetched_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow)
    expires_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, index=True)


class ProviderState(Base):
    """État runtime d'un connecteur : configuré ? en quota ? dernière erreur ?

    C'est ce que lit l'UI pour afficher « source non configurée » sans casser la
    recherche (exigence explicite du cahier des charges).
    """

    __tablename__ = "provider_state"

    name: Mapped[str] = mapped_column(String(32), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))  # lodging | routing | elevation | weather
    enabled: Mapped[bool] = mapped_column(default=True)
    configured: Mapped[bool] = mapped_column(default=False)
    last_ok_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime)
    last_error_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime)
    last_error: Mapped[str | None] = mapped_column(Text)
    quota_info: Mapped[dict | None] = mapped_column(JSONType)
