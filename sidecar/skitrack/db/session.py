"""Moteur SQLite + session factory."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

_engine: Engine | None = None
_SessionFactory: sessionmaker[Session] | None = None


def _apply_pragmas(dbapi_connection, _record) -> None:
    """PRAGMA appliqués à chaque connexion.

    - WAL : le job de suivi de prix (phase 4) écrit pendant que l'UI lit.
    - foreign_keys : SQLite les ignore par défaut, ce qui laisserait passer des
      `linked_domain_id` orphelins.
    - busy_timeout : évite les `database is locked` sur écriture concurrente.
    """
    cur = dbapi_connection.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA busy_timeout=5000")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.close()


def init_engine(db_path: Path | str, *, echo: bool = False) -> Engine:
    global _engine, _SessionFactory
    url = "sqlite://" if str(db_path) == ":memory:" else f"sqlite:///{Path(db_path).as_posix()}"
    _engine = create_engine(url, echo=echo, future=True)
    event.listen(_engine, "connect", _apply_pragmas)
    _SessionFactory = sessionmaker(bind=_engine, expire_on_commit=False, future=True)
    return _engine


def get_engine() -> Engine:
    if _engine is None:
        raise RuntimeError("init_engine() n'a pas été appelé")
    return _engine


def get_session() -> Iterator[Session]:
    """Dépendance FastAPI."""
    if _SessionFactory is None:
        raise RuntimeError("init_engine() n'a pas été appelé")
    session = _SessionFactory()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Session transactionnelle pour les jobs hors requête HTTP (import, cron)."""
    if _SessionFactory is None:
        raise RuntimeError("init_engine() n'a pas été appelé")
    session = _SessionFactory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
