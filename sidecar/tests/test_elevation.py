"""Altitude IGN : le texte d'annonce n'entre jamais ; le parseur suit la fixture."""

from __future__ import annotations

import pytest

from skitrack.services.elevation import (
    IGN_NODATA,
    VT_IGN_ALT_M,
    VT_IGN_LAT,
    VT_IGN_LON,
    parse_ign_elevations,
)
from skitrack.services.geo_math import in_metropolitan_france


# Réponse IGN (forme réelle), point Val Thorens. z = 2304.12 m.
IGN_VT_FIXTURE = {
    "elevations": [
        {"lon": VT_IGN_LON, "lat": VT_IGN_LAT, "z": 2304.12},
    ]
}


def test_ign_val_thorens_a_cinq_metres_pres():
    z = parse_ign_elevations(IGN_VT_FIXTURE, 1)[0]
    assert z is not None
    assert z == pytest.approx(VT_IGN_ALT_M, abs=5)


def test_ign_nodata_devient_none_pas_zero():
    data = {"elevations": [{"lon": 0.0, "lat": 0.0, "z": IGN_NODATA}]}
    assert parse_ign_elevations(data, 1) == [None]


def test_ign_compte_decale_ne_decale_pas_silencieusement():
    data = {"elevations": [{"z": 1800.0}, {"z": 1900.0}]}
    assert parse_ign_elevations(data, 1) == [None]


def test_val_thorens_est_en_france_metropolitaine():
    assert in_metropolitan_france(VT_IGN_LAT, VT_IGN_LON) is True
