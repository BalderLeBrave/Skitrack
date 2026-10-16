"""Repli botasaurus-requests dans `search.fetch_page`. Aucun réseau."""

from __future__ import annotations

import sys
import types

import pytest

import repli_http
import search


@pytest.fixture(autouse=True)
def _repli_neuf(monkeypatch):
    monkeypatch.setattr(repli_http, "_hors_service", False)


def _curl(monkeypatch, get):
    monkeypatch.setitem(sys.modules, "curl_cffi", types.SimpleNamespace(requests=types.SimpleNamespace(get=get)))


def _panne(*_a, **_k):
    raise ConnectionError("hôte injoignable")


def test_une_panne_de_transport_passe_par_le_repli(monkeypatch):
    _curl(monkeypatch, _panne)
    rep = types.SimpleNamespace(status_code=200, headers={}, text="<html>")
    monkeypatch.setitem(sys.modules, "botasaurus_requests", types.SimpleNamespace(get=lambda *a, **k: rep))
    assert search.fetch_page("https://www.booking.com/x") == (200, "<html>")


def test_une_reponse_de_curl_ne_passe_pas_par_le_repli(monkeypatch):
    _curl(monkeypatch, lambda *a, **k: types.SimpleNamespace(status_code=403, text="refus"))
    monkeypatch.setitem(
        sys.modules,
        "botasaurus_requests",
        types.SimpleNamespace(get=lambda *a, **k: pytest.fail("un 403 n'est pas une panne")),
    )
    assert search.fetch_page("https://www.booking.com/x") == (403, "refus")


def test_sans_repli_la_panne_remonte(monkeypatch):
    _curl(monkeypatch, _panne)
    monkeypatch.setitem(sys.modules, "botasaurus_requests", None)
    with pytest.raises(ConnectionError):
        search.fetch_page("https://www.booking.com/x")
