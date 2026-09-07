from __future__ import annotations

import pytest
from sqlalchemy import select

from skitrack.db.session import session_scope
from skitrack.ingest.openskimap import import_lifts, import_runs, import_ski_areas, map_ski_area, slugify
from skitrack.models import DomainLift, DomainSlope, SkiDomain

from .fixtures import (
    LIFT_ORPHAN,
    LIFT_TIGNES,
    RUN_NORDIC,
    RUN_TIGNES,
    SKI_AREA_ABANDONED,
    SKI_AREA_AUSTRIA,
    SKI_AREA_NORDIC_ONLY,
    SKI_AREA_TIGNES,
)


def test_slugify_strips_accents_and_apostrophes():
    assert slugify("Tignes - Val d'Isère") == "tignes-val-d-isere"
    assert slugify("Alpe d'Huez Grand Domaine") == "alpe-d-huez-grand-domaine"


def test_map_ski_area_extracts_altitudes_and_places():
    row = map_ski_area(SKI_AREA_TIGNES)

    assert row is not None
    # Le bas des pistes vient de statistics.runs.minElevation, pas d'un centroïde.
    assert row["altitude_min_m"] == 1559
    assert row["altitude_max_m"] == 3456
    assert row["country"] == "FR"
    assert row["region"] == "Savoie"
    assert row["admin_code"] == "FR-73"
    assert row["massif"] == "Alpes du Nord"
    assert row["localities"] == ["Tignes", "Val d'Isère"]
    assert row["osm_id"] == "way/45421423"
    assert row["wikidata_id"] == "Q991331"


def test_map_ski_area_aggregates_colors_from_european_convention():
    row = map_ski_area(SKI_AREA_TIGNES)

    # novice -> vert, easy -> bleu, intermediate -> rouge, advanced+expert -> noir
    assert row["slopes_count_by_color"] == {"vert": 58, "bleu": 173, "rouge": 91, "noir": 23}
    assert row["slopes_km_by_color"]["noir"] == pytest.approx(22.27)
    # Seules les pistes alpines comptent : les 1,97 km nordiques sont exclus.
    assert row["slopes_km_total"] == pytest.approx(207.65, abs=0.06)


def test_snowmaking_absent_stays_none_not_zero():
    """0 km d'enneigement dans OSM veut dire « non cartographié », pas « aucun »."""
    row = map_ski_area(SKI_AREA_AUSTRIA)
    assert row["snowmaking_pct"] is None
    assert row["snowmaking_source"] is None

    row_with_data = map_ski_area(SKI_AREA_TIGNES)
    assert row_with_data["snowmaking_pct"] == 5  # 10,0 km sur 207,6
    assert row_with_data["snowmaking_source"] == "openskimap"


def test_import_filters_by_activity_status_and_country(db, tmp_geojson):
    path = tmp_geojson(
        [SKI_AREA_TIGNES, SKI_AREA_NORDIC_ONLY, SKI_AREA_ABANDONED, SKI_AREA_AUSTRIA]
    )

    with session_scope() as session:
        result = import_ski_areas(session, path, countries=["FR"])

    assert result["created"] == 1  # nordique, abandonné et autrichien écartés
    with session_scope() as session:
        names = [d.name for d in session.execute(select(SkiDomain)).scalars()]
    assert names == ["Tignes - Val d'Isère"]


def test_import_is_idempotent(db, tmp_geojson):
    path = tmp_geojson([SKI_AREA_TIGNES])

    with session_scope() as session:
        first = import_ski_areas(session, path, countries=["FR"])
    with session_scope() as session:
        second = import_ski_areas(session, path, countries=["FR"])

    assert first["created"] == 1 and first["updated"] == 0
    assert second["created"] == 0 and second["updated"] == 1
    with session_scope() as session:
        assert len(session.execute(select(SkiDomain)).scalars().all()) == 1


def test_import_does_not_overwrite_curated_altitude(db, tmp_geojson):
    path = tmp_geojson([SKI_AREA_TIGNES])
    with session_scope() as session:
        import_ski_areas(session, path, countries=["FR"])
    with session_scope() as session:
        domain = session.execute(select(SkiDomain)).scalar_one()
        domain.altitude_min_m = 900
        domain.curated = True

    with session_scope() as session:
        import_ski_areas(session, path, countries=["FR"])

    with session_scope() as session:
        assert session.execute(select(SkiDomain)).scalar_one().altitude_min_m == 900


def test_import_lifts_links_and_derives_village_altitude(db, tmp_geojson):
    areas = tmp_geojson([SKI_AREA_TIGNES])
    lifts = tmp_geojson([LIFT_TIGNES, LIFT_ORPHAN])

    with session_scope() as session:
        import_ski_areas(session, areas, countries=["FR"])
    with session_scope() as session:
        result = import_lifts(session, lifts, countries=["FR"])

    assert result["imported"] == 1  # la remontée orpheline/abandonnée est ignorée
    with session_scope() as session:
        lift = session.execute(select(DomainLift)).scalar_one()
        domain = session.execute(select(SkiDomain)).scalar_one()

    # La gare aval est l'extrémité la plus basse, lue dans la 3ᵉ composante.
    assert lift.base_lat == 45.4680
    assert lift.elevation_min_m == 1559.0
    assert domain.altitude_village_m == 1559
    assert domain.altitude_village_source == "derived:lift_base"


def test_import_runs_keeps_downhill_and_skips_nordic(db, tmp_geojson):
    areas = tmp_geojson([SKI_AREA_TIGNES])
    runs = tmp_geojson([RUN_TIGNES, RUN_NORDIC])

    with session_scope() as session:
        import_ski_areas(session, areas, countries=["FR"])
    with session_scope() as session:
        result = import_runs(session, runs, countries=["FR"])

    assert result["imported"] == 1
    with session_scope() as session:
        slope = session.execute(select(DomainSlope)).scalar_one()
    assert slope.name == "Piste du Palet"
    assert slope.difficulty == "intermediate"
    assert slope.snowmaking is True
    assert slope.geometry is not None
    assert slope.elevation_min_m == 1850.0
