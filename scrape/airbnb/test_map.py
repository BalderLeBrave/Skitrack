"""Tests hermétiques du mappeur Airbnb (pyairbnb). Aucun réseau."""

from __future__ import annotations

from map import (
    beds_from_text,
    is_dropped_listing,
    listings_from_raw,
    occupancy_from_text,
    photos_of,
    rating_of,
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


def test_occupancy_from_text_slug_et_fourchette():
    assert occupancy_from_text("l-olympe-n11-appartement-8-personnes.html") == (8, None, None)
    assert occupancy_from_text("Les Deux-Alpes, appartement 6-8 pers, cosy") == (8, None, None)
    assert occupancy_from_text("2 appartements de 6 personnes face à face") == (None, None, None)


def test_occupancy_abreviation_p():
    """« 8p » est une capacité ; « 2p cabine » et « 2 pièces » n'en sont pas."""
    assert occupancy_from_text("8p · 3 chambres") == (8, 3, None)
    assert occupancy_from_text("10 P") == (10, None, None)
    assert occupancy_from_text("Appartement 8p 80m²")[0] == 8
    assert occupancy_from_text("Superbe Appartement 8P pied des pistes (Réf 32)")[0] == 8
    assert occupancy_from_text("2p cabine") == (None, None, None)
    assert occupancy_from_text("Appartement 2 pièces cabine") == (None, None, 2)


def test_numero_505_n_est_pas_cinq_cent_cinq_logements():
    assert occupancy_from_text("LE PRINCE DES ECRINS 505 Appartement 8 personnes") == (8, None, None)
    assert occupancy_from_text("2 appartements de 6 personnes face à face") == (None, None, None)


def test_les_pieces_restent_des_pieces():
    """Un « 2 pièces » annonçait une chambre : c'était une conversion, pas une lecture."""
    assert occupancy_from_text("appartement-2-pieces-cabine-8-personnes") == (8, None, 2)
    assert occupancy_from_text("T3 6 personnes") == (6, None, 3)
    # « Studio » dit une pièce et aucune chambre séparée : les deux sont écrits.
    assert occupancy_from_text("STUDIO CABINE 4 pers.") == (4, 0, 1)
    assert occupancy_from_text("Chalet 3 chambres") == (None, 3, None)


def test_beds_from_text_lit_n_est_pas_voyageur():
    assert beds_from_text("6 lits", "3 chambres") == 6
    assert beds_from_text("8 voyageurs · 3 chambres") is None
    assert beds_from_text("") is None


def test_stay_to_listing_total_seulement():
    row = stay_to_listing(_stay(), check_in="2027-02-06", check_out="2027-02-13", adults=8)
    assert row is not None
    assert row["id"] == "40088811"
    assert row["total"] == 2215
    # Les mots de la source, pas une chaîne fabriquée à partir du total.
    assert row["priceLabel"] == "2 215 € au total"
    assert row["priceIndicative"] is False
    assert row["guests"] == 8
    assert row["bedrooms"] == 3
    assert "check_in=2027-02-06" in row["url"]


def test_stay_to_listing_sans_total_sort_avec_zero():
    """Airbnb liste sans total ce qu'il ne peut pas vendre : l'annonce reste, à 0."""
    rec = _stay(structuredDisplayPrice={"primaryLine": {"accessibilityLabel": "89 € / nuit"}})
    row = stay_to_listing(rec, check_in="2027-02-06", check_out="2027-02-13", adults=8)
    assert row is not None
    assert row["total"] == 0
    assert row["priceLabel"] == "89 € / nuit"


def test_stay_to_listing_a_partir_de_est_marque():
    rec = _stay(structuredDisplayPrice={"primaryLine": {"accessibilityLabel": "À partir de 1 700 €"}})
    row = stay_to_listing(rec, check_in="2027-02-06", check_out="2027-02-13", adults=8)
    assert row is not None
    assert row["total"] == 0
    assert row["priceIndicative"] is True


def test_stay_to_listing_sans_prix_du_tout():
    rec = _stay(structuredDisplayPrice={})
    row = stay_to_listing(rec, check_in="2027-02-06", check_out="2027-02-13", adults=8)
    assert row is not None
    assert row["total"] == 0
    assert row["priceLabel"] is None
    assert row["priceIndicative"] is None


def test_photos_toutes_rendues():
    rec = _stay(
        contextualPictures=[
            {"picture": "https://img.example/a.jpg"},
            {"picture": "https://img.example/b.jpg"},
            {"picture": "https://img.example/b.jpg"},
            {"caption": "sans url"},
        ]
    )
    assert photos_of(rec) == ["https://img.example/a.jpg", "https://img.example/b.jpg"]
    row = stay_to_listing(rec, check_in=None, check_out=None, adults=None)
    assert row["image"] == "https://img.example/a.jpg"
    assert row["photos"] == ["https://img.example/a.jpg", "https://img.example/b.jpg"]


def test_sans_photo_l_annonce_sort_quand_meme():
    row = stay_to_listing(_stay(contextualPictures=[]), check_in=None, check_out=None, adults=None)
    assert row is not None
    assert row["image"] is None
    assert row["photos"] == []


def test_rating_lu_seulement_s_il_est_ecrit():
    """Lecture défensive : aucune clé prouvée, donc None quand rien n'est publié."""
    assert rating_of({}) == (None, None)
    assert rating_of({"avgRatingLocalized": "Nouveau"}) == (None, None)
    assert rating_of({"avgRatingLocalized": "4,92 (25)"}) == (4.92, 25)
    assert rating_of({"avgRatingA11yLabel": "4,92 sur 5, 25 commentaires"}) == (4.92, 25)
    assert rating_of({"avgRating": 4.5, "reviewsCount": 12}) == (4.5, 12)
    row = stay_to_listing(_stay(), check_in=None, check_out=None, adults=None)
    assert row["rating"] is None
    assert row["reviewCount"] is None


def test_lits_poses_dans_beds_pas_dans_guests():
    rec = _stay(
        title="Appartement cosy",
        subtitle=None,
        structuredContent={"mapPrimaryLine": [{"body": "6 lits"}, {"body": "3 chambres"}]},
    )
    row = stay_to_listing(rec, check_in=None, check_out=None, adults=None)
    assert row["beds"] == 6
    assert row["bedrooms"] == 3
    assert row["guests"] is None


def test_sans_prix_range_apres_les_prix_publies():
    raw = {
        "searchResults": [
            _stay(structuredDisplayPrice={"primaryLine": {"accessibilityLabel": "89 € / nuit"}}),
            _stay(
                demandStayListing={
                    "id": "U3RheUxpc3Rpbmc6MTI=",
                    "location": {"coordinate": {"latitude": 45.0, "longitude": 6.1}},
                }
            ),
        ]
    }
    rows = listings_from_raw(raw)
    assert [r["total"] for r in rows] == [2215, 0]


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
