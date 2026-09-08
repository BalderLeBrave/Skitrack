from __future__ import annotations

from skitrack.ingest.slopes import (
    alpine_classic_total,
    difficulty_ui,
    overlay_curated_slopes,
    quality_of,
)
from skitrack.models import SkiDomain


def test_osm_mapping_france():
    assert difficulty_ui("novice") == "green"
    assert difficulty_ui("easy") == "blue"
    assert difficulty_ui("intermediate") == "red"
    assert difficulty_ui("advanced") == "black"
    assert difficulty_ui("expert") == "expert"
    assert difficulty_ui("extreme") == "expert"
    assert difficulty_ui(None) == "unknown"
    assert difficulty_ui("vert") == "green"


def test_quality_empty_and_partial():
    assert quality_of({}) == "empty"
    assert quality_of({"unknown": 10, "green": 1}) == "partial"
    assert quality_of({"green": 8, "blue": 21, "red": 14, "black": 6}) == "complete"


def test_classic_total_excludes_expert():
    assert alpine_classic_total({"green": 8, "blue": 21, "red": 14, "black": 6, "expert": 4}) == 49


def test_curated_overlay_keeps_osm_total(db):
    domain = SkiDomain(
        source="openskimap",
        source_id="x",
        name="La Féclaz",
        slug="la-feclaz",
        slopes_count_by_color={"green": 7, "blue": 19, "red": 16, "black": 5},
        slopes_report={"quality": "complete", "source": "openskimap", "osm_total": 47, "count_total": 47},
    )
    overlay_curated_slopes(
        domain,
        {
            "source": "brochure",
            "as_of": "2025-12-01",
            "counts": {"green": 8, "blue": 21, "red": 14, "black": 6, "other": 2},
            "note": "Brochure test",
        },
    )
    assert domain.slopes_quality == "curated"
    assert domain.slopes_count_by_color["green"] == 8
    assert domain.slopes_osm_total == 47
    assert domain.slopes_report["note"] == "Brochure test"
