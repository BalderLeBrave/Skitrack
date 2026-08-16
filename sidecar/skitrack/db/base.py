"""Base déclarative + types utilitaires."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from sqlalchemy import DateTime, Text, TypeDecorator
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class JSONType(TypeDecorator):
    """JSON stocké en TEXT.

    SQLAlchemy fournit `sqlalchemy.JSON`, mais on veut un contrôle explicite du
    dump (clés triées => diff stable, hash de cache reproductible) et un
    comportement identique pour GeoJSON volumineux.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Any) -> str | None:
        if value is None:
            return None
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

    def process_result_value(self, value: str | None, dialect: Any) -> Any:
        if value is None:
            return None
        return json.loads(value)


class UTCDateTime(TypeDecorator):
    """DateTime toujours stocké/relu en UTC *aware*.

    SQLite ne conserve pas le fuseau : sans ce décorateur on relit des datetimes
    naïfs et toute comparaison `fetched_at + ttl < now` devient fausse d'une heure
    deux fois par an.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: dt.datetime | None, dialect: Any) -> dt.datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value.astimezone(dt.timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: dt.datetime | None, dialect: Any) -> dt.datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=dt.timezone.utc)


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)
