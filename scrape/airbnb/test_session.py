"""Pagination Airbnb 2026 : pageCursors, plus nextPageCursor. Aucun réseau."""

from session import next_search_cursor


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
