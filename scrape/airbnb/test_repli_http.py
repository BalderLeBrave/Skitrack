"""Repli botasaurus-requests (`repli_http`) et son branchement dans `pdp`. Aucun réseau."""

from __future__ import annotations

import sys
import types

import pytest

import pdp
import repli_http
from throttle import RateLimited


@pytest.fixture(autouse=True)
def _repli_neuf(monkeypatch):
    monkeypatch.setattr(repli_http, "_hors_service", False)


def _botasaurus(monkeypatch, get):
    monkeypatch.setitem(sys.modules, "botasaurus_requests", types.SimpleNamespace(get=get))


def _curl(monkeypatch, get):
    monkeypatch.setitem(sys.modules, "curl_cffi", types.SimpleNamespace(requests=types.SimpleNamespace(get=get)))


def _panne(*_a, **_k):
    raise ConnectionError("hôte injoignable")


def test_le_repli_rend_statut_entetes_et_texte(monkeypatch):
    vus = {}

    def get(url, **kw):
        vus.update(kw, url=url)
        return types.SimpleNamespace(status_code=200, headers={"a": "b"}, text="ok")

    _botasaurus(monkeypatch, get)
    r = repli_http.get("https://x/", headers={"h": "1"}, proxy_url="http://p", timeout=7)
    assert (r.status_code, r.headers, r.text) == (200, {"a": "b"}, "ok")
    assert vus["proxies"] == {"http": "http://p", "https": "http://p"} and vus["timeout"] == 7


def test_un_import_rate_coupe_le_repli_pour_le_processus(monkeypatch):
    monkeypatch.setitem(sys.modules, "botasaurus_requests", None)  # ImportError
    assert repli_http.get("https://x/", headers={}) is None
    assert repli_http._hors_service is True
    _botasaurus(monkeypatch, lambda *a, **k: pytest.fail("repli coupé : plus d'appel"))
    assert repli_http.get("https://x/", headers={}) is None


def test_un_echec_du_repli_rend_none(monkeypatch):
    _botasaurus(monkeypatch, _panne)
    assert repli_http.get("https://x/", headers={}) is None
    assert repli_http._hors_service is False


def test_page_rooms_une_panne_de_transport_passe_par_le_repli(monkeypatch):
    _curl(monkeypatch, _panne)
    appels = []

    def get(url, **kw):
        appels.append(url)
        return types.SimpleNamespace(status_code=404, headers={}, text="")

    _botasaurus(monkeypatch, get)
    assert pdp.fetch_page_rooms("42", check_in=None, check_out=None, adults=None) is None
    assert appels == ["https://www.airbnb.fr/rooms/42"]


def test_page_rooms_un_refus_ne_passe_pas_par_le_repli(monkeypatch):
    _curl(monkeypatch, lambda *a, **k: types.SimpleNamespace(status_code=429, headers={}, text=""))
    _botasaurus(monkeypatch, lambda *a, **k: pytest.fail("un 429 n'est pas une panne"))
    with pytest.raises(RateLimited):
        pdp.fetch_page_rooms("42", check_in=None, check_out=None, adults=None)


def test_un_refus_rendu_par_le_repli_reste_un_refus(monkeypatch):
    _curl(monkeypatch, _panne)
    _botasaurus(monkeypatch, lambda *a, **k: types.SimpleNamespace(status_code=429, headers={}, text=""))
    with pytest.raises(RateLimited):
        pdp.fetch_page_rooms("42", check_in=None, check_out=None, adults=None)


def test_pdp_sans_repli_rend_none(monkeypatch):
    monkeypatch.setattr(pdp, "_page_rooms_seule", False)
    _curl(monkeypatch, _panne)
    monkeypatch.setitem(sys.modules, "botasaurus_requests", None)
    assert pdp.fetch_pdp("42", check_in=None, check_out=None, adults=None, api_key="k") is None
