from __future__ import annotations

from skitrack.db.session import session_scope
from skitrack.ingest.openskimap import import_ski_areas
from skitrack.models import DomainAccess, Origin

from .fixtures import SKI_AREA_AUSTRIA, SKI_AREA_TIGNES


def _seed(tmp_geojson) -> None:
    path = tmp_geojson([SKI_AREA_TIGNES, SKI_AREA_AUSTRIA])
    with session_scope() as session:
        import_ski_areas(session, path, countries=["FR", "AT"])


def test_health_needs_no_referential(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_status_reports_empty_referential(client):
    body = client.get("/api/status").json()
    assert body["domains_total"] == 0
    assert body["referential_ready"] is False


def test_search_empty_request_returns_everything(client, tmp_geojson):
    _seed(tmp_geojson)
    body = client.post("/api/domains/search", json={}).json()
    assert body["total"] == 2


def test_search_filters_on_bottom_altitude(client, tmp_geojson):
    _seed(tmp_geojson)
    body = client.post("/api/domains/search", json={"altitude_min_m": 1500}).json()
    names = [i["name"] for i in body["items"]]
    assert names == ["Tignes - Val d'Isère"]  # l'autrichien démarre à 1350 m


def test_search_travel_filter_requires_origin(client, tmp_geojson):
    _seed(tmp_geojson)
    resp = client.post("/api/domains/search", json={"max_car_time_min": 240})
    assert resp.status_code == 422
    assert "origin_id" in resp.text


def test_search_warns_about_domains_without_computed_route(client, tmp_geojson):
    _seed(tmp_geojson)
    with session_scope() as session:
        origin = Origin(label="Maison", address="Colombes", lat=48.9119, lon=2.2432, is_default=True)
        session.add(origin)
        session.flush()
        # Un seul des deux domaines a un temps calculé.
        session.add(
            DomainAccess(origin_id=origin.id, domain_id=1, profile="car", duration_min=350.0,
                         distance_km=620.0, provider="test")
        )
        origin_id = origin.id

    body = client.post(
        "/api/domains/search",
        json={"origin_id": origin_id, "max_car_time_min": 400},
    ).json()

    assert body["total"] == 1
    assert any("pas encore calculé" in w for w in body["warnings"])


def test_score_breakdown_is_returned(client, tmp_geojson):
    _seed(tmp_geojson)
    body = client.post("/api/domains/search", json={"sort": "relevance"}).json()
    top = body["items"][0]
    assert top["score"] is not None
    assert "_total" in top["score_breakdown"]
    # La somme des contributions doit correspondre au total pondéré annoncé.
    contributions = {k: v for k, v in top["score_breakdown"].items() if not k.startswith("_")}
    covered = top["score_breakdown"]["_weight_covered"]
    assert abs(sum(contributions.values()) / covered - top["score"]) < 1e-3


def test_map_endpoint_returns_geojson_points(client, tmp_geojson):
    _seed(tmp_geojson)
    body = client.get("/api/domains/map").json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 2
    assert body["features"][0]["geometry"]["type"] == "Point"


def test_facets_expose_countries_and_massifs(client, tmp_geojson):
    _seed(tmp_geojson)
    body = client.get("/api/domains/facets").json()
    codes = {c["code"] for c in body["countries"]}
    assert codes == {"FR", "AT"}
    assert any(m["name"] == "Alpes du Nord" for m in body["massifs"])
