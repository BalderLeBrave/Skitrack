from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from skitrack.config import Settings, set_settings
from skitrack.db.bootstrap import initialize
from skitrack.db.session import init_engine, session_scope


@pytest.fixture()
def data_dir(tmp_path: Path) -> Path:
    return tmp_path


@pytest.fixture()
def db(data_dir: Path):
    """Base SQLite jetable, sur fichier (et non `:memory:`) : le code utilise
    plusieurs sessions, et une base mémoire ne serait pas partagée entre elles."""
    settings = Settings(data_dir=data_dir, token="")
    settings.ensure_dirs()
    set_settings(settings)
    init_engine(settings.db_path)
    with session_scope() as session:
        initialize(session)
    yield settings


@pytest.fixture()
def client(db):
    from skitrack.app import create_app

    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture()
def tmp_geojson():
    """Écrit une FeatureCollection dans un fichier temporaire et renvoie son chemin."""
    import json

    created: list[Path] = []

    def _write(features: list[dict]) -> Path:
        fh = tempfile.NamedTemporaryFile("w", suffix=".geojson", delete=False, encoding="utf-8")
        json.dump({"type": "FeatureCollection", "features": features}, fh)
        fh.close()
        path = Path(fh.name)
        created.append(path)
        return path

    yield _write
    for path in created:
        path.unlink(missing_ok=True)
