from __future__ import annotations

import datetime as dt

from fastapi.testclient import TestClient

from skitrack.config import Settings, set_settings
from skitrack.db.base import utcnow
from skitrack.db.bootstrap import initialize
from skitrack.db.session import init_engine, session_scope
from skitrack.services.http import cache_get, cache_key, cache_put, purge_cache


def test_token_is_required_when_configured(tmp_path):
    settings = Settings(data_dir=tmp_path, token="secret-de-session")
    settings.ensure_dirs()
    set_settings(settings)
    init_engine(settings.db_path)
    with session_scope() as session:
        initialize(session)

    from skitrack.app import create_app

    with TestClient(create_app()) as client:
        # /api/health reste joignable : c'est la sonde du handshake.
        assert client.get("/api/health").status_code == 200
        assert client.get("/api/status").status_code == 401
        assert client.get("/api/status", headers={"X-Skitrack-Token": "mauvais"}).status_code == 401
        ok = client.get("/api/status", headers={"X-Skitrack-Token": "secret-de-session"})
        assert ok.status_code == 200


def test_cors_allows_the_renderer_origins(client):
    """Le renderer est cross-origin par rapport au sidecar.

    En développement il vit sur `http://localhost:5173`, une fois empaqueté sur
    `file://` (origine `null`). Sans CORS, l'en-tête X-Skitrack-Token déclenche
    une requête préliminaire OPTIONS que le navigateur rejette — et toute l'UI
    échoue sur « TypeError: Failed to fetch ».
    """
    for origin in ("http://localhost:5173", "null", "http://127.0.0.1:5173"):
        preflight = client.options(
            "/api/status",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "x-skitrack-token",
            },
        )
        assert preflight.status_code == 200, origin
        assert preflight.headers["access-control-allow-origin"] == origin
        assert "x-skitrack-token" in preflight.headers["access-control-allow-headers"].lower()

    actual = client.get("/api/status", headers={"Origin": "http://localhost:5173"})
    assert actual.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_rejects_a_foreign_origin(client):
    preflight = client.options(
        "/api/status",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in preflight.headers


def test_cache_expires_and_purges_by_namespace(db):
    key_a = cache_key("GET", "https://example.test/a")
    key_b = cache_key("GET", "https://example.test/b")

    cache_put(key_a, "elevation", "https://example.test/a", 200, b'{"z":1}', ttl_s=3600)
    cache_put(key_b, "route", "https://example.test/b", 200, b'{"d":2}', ttl_s=3600)

    assert cache_get(key_a) == b'{"z":1}'
    assert purge_cache("route") == 1
    assert cache_get(key_b) is None
    assert cache_get(key_a) == b'{"z":1}'


def test_expired_entry_is_not_served(db):
    from skitrack.models import HttpCacheEntry

    key = cache_key("GET", "https://example.test/stale")
    with session_scope() as session:
        session.add(
            HttpCacheEntry(
                key=key,
                namespace="offer",
                url="https://example.test/stale",
                status_code=200,
                body=b"{}",
                fetched_at=utcnow() - dt.timedelta(hours=12),
                expires_at=utcnow() - dt.timedelta(hours=6),
            )
        )
    assert cache_get(key) is None


def test_cache_key_is_stable_regardless_of_dict_order():
    a = cache_key("POST", "https://example.test/x", {"b": 2, "a": 1})
    b = cache_key("POST", "https://example.test/x", {"a": 1, "b": 2})
    assert a == b
