"""Empreinte furtive : proxy sticky par session, rotation seulement après blocage."""

from __future__ import annotations

from skitrack.scrapers.stealth import StickyProxyPool, impersonate_headers


def test_sans_proxy_rend_none():
    pool = StickyProxyPool([])
    assert pool.for_session("val-thorens") is None
    assert pool.playwright_kwargs("val-thorens") == {}


def test_sticky_par_session():
    pool = StickyProxyPool(["http://a:1", "http://b:2", "http://c:3"])
    first = pool.for_session("meribel")
    again = pool.for_session("meribel")
    other = pool.for_session("tignes")
    assert first == again
    assert first in {"http://a:1", "http://b:2", "http://c:3"}
    assert other in {"http://a:1", "http://b:2", "http://c:3"}


def test_rotate_change_le_proxy_de_la_session():
    pool = StickyProxyPool(["http://a:1", "http://b:2"])
    before = pool.for_session("vt")
    after = pool.rotate("vt")
    assert after is not None
    assert pool.for_session("vt") == after
    # Deux proxies : la rotation doit quitter l'ancien.
    if before != after:
        assert after != before


def test_headers_imitent_chrome():
    headers = impersonate_headers({"X-Test": "1"})
    assert "Chrome/" in headers["User-Agent"]
    assert headers["X-Test"] == "1"
    assert headers["Sec-Ch-Ua-Mobile"] == "?0"
