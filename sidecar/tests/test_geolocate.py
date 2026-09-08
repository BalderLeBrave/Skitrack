"""GPS d'annonce : jamais (0, 0), jamais le centroïde du domaine, BAN si adresse."""

from __future__ import annotations

import asyncio

import pytest

from skitrack.schemas.geo import GeocodeResult
from skitrack.services.geo_math import plausible_point
from skitrack.services.geolocate import geocode_query, refine_listing_coords


def test_zero_zero_n_est_pas_un_logement():
    assert plausible_point(0, 0) is False
    assert plausible_point(45.3, 6.58) is True
    assert plausible_point(None, 6.58) is False
    assert plausible_point(91, 6.0) is False


def test_titre_d_annonce_n_est_pas_une_adresse():
    assert geocode_query("Chalet les étoiles", None) is None
    assert geocode_query(None, None) is None
    q, hoped = geocode_query("3 place de l'Église, 73450 Valloire", None)
    assert "Valloire" in q
    assert hoped == "address"
    q2, hoped2 = geocode_query(None, "Val Thorens")
    assert q2 == "Val Thorens"
    assert hoped2 == "approximate"


async def _ban(query: str, *, limit: int = 5, lat=None, lon=None):
    q = query.lower()
    if "valloire" in q and "église" in q.replace("eglise", "église"):
        return [
            GeocodeResult(
                label="3 Place de l'Église 73450 Valloire",
                lat=45.1654,
                lon=6.4291,
                score=0.97,
                city="Valloire",
                postcode="73450",
                provider="ban",
                kind="housenumber",
            )
        ]
    if "valloire" in q:
        return [
            GeocodeResult(
                label="73450 Valloire",
                lat=45.165,
                lon=6.429,
                score=0.88,
                city="Valloire",
                postcode="73450",
                provider="ban",
                kind="municipality",
            )
        ]
    if "paris" in q:
        return [
            GeocodeResult(
                label="Paris",
                lat=48.8566,
                lon=2.3522,
                score=0.99,
                city="Paris",
                postcode="75001",
                provider="ban",
                kind="municipality",
            )
        ]
    return []


def test_point_exact_conserve():
    p = asyncio.run(
        refine_listing_coords(
            lat=45.2976,
            lon=6.5850,
            precision="exact",
            domain_lat=45.297,
            domain_lon=6.580,
            geocode_fn=_ban,
        )
    )
    assert p.source == "provider"
    assert p.precision == "exact"
    assert p.lat == pytest.approx(45.2976)


def test_zero_zero_adresse_ban():
    p = asyncio.run(
        refine_listing_coords(
            lat=0,
            lon=0,
            precision="exact",
            address="3 place de l'Église, 73450 Valloire",
            domain_lat=45.165,
            domain_lon=6.43,
            geocode_fn=_ban,
        )
    )
    assert p.source == "ban"
    assert p.precision == "address"
    assert p.lat == pytest.approx(45.1654, abs=1e-3)


def test_point_a_paris_pour_valloire_est_jete():
    p = asyncio.run(
        refine_listing_coords(
            lat=48.8566,
            lon=2.3522,
            precision="exact",
            address="3 place de l'Église, 73450 Valloire",
            domain_lat=45.165,
            domain_lon=6.43,
            geocode_fn=_ban,
        )
    )
    assert p.source == "ban"
    assert p.lat == pytest.approx(45.1654, abs=1e-3)


def test_centroide_domaine_jamais_ecrit():
    p = asyncio.run(
        refine_listing_coords(
            lat=None,
            lon=None,
            precision="unknown",
            address=None,
            commune=None,
            domain_lat=45.297,
            domain_lon=6.580,
            geocode_fn=_ban,
        )
    )
    assert p.lat is None
    assert p.source == "none"
    assert p.precision == "unknown"


def test_commune_seule_reste_approximative():
    p = asyncio.run(
        refine_listing_coords(
            lat=None,
            lon=None,
            precision="unknown",
            commune="Valloire",
            domain_lat=45.165,
            domain_lon=6.43,
            geocode_fn=_ban,
        )
    )
    assert p.source == "ban"
    assert p.precision == "approximate"
    assert p.lat == pytest.approx(45.165, abs=1e-2)


def test_airbnb_flou_sans_adresse_conserve_le_cercle():
    p = asyncio.run(
        refine_listing_coords(
            lat=45.297,
            lon=6.580,
            precision="approximate",
            address=None,
            domain_lat=45.297,
            domain_lon=6.580,
            geocode_fn=_ban,
        )
    )
    assert p.source == "provider"
    assert p.precision == "approximate"


def test_resultat_ban_hors_domaine_refuse():
    p = asyncio.run(
        refine_listing_coords(
            lat=None,
            lon=None,
            precision="unknown",
            commune="Paris",
            domain_lat=45.297,
            domain_lon=6.580,
            geocode_fn=_ban,
        )
    )
    assert p.lat is None
    assert p.source == "none"


def test_lodging_in_accepte_adresse_sans_gps():
    from skitrack.schemas.lodging import LodgingIn

    item = LodgingIn(ref="a", address="3 place de l'Église, 73450 Valloire", commune="Valloire")
    assert item.lat is None
    assert item.address.startswith("3 place")
