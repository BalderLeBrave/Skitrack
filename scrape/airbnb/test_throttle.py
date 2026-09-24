"""429 Airbnb : Retry-After, coupe-circuit. Aucun réseau."""

from __future__ import annotations

import contextlib
import io
import tempfile
import time
from pathlib import Path

import taux
from throttle import (
    Circuit,
    CoupeCircuit,
    RateLimited,
    RythmeLocal,
    call_with_retry,
    http_status_of,
    is_rate_limited,
    retry_after_from_exc,
    retry_after_s,
)

# Les refus simulés vont dans un journal à part. Le vrai est lu par les relevés
# de la machine : un faux blocage écrit là par ces tests (22:17:26, le
# 23 septembre 2026) a passé pour un 429 d'Airbnb.
taux.TAUX_PATH = Path(tempfile.mkdtemp()) / "taux.json"


def _circuit(**kw) -> Circuit:
    return Circuit(Path(tempfile.mkdtemp()) / "c", **kw)


def test_retry_after_lit_les_secondes():
    assert retry_after_s({"Retry-After": "8"}) == 8.0
    assert retry_after_s({"retry-after": "3"}) == 3.0


def test_retry_after_plafonne():
    assert retry_after_s({"Retry-After": "120"}, cap=12) == 12.0


def test_retry_after_sans_entete_double():
    assert retry_after_s(None, attempt=0, default=2) == 2.0
    assert retry_after_s({}, attempt=1, default=2) == 4.0
    assert retry_after_s({}, attempt=2, default=2) == 8.0


def test_http_status_depuis_args_pyairbnb():
    err = Exception("Not corret status code: ", 429, " retry-after: ", "5", " response body: ", "{}")
    assert http_status_of(err) == 429
    assert is_rate_limited(err)
    assert retry_after_from_exc(err) == 5.0


def test_http_status_depuis_message():
    err = Exception("HTTP 429 retry-after:7")
    assert http_status_of(err) == 429
    assert retry_after_from_exc(err) == 7.0


def test_503_aussi():
    assert http_status_of(Exception("Not corret status code: ", 503)) == 503
    assert is_rate_limited(Exception("status code: 503"))


def test_autre_erreur_pas_429():
    assert not is_rate_limited(Exception("timeout"))
    assert http_status_of(Exception("json illisible")) is None


def test_circuit_souvre_apres_deux_429():
    path = Path(tempfile.mkdtemp()) / "c"
    c = Circuit(path, limit=2, cooldown_s=2.0)
    assert c.open() is False
    c.hit_limited(1)
    assert c.open() is False
    c.hit_limited(1)
    assert c.open() is True
    assert c.remaining_s() > 0
    c.reset()
    assert c.open() is False


def test_circuit_hit_ok_raz_le_compteur():
    path = Path(tempfile.mkdtemp()) / "c"
    c = Circuit(path, limit=2, cooldown_s=30)
    c.hit_limited(1)
    c.hit_ok()
    c.hit_limited(1)
    assert c.open() is False


def test_un_vrai_429_n_est_pas_repris():
    """Réessayer 0,2 s après un refus, c'était le second 429 le plus probable."""
    n = {"i": 0}

    def fn():
        n["i"] += 1
        if n["i"] == 1:
            raise Exception("Not corret status code: ", 429, " retry-after: ", "0.2")
        return "ok"

    c = _circuit(limit=5, cooldown_s=30)
    try:
        call_with_retry(fn, tries=3, circuit=c)
        raise AssertionError("le refus doit remonter")
    except RateLimited as err:
        assert err.status == 429
    assert n["i"] == 1
    assert c.open(), "le coupe-circuit s'ouvre dès le premier refus"


def test_un_refus_ouvre_la_pause_demandee_entiere_et_la_partage():
    c = _circuit(cooldown_s=45)

    def fn():
        raise Exception("Not corret status code: ", 429, " retry-after: ", "120")

    try:
        call_with_retry(fn, circuit=c, etape="StaysSearch")
    except RateLimited:
        pass
    assert c.remaining_s() > 110, "Retry-After 120 s : plus de plafond à 12 s"
    assert taux.attente_s("airbnb") > 110, "Node et les autres relevés voient la même pause"


def test_un_refus_ecrit_sa_ligne_au_journal_serveur():
    c = _circuit()
    err = io.StringIO()

    def fn():
        raise RateLimited(503, 3)

    with contextlib.redirect_stderr(err):
        try:
            call_with_retry(fn, circuit=c, etape="clé")
        except RateLimited:
            pass
    ligne = err.getvalue()
    assert ligne.startswith("[airbnb] HTTP 503 (clé)"), ligne


def test_le_limiteur_local_se_reprend_sans_rien_ouvrir():
    c = _circuit()
    n = {"i": 0}

    def fn():
        n["i"] += 1
        if n["i"] == 1:
            raise RythmeLocal(429, 0.05)
        return "ok"

    assert call_with_retry(fn, tries=3, circuit=c) == "ok"
    assert n["i"] == 2
    assert not c.open()


def test_le_coupe_circuit_est_relu_avant_chaque_essai():
    """Un autre relevé, ou Node, peut l'ouvrir entre deux essais."""
    c = _circuit(cooldown_s=30)
    n = {"i": 0}

    def fn():
        n["i"] += 1
        c.trip(30)
        raise RythmeLocal(429, 0.05)

    try:
        call_with_retry(fn, tries=3, circuit=c)
        raise AssertionError("devait lever")
    except CoupeCircuit:
        pass
    assert n["i"] == 1


def test_trip_garde_une_pause_plus_longue_deja_posee():
    c = _circuit(cooldown_s=5)
    c.trip(300)
    c.trip(1)
    assert c.remaining_s() > 290


def test_call_with_retry_abandonne_apres_les_essais():
    def fn():
        raise RateLimited(429, 0.2)

    path = Path(tempfile.mkdtemp()) / "c"
    c = Circuit(path, limit=9, cooldown_s=30)
    try:
        call_with_retry(fn, tries=2, circuit=c)
        raise AssertionError("devait lever")
    except RateLimited as err:
        assert err.status == 429


def test_call_with_retry_respecte_le_circuit_ouvert():
    path = Path(tempfile.mkdtemp()) / "c"
    c = Circuit(path, limit=1, cooldown_s=30)
    c.trip(30)
    n = {"i": 0}

    def fn():
        n["i"] += 1
        return "nope"

    try:
        call_with_retry(fn, tries=3, circuit=c)
        raise AssertionError("devait lever")
    except CoupeCircuit:
        pass
    assert n["i"] == 0


def _pdp_isole():
    """Le PDP avec un coupe-circuit à part, et une fiche simulée."""
    import pdp
    import throttle

    throttle.airbnb_circuit.path = Path(tempfile.mkdtemp()) / "c"
    throttle.airbnb_circuit.consecutive = 0
    return pdp, throttle.airbnb_circuit


def test_pdp_un_refus_arrete_sans_reprise():
    pdp, gate = _pdp_isole()
    n = {"i": 0}
    ancien = pdp.fetch_pdp

    def refuse(*a, **k):
        n["i"] += 1
        raise RateLimited(429, 1)

    pdp.fetch_pdp = refuse
    try:
        out = pdp._fetch_pdp_polite(
            "1", check_in=None, check_out=None, adults=2, api_key="k", proxy_url="", deadline=time.perf_counter() + 30
        )
    finally:
        pdp.fetch_pdp = ancien
    assert out is None
    assert n["i"] == 1
    assert gate.open()


def test_pdp_le_limiteur_local_n_ouvre_pas_le_coupe_circuit():
    pdp, gate = _pdp_isole()
    ancien = pdp.fetch_pdp

    def trop_tot(*a, **k):
        raise RythmeLocal(429, 30)

    pdp.fetch_pdp = trop_tot
    try:
        pdp._fetch_pdp_polite(
            "1", check_in=None, check_out=None, adults=2, api_key="k", proxy_url="", deadline=time.perf_counter() + 30
        )
        raise AssertionError("RythmeLocal doit remonter : le lot s'arrête")
    except RythmeLocal:
        pass
    finally:
        pdp.fetch_pdp = ancien
    assert not gate.open()


def test_un_delai_en_millisecondes_n_est_pas_un_503():
    """« 503 ms » dans une erreur réseau ouvrait le coupe-circuit."""
    err = Exception("Failed to perform, curl: (28) Operation timed out after 503 milliseconds")
    assert http_status_of(err) is None
    assert not is_rate_limited(Exception("timed out after 503 ms"))
    assert http_status_of(Exception("HTTP Error: Too Many Requests")) == 429
    assert http_status_of(Exception("response status 503")) == 503


def test_une_reprise_locale_qui_finirait_apres_l_echeance_n_est_pas_tentee():
    """La borne `fin` vaut pour la seule reprise qui reste : celle du limiteur local."""
    c = _circuit()
    n = {"i": 0}

    def trop_tot():
        n["i"] += 1
        raise RythmeLocal(429, 10)

    debut = time.time()
    try:
        call_with_retry(trop_tot, tries=3, circuit=c, fin=time.time() + 5)
        raise AssertionError("devait lever")
    except RythmeLocal:
        pass
    assert n["i"] == 1
    assert time.time() - debut < 1.0


def test_la_session_ne_part_pas_pendant_une_pause_ouverte_entre_temps():
    """Le créneau est pris, mais le coupe-circuit s'est ouvert pendant l'attente."""
    import session
    import throttle

    taux.TAUX_PATH = Path(tempfile.mkdtemp()) / "taux.json"
    throttle.airbnb_circuit.path = Path(tempfile.mkdtemp()) / "c"
    throttle.airbnb_circuit.trip(30)
    try:
        session._wrap("get")("https://www.airbnb.com/api/v3/StaysSearch/x", timeout=20)
        raise AssertionError("devait lever")
    except CoupeCircuit:
        pass


def test_un_texte_de_delai_n_est_toujours_pas_un_503():
    assert http_status_of(Exception("Response timed out after 503 ms")) is None
    assert http_status_of(Exception("error: timed out after 503 ms")) is None
    assert http_status_of(Exception("status: 503")) == 503


def test_une_reprise_locale_qui_tient_avant_l_echeance_est_tentee():
    c = _circuit()
    n = {"i": 0}

    def fn():
        n["i"] += 1
        if n["i"] == 1:
            raise RythmeLocal(429, 0.05)
        return "ok"

    assert call_with_retry(fn, tries=3, circuit=c, fin=time.time() + 30) == "ok"
    assert n["i"] == 2


def test_la_session_recale_le_delai_sur_l_echeance():
    import session
    import throttle

    taux.TAUX_PATH = Path(tempfile.mkdtemp()) / "taux.json"
    throttle.airbnb_circuit.path = Path(tempfile.mkdtemp()) / "c"
    vu = {}

    class Faux:
        def get(self, *a, **k):
            vu.update(k)

    ancien_http, ancienne_echeance = session._http, session.echeance
    session._http = Faux()
    session.echeance = time.time() + 4
    try:
        session._wrap("get")("https://www.airbnb.com/api/v3/StaysSearch/x", timeout=45)
    finally:
        session._http, session.echeance = ancien_http, ancienne_echeance
    assert vu["timeout"] <= 3.6, f"délai {vu['timeout']:.1f} s au-delà de l'échéance"


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
