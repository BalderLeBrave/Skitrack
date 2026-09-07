"""Métriques d'accès aux pistes.

Aucun réseau, aucune base : le module de calcul ne connaît ni l'un ni l'autre.
Les géométries sont écrites à la main autour de Val Thorens, avec des distances
vérifiables au ruban.
"""

from __future__ import annotations

import pytest

from skitrack.services.access import (
    classify_access,
    compute_access,
    nearest_point_on_geometry,
)


class Tracé:
    """Objet minimal de la forme attendue : un identifiant, une géométrie."""

    def __init__(self, id: int, coordinates: list[list[float]]):
        self.id = id
        self.geometry = {"type": "LineString", "coordinates": coordinates}


def test_distance_mesuree_au_segment_pas_au_sommet():
    """Le cœur du module : un point face au milieu d'un long segment.

    Les deux sommets sont à ~350 m ; la perpendiculaire au segment est à ~55 m.
    Un calcul « sommet le plus proche » se tromperait d'un facteur six et
    classerait le logement en navette au lieu de skis aux pieds.
    """
    piste = Tracé(1, [[6.5800, 45.2970], [6.5890, 45.2970]])
    # Point centré en longitude, décalé de 0,0005° en latitude ≈ 55 m.
    point = nearest_point_on_geometry(45.29750, 6.58450, piste.geometry)

    assert point is not None
    assert point.distance_m == pytest.approx(55, abs=6)
    assert point.lon == pytest.approx(6.58450, abs=1e-4)


def test_altitude_interpolee_le_long_du_segment():
    piste = Tracé(1, [[6.5800, 45.2970, 2000.0], [6.5900, 45.2970, 2400.0]])
    point = nearest_point_on_geometry(45.2970, 6.5850, piste.geometry)

    assert point is not None
    # À mi-segment, l'altitude doit être à mi-chemin — pas celle d'un sommet.
    assert point.elevation_m == pytest.approx(2200.0, abs=5)


def test_denivele_signe_et_montee_qui_disqualifie_le_skis_aux_pieds():
    """Onze mètres de la piste, mais cinquante-cinq à remonter.

    Le cas qu'un seuil de distance seul classerait « skis aux pieds » à tort :
    le logement est à onze mètres du tracé et cinquante-cinq mètres en dessous.
    En pratique on rentre à pied, donc navette — c'est exactement ce que le
    plafond de dénivelé sert à attraper.
    """
    piste = Tracé(1, [[6.5800, 45.2975, 2310.0], [6.5900, 45.2975, 2400.0]])
    result = compute_access(lat=45.29740, lon=6.58500, altitude_m=2300.0, slopes=[piste])

    assert result.dist_to_nearest_slope_m == pytest.approx(11, abs=8)
    assert result.denivele_to_slope_m == pytest.approx(55.0, abs=1)
    assert result.nearest_slope_id == 1
    assert result.slope_access_type == "navette"


def test_logement_plus_haut_que_la_piste_nest_pas_penalise():
    """Descendre le matin ne coûte rien ; c'est la remontée du soir qui pèse."""
    assert classify_access(120.0, -80.0, None) == "skis_aux_pieds"
    assert classify_access(120.0, 80.0, None) == "navette"


def test_seuils_de_qualification():
    assert classify_access(60.0, 3.0, 400.0) == "skis_aux_pieds"
    assert classify_access(600.0, 5.0, 900.0) == "navette"
    assert classify_access(2500.0, 5.0, 3000.0) == "voiture"
    assert classify_access(None, None, None) is None


def test_remontee_retenue_si_plus_proche_que_la_piste():
    piste = Tracé(1, [[6.5900, 45.3050], [6.5910, 45.3060]])
    remontee = Tracé(7, [[6.5801, 45.2971], [6.5805, 45.2990]])
    result = compute_access(45.2970, 6.5800, 2300.0, slopes=[piste], lifts=[remontee])

    assert result.nearest_lift_id == 7
    assert result.dist_to_nearest_lift_m < result.dist_to_nearest_slope_m
    assert result.slope_access_type == "skis_aux_pieds"


def test_position_approximative_arrondie_a_la_centaine():
    """Airbnb ne publie qu'un cercle flou : annoncer 63 m serait un mensonge."""
    piste = Tracé(1, [[6.5800, 45.2970], [6.5900, 45.2970]])
    exact = compute_access(45.2976, 6.5850, 2300.0, slopes=[piste], precision="exact")
    flou = compute_access(45.2976, 6.5850, 2300.0, slopes=[piste], precision="approximate")

    assert exact.dist_to_nearest_slope_m == pytest.approx(67, abs=10)
    assert flou.dist_to_nearest_slope_m % 100 == 0
    assert flou.precision == "approximate"


def test_altitude_inconnue_laisse_le_denivele_vide_sans_casser_la_distance():
    piste = Tracé(1, [[6.5800, 45.2970, 2310.0], [6.5900, 45.2970, 2400.0]])
    result = compute_access(45.2976, 6.5850, None, slopes=[piste])

    assert result.dist_to_nearest_slope_m is not None
    assert result.denivele_to_slope_m is None
    assert result.computed_with["altitude_known"] is False


def test_domaine_sans_traces_ne_produit_rien_et_ne_leve_pas():
    """Import sans `--with-runs` : état normal, pas une panne."""
    result = compute_access(45.2976, 6.5850, 2300.0, slopes=[], lifts=[])

    assert result.dist_to_nearest_slope_m is None
    assert result.slope_access_type is None


def test_traces_lointains_ecartes_avant_calcul():
    proche = Tracé(1, [[6.5800, 45.2970], [6.5900, 45.2970]])
    lointain = Tracé(2, [[2.3522, 48.8566], [2.3600, 48.8600]])  # Paris
    result = compute_access(45.2976, 6.5850, 2300.0, slopes=[proche, lointain])

    assert result.nearest_slope_id == 1
    # Le tracé parisien n'a même pas été parcouru : c'est ce qui rend le calcul
    # tenable sur un grand domaine, où chaque logement affronterait sinon
    # plusieurs centaines de milliers de sommets.
    assert result.computed_with["scanned"]["slopes"] == 1


def test_geometrie_a_un_seul_sommet_traitee_comme_un_point():
    degrade = Tracé(1, [[6.5850, 45.2970, 2350.0]])
    point = nearest_point_on_geometry(45.2976, 6.5850, degrade.geometry)

    assert point is not None
    assert point.distance_m == pytest.approx(67, abs=10)
    assert point.elevation_m == 2350.0
