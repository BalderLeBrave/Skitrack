from __future__ import annotations

import datetime as dt

import yaml
from sqlalchemy import select

from skitrack.db.session import session_scope
from skitrack.ingest.curated import apply_curated
from skitrack.ingest.openskimap import import_ski_areas
from skitrack.models import SkiDomain
from skitrack.providers.deeplinks import DeepLinkRequest, build_links

from .fixtures import SKI_AREA_TIGNES


def test_curated_overrides_and_flags_domain(db, tmp_geojson, tmp_path):
    path = tmp_geojson([SKI_AREA_TIGNES])
    with session_scope() as session:
        import_ski_areas(session, path, countries=["FR"])

    curated_dir = tmp_path / "curated"
    curated_dir.mkdir()
    (curated_dir / "domains_test.yaml").write_text(
        yaml.safe_dump(
            {
                "version": 1,
                "domains": [
                    {
                        "match": {"slug": "tignes-val-d-isere"},
                        "glacier": True,
                        "altitude_village_m": 1550,
                        "snowmaking_pct": 45,
                        "season_open_typical": "2026-11-28",
                        "champ_inexistant": 1,
                    }
                ],
            },
            allow_unicode=True,
        ),
        encoding="utf-8",
    )

    with session_scope() as session:
        result = apply_curated(session, directory=curated_dir)

    assert result["applied"] == 1
    # Une clé inconnue est signalée, pas avalée en silence.
    assert any("champ_inexistant" in w for w in result["warnings"])

    with session_scope() as session:
        domain = session.execute(select(SkiDomain)).scalar_one()
    assert domain.glacier is True
    assert domain.altitude_village_m == 1550
    assert domain.altitude_village_source == "curated"
    assert domain.snowmaking_pct == 45
    assert domain.snowmaking_source == "curated"
    assert domain.season_open_typical == dt.date(2026, 11, 28)
    assert domain.curated is True


def test_curated_reports_unmatched_entries(db, tmp_path):
    curated_dir = tmp_path / "curated"
    curated_dir.mkdir()
    (curated_dir / "domains_test.yaml").write_text(
        yaml.safe_dump({"domains": [{"match": {"slug": "station-inconnue"}, "glacier": True}]}),
        encoding="utf-8",
    )
    with session_scope() as session:
        result = apply_curated(session, directory=curated_dir)
    assert result["applied"] == 0
    assert len(result["unmatched"]) == 1


def test_deeplinks_fill_dates_and_encode_query():
    links = build_links(
        DeepLinkRequest(
            query="Val d'Isère",
            check_in=dt.date(2027, 2, 6),
            check_out=dt.date(2027, 2, 13),
            adults=6,
            bedrooms=3,
        )
    )
    by_name = {link.name: link for link in links}

    assert "checkin=2027-02-06" in by_name["airbnb"].url
    assert "adults=6" in by_name["airbnb"].url
    assert "Val%20d%27Is%C3%A8re" in by_name["airbnb"].url
    # Gîtes de France attend un format de date différent — le YAML le porte.
    assert "arrivee=06/02/2027" in by_name["gites_de_france"].url


def test_deeplinks_without_dates_leave_placeholders_empty():
    links = build_links(DeepLinkRequest(query="Tignes"))
    airbnb = next(link for link in links if link.name == "airbnb")
    assert "checkin=&" in airbnb.url
    assert "{check_in}" not in airbnb.url
