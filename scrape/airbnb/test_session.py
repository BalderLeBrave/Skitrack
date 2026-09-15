"""Pagination Airbnb 2026 : pageCursors, plus nextPageCursor. Aucun réseau."""

import json
import tempfile
import time
from pathlib import Path

from session import cached, invalidate, next_search_cursor
import session as session_mod


PAGES = [
    "eyJhbGciOiI0In0=",
    "eyJhbGciOiI0MCJ9",
    "eyJhbGciOiI4MCJ9",
]


def test_premiere_page_prend_le_deuxieme_curseur():
    nxt = next_search_cursor({"pageCursors": PAGES}, "")
    assert nxt == PAGES[1]


def test_page_milieu():
    nxt = next_search_cursor({"pageCursors": PAGES}, PAGES[1])
    assert nxt == PAGES[2]


def test_derniere_page():
    assert next_search_cursor({"pageCursors": PAGES}, PAGES[2]) is None


def test_next_page_cursor_historique():
    assert next_search_cursor({"nextPageCursor": "abc"}, "") == "abc"


def test_vide():
    assert next_search_cursor({}, "") is None
    assert next_search_cursor({"pageCursors": []}, "") is None


def test_cache_disque_evite_un_second_fetch():
    path = Path(tempfile.mkdtemp()) / "session.json"
    old = session_mod.SESSION_PATH
    session_mod.SESSION_PATH = path
    session_mod._key = ""
    session_mod._hash = ""
    session_mod._key_at = 0.0
    session_mod._hash_at = 0.0
    n = {"i": 0}

    def fetch():
        n["i"] += 1
        return "cle-test"

    try:
        assert cached("key", fetch) == "cle-test"
        session_mod._key = ""
        session_mod._key_at = 0.0
        assert cached("key", fetch) == "cle-test"
        assert n["i"] == 1
        data = json.loads(path.read_text())
        assert data["key"] == "cle-test"
        assert time.time() - data["key_at"] < 5
    finally:
        invalidate()
        session_mod.SESSION_PATH = old
        session_mod._key = ""
        session_mod._hash = ""
        session_mod._key_at = 0.0
        session_mod._hash_at = 0.0


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
