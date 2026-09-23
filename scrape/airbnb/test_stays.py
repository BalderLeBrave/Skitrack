"""Emprises et compteur publié du relevé Airbnb. Aucun réseau."""

from __future__ import annotations

import io

from cli import emit
from stays import PLAFOND_EMPRISE, bounds_from_point, emprises, quadrants, result_count


def test_le_compteur_publie_est_lu_dans_le_panneau_de_filtres():
    raw = {"data": {"presentation": {"staysSearch": {"results": {"filters": {"filterPanel": {"resultCount": 273}}}}}}}
    assert result_count(raw) == 273
    assert result_count({"data": {}}) is None
    assert result_count({"data": {"presentation": {"staysSearch": {"results": {"filters": {"filterPanel": {"resultCount": True}}}}}}}) is None


def test_avec_coordonnees_l_emprise_proche_passe_avant_la_large():
    zones = emprises({"lat": 45.2979, "lon": 6.5799, "city": "Val Thorens"})
    assert [nom for nom, _ in zones] == ["proche", "large"]
    proche, large = zones[0][1]["bounds"], zones[1][1]["bounds"]
    assert proche["north"] - proche["south"] < large["north"] - large["south"]
    assert abs((proche["north"] + proche["south"]) / 2 - 45.2979) < 1e-9


def test_sans_coordonnees_une_seule_recherche_comme_avant():
    assert [nom for nom, _ in emprises({"city": "Val Thorens"})] == ["unique"]
    assert [nom for nom, _ in emprises({"url": "https://www.airbnb.fr/s/x/homes", "lat": 45, "lon": 6})] == ["unique"]


def test_les_quarts_couvrent_l_emprise_sans_la_deborder():
    b = bounds_from_point(45.0, 6.0, 6.0)
    qs = quadrants(b)
    assert len(qs) == 4
    assert min(q["south"] for q in qs) == b["south"] and max(q["north"] for q in qs) == b["north"]
    assert min(q["west"] for q in qs) == b["west"] and max(q["east"] for q in qs) == b["east"]
    assert PLAFOND_EMPRISE == 280


class _Console(io.TextIOWrapper):
    pass


def test_la_sortie_reste_du_json_utf8_sur_une_console_cp1252():
    brut = io.BytesIO()
    console = _Console(brut, encoding="cp1252")
    emit({"ok": True, "titre": "Studio 4\u202fpers. · Val Thorens"}, console)
    import json

    assert json.loads(brut.getvalue().decode("utf-8"))["titre"] == "Studio 4\u202fpers. · Val Thorens"


def test_une_reprise_qui_finirait_apres_l_echeance_n_est_pas_tentee():
    import time

    from throttle import Circuit, RateLimited, call_with_retry
    import tempfile
    from pathlib import Path

    gate = Circuit(Path(tempfile.mkdtemp()) / "circuit")
    appels = {"n": 0}

    def refus():
        appels["n"] += 1
        raise RateLimited(429, 10)

    # Le refus est noté dans le journal de taux : un journal à part, pour ne
    # pas bloquer les vrais relevés de la machine.
    import taux

    ancien = taux.TAUX_PATH
    taux.TAUX_PATH = Path(tempfile.mkdtemp()) / "taux.json"
    debut = time.time()
    try:
        call_with_retry(refus, circuit=gate, fin=time.time() + 5)
        raise AssertionError("le refus doit remonter")
    except RateLimited:
        pass
    finally:
        taux.TAUX_PATH = ancien
    assert appels["n"] == 1
    assert time.time() - debut < 1.0


def test_le_limiteur_local_n_ouvre_pas_le_coupe_circuit():
    import tempfile
    from pathlib import Path

    from throttle import Circuit, RythmeLocal, call_with_retry

    gate = Circuit(Path(tempfile.mkdtemp()) / "circuit")

    def trop_tot():
        raise RythmeLocal(429, 30)

    for _ in range(5):
        try:
            call_with_retry(trop_tot, circuit=gate, tries=1)
        except RythmeLocal:
            pass
    assert not gate.open()
    assert gate.consecutive == 0


if __name__ == "__main__":
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            try:
                fn()
                print("ok", name)
            except Exception as err:
                failed += 1
                print("FAIL", name, err)
    raise SystemExit(failed)
