"""Non-régression sur les endpoints qui démarrent une tâche de fond.

Ces trois endpoints appellent `jobs.start()`, donc `asyncio.create_task()`, qui
exige une boucle d'événements courante. Déclarés `def` au lieu de `async def`,
FastAPI les exécute dans un threadpool sans boucle et ils renvoient un HTTP 500 —
bug constaté en lançant réellement l'application. Ces tests le verrouillent.
"""

from __future__ import annotations

import inspect

from skitrack.api.routes import geo, referential
from skitrack.db.session import session_scope
from skitrack.models import Origin


def test_job_starting_endpoints_are_coroutines():
    """Garde-fou statique : une régression se verrait à la relecture du diff."""
    for endpoint in (
        referential.start_import,
        referential.start_glacier_detection,
        geo.precompute_routes,
    ):
        assert inspect.iscoroutinefunction(endpoint), (
            f"{endpoint.__name__} doit être `async def` : il appelle jobs.start()"
        )


def test_import_endpoint_returns_a_job(client, tmp_geojson, monkeypatch):
    """Le job est bien créé et interrogeable — sans toucher au réseau."""
    from .fixtures import SKI_AREA_TIGNES

    path = tmp_geojson([SKI_AREA_TIGNES])

    async def fake_download(kind, *, force=False, progress=None):
        return path

    monkeypatch.setattr(referential, "download_dump", fake_download)

    resp = client.post(
        "/api/referential/import",
        json={"countries": ["FR"], "with_lifts": False, "detect_glaciers": False},
    )
    assert resp.status_code == 200, resp.text
    job = resp.json()
    assert job["state"] in ("pending", "running", "done")

    # Le job est consultable par son identifiant.
    follow = client.get(f"/api/jobs/{job['id']}")
    assert follow.status_code == 200
    assert follow.json()["kind"] == "referential.import"


def test_precompute_without_routing_key_is_a_clear_422(client):
    with session_scope() as session:
        session.add(Origin(label="Maison", address="Colombes", lat=48.91, lon=2.24, is_default=True))

    resp = client.post("/api/geo/routes/precompute", json={"origin_id": 1, "profile": "car"})
    # 422 et non 500 : la clé manquante est une condition attendue, pas un bug.
    assert resp.status_code == 422
    assert "openrouteservice" in resp.text.lower()


def test_unknown_job_is_404(client):
    assert client.get("/api/jobs/inexistant").status_code == 404


def test_unhandled_error_is_json_not_a_bare_500(db, monkeypatch):
    """Une erreur serveur doit rester lisible par le renderer.

    Si elle remonte jusqu'à `ServerErrorMiddleware` (hors pile CORS), le
    navigateur n'affiche qu'un « Failed to fetch » indiscernable d'une coupure
    réseau.
    """
    from fastapi.testclient import TestClient

    from skitrack.api.routes import domains
    from skitrack.app import create_app

    def boom(*_args, **_kwargs):
        raise RuntimeError("panne simulée")

    monkeypatch.setattr(domains, "known_massifs", boom)

    # `raise_server_exceptions=False` : sans ça, TestClient relaie l'exception
    # au test au lieu de nous laisser observer la réponse HTTP réelle.
    with TestClient(create_app(), raise_server_exceptions=False) as client:
        resp = client.get(
            "/api/domains/facets",
            headers={"Origin": "http://localhost:5173"},
        )
    assert resp.status_code == 500
    body = resp.json()
    assert body["code"] == "internal_error"
    assert "panne simulée" in body["message"]
    # Le point crucial : la réponse d'erreur porte bien les en-têtes CORS.
    assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"
