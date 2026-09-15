"""429 Airbnb : Retry-After, coupe-circuit. Aucun réseau."""

from __future__ import annotations

import tempfile
import time
from pathlib import Path

from throttle import (
    Circuit,
    RateLimited,
    call_with_retry,
    http_status_of,
    is_rate_limited,
    retry_after_from_exc,
    retry_after_s,
)


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


def test_call_with_retry_reussit_au_deuxieme():
    n = {"i": 0}

    def fn():
        n["i"] += 1
        if n["i"] == 1:
            raise Exception("Not corret status code: ", 429, " retry-after: ", "0.2")
        return "ok"

    path = Path(tempfile.mkdtemp()) / "c"
    c = Circuit(path, limit=5, cooldown_s=30)
    assert call_with_retry(fn, tries=3, circuit=c) == "ok"
    assert n["i"] == 2


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
    except RateLimited:
        pass
    assert n["i"] == 0


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
