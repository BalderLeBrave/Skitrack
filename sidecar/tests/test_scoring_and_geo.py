from __future__ import annotations

import pytest

from skitrack.services.geo_math import bbox_of, centroid_of, haversine_m, in_metropolitan_france
from skitrack.services.massif import massif_for
from skitrack.services.scoring import score_rows


def test_haversine_matches_known_distance():
    # Colombes (92) -> Val Thorens : ~500 km à vol d'oiseau
    d_km = haversine_m(48.9119, 2.2432, 45.2977, 6.5806) / 1000
    assert 480 < d_km < 520


def test_bbox_and_centroid_ignore_elevation_component():
    geometry = {
        "type": "LineString",
        "coordinates": [[6.0, 45.0, 1200.0], [6.2, 45.4, 2400.0]],
    }
    assert bbox_of(geometry) == [6.0, 45.0, 6.2, 45.4]
    lat, lon = centroid_of(geometry)
    assert lat == pytest.approx(45.2)
    assert lon == pytest.approx(6.1)


def test_metropolitan_france_bbox():
    assert in_metropolitan_france(45.30, 6.58)  # Val Thorens
    assert not in_metropolitan_france(47.05, 11.51)  # Tyrol


def test_massif_resolution_falls_back_to_country():
    assert massif_for("FR-73", "FR") == "Alpes du Nord"
    assert massif_for("FR-65", "FR") == "Pyrénées"
    assert massif_for("AT-7", "AT") == "Tyrol"
    assert massif_for("XX-99", "CH") == "Alpes suisses"
    assert massif_for(None, None) is None


def test_missing_criterion_does_not_penalise():
    """Un domaine sans temps de trajet ne doit pas être puni pour ça."""
    rows = [
        {"altitude_min": 2000, "travel_time": 300},
        {"altitude_min": 2000, "travel_time": None},
        {"altitude_min": 1000, "travel_time": 120},
    ]
    weights = {"altitude_min": 0.5, "travel_time": 0.5}
    scores = score_rows(rows, weights)

    # Lignes 0 et 1 ont la même altitude ; la 1 n'a pas de trajet, elle est donc
    # jugée sur la seule altitude et ne tombe pas derrière la 0.
    assert scores[1][0] >= scores[0][0]
    assert scores[1][1]["_weight_covered"] == 0.5
    assert scores[0][1]["_weight_covered"] == 1.0


def test_identical_values_are_neutralised():
    rows = [{"altitude_min": 1800}, {"altitude_min": 1800}]
    scores = score_rows(rows, {"altitude_min": 1.0})
    assert scores[0][0] == scores[1][0] == 0.5


def test_lower_travel_time_scores_higher():
    rows = [{"travel_time": 600}, {"travel_time": 120}]
    scores = score_rows(rows, {"travel_time": 1.0})
    assert scores[1][0] > scores[0][0]
