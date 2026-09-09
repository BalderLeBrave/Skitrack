"""Tests hermétiques du mappeur Airbnb (pyairbnb). Aucun réseau."""

from __future__ import annotations

from map import (
    is_dropped_listing,
    listings_from_raw,
    stay_total_from_label,
    stay_to_listing,
)


def test_stay_total_accepte_au_total():
    assert stay_total_from_label("2 215 € au total") == 2215
    assert stay_total_from_label("2215€ pour 7 nuits") == 2215


def test_stay_total_refuse_nuit_et_a_partir():
    assert stay_total_from_label("89 € / nuit") is None
    assert stay_total_from_label("À partir de 1 700 €") is None
    assert stay_total_from_label("1700 € par nuit") is None


def test_hotel_et_chambre_ecartes():
    assert is_dropped_listing("Hôtel · Les Deux Alpes") is True
    assert is_dropped_listing("Chambre privée dans un chalet") is True
    assert is_dropped_listing("Chalet entier · 8 voyageurs") is False


def _stay(**over):
    rec = {
        "__typename": "StaySearchResult",
        "title": "Chalet des neiges",
        "subtitle": "8 voyageurs · 3 chambres",
        "demandStayListing": {
            "id": "U3RheUxpc3Rpbmc6NDAwODg4MTE=",  # StayListing:40088811
            "location": {"coordinate": {"latitude": 45.0, "longitude": 6.1}},
        },
        "structuredDisplayPrice": {
            "primaryLine": {"accessibilityLabel": "2 215 € au total"},
        },
        "contextualPictures": [{"picture": "https://img.example/a.jpg"}],
    }
    rec.update(over)
    return rec


def test_stay_to_listing_total_seulement():
    row = stay_to_listing(_stay(), check_in="2027-02-06", check_out="2027-02-13", adults=8)
    assert row is not None
    assert row["id"] == "40088811"
    assert row["total"] == 2215
    assert row["priceLabel"] == "2215 € au total"
    assert row["guests"] == 8
    assert row["bedrooms"] == 3
    assert "check_in=2027-02-06" in row["url"]


def test_stay_to_listing_sans_total_est_vide():
    rec = _stay(structuredDisplayPrice={"primaryLine": {"accessibilityLabel": "89 € / nuit"}})
    assert stay_to_listing(rec, check_in="2027-02-06", check_out="2027-02-13", adults=8) is None


def test_listings_from_raw_dedupe_et_filtre_capacite():
    raw = {
        "data": {
            "presentation": {
                "staysSearch": {
                    "results": {
                        "searchResults": [
                            _stay(),
                            _stay(),
                            _stay(
                                title="Studio 2 personnes",
                                subtitle="2 voyageurs · 1 chambre",
                                demandStayListing={
                                    "id": "U3RheUxpc3Rpbmc6MTE=",
                                    "location": {"coordinate": {"latitude": 45.0, "longitude": 6.1}},
                                },
                            ),
                        ]
                    }
                }
            }
        }
    }
    rows = listings_from_raw(raw, check_in="2027-02-06", check_out="2027-02-13", adults=8, min_guests=8)
    assert len(rows) == 1
    assert rows[0]["id"] == "40088811"


def test_stay_to_listing_forme_api_2026():
    """title/subtitle nuls : le nom vit dans nameLocalized (StaysSearch actuel)."""
    rec = {
        "__typename": "StaySearchResult",
        "title": None,
        "subtitle": None,
        "nameLocalized": {
            "localizedStringWithTranslationPreference": "Appartement : 8 couchages face aux pistes"
        },
        "demandStayListing": {
            "id": "RGVtYW5kU3RheUxpc3Rpbmc6MTUwODExNTgxMDM1NDY0NTcyOA==",
            "location": {"coordinate": {"latitude": 45.0565, "longitude": 6.0777}},
        },
        "structuredContent": {
            "mapPrimaryLine": [
                {"body": "6 lits", "type": "BEDINFO"},
                {"body": "3 chambres", "type": "BEDINFO"},
            ]
        },
        "structuredDisplayPrice": {
            "primaryLine": {
                "accessibilityLabel": "1\u202f775\u00a0€ pour 7\u00a0nuits, au lieu de 2\u202f730\u00a0€"
            }
        },
        "contextualPictures": [{"picture": "https://img.example/a.jpg"}],
    }
    row = stay_to_listing(rec, check_in="2027-02-06", check_out="2027-02-13", adults=8)
    assert row is not None, "annonce live écartée"
    assert row["id"] == "1508115810354645728"
    assert row["total"] == 1775
    assert row["bedrooms"] == 3
    assert row["guests"] == 8
    assert "pistes" in row["name"]


if __name__ == "__main__":
    tests = [fn for name, fn in list(globals().items()) if name.startswith("test_")]
    failed = 0
    for fn in tests:
        try:
            fn()
            print("ok", fn.__name__)
        except Exception as err:
            failed += 1
            print("FAIL", fn.__name__, err)
    raise SystemExit(failed)
