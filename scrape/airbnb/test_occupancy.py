"""GPS et occupation lus dans une fiche PDP. Aucun réseau."""

from occupancy import merge_occupancy, occupancy_from_pdp


def _pdp(*, lat=45.02298, lng=6.12571, guests=8, bedrooms=3):
    return {
        "data": {
            "merlin": {
                "pdpSections": {
                    "metadata": {
                        "loggingContext": {
                            "eventDataLogging": {
                                "personCapacity": guests,
                                "bedroomCount": bedrooms,
                                "listingLat": lat,
                                "listingLng": lng,
                            }
                        },
                        "sharingConfig": {},
                        "bookingPrefetchData": {"roomType": "Entire home/apt"},
                    }
                }
            }
        }
    }


def test_occupancy_from_pdp_lit_gps_et_capacite():
    occ = occupancy_from_pdp(_pdp())
    assert occ["guests"] == 8
    assert occ["bedrooms"] == 3
    assert occ["lat"] == 45.02298
    assert occ["lon"] == 6.12571
    assert occ["dropped"] is False


def test_occupancy_from_pdp_jette_un_zero_zero():
    occ = occupancy_from_pdp(_pdp(lat=0, lng=0))
    assert occ["lat"] is None
    assert occ["lon"] is None


def test_merge_occupancy_pose_le_gps_seulement_s_il_manque():
    row = {"id": "1", "guests": None, "bedrooms": None, "lat": None, "lon": None}
    out = merge_occupancy(row, occupancy_from_pdp(_pdp()))
    assert out["guests"] == 8
    assert out["lat"] == 45.02298
    deja = merge_occupancy(
        {"id": "1", "guests": 6, "bedrooms": 2, "lat": 45.0, "lon": 6.0},
        occupancy_from_pdp(_pdp()),
    )
    assert deja["guests"] == 6
    assert deja["lat"] == 45.0


# Fiche réelle du 25 sept. 2026 (annonce 1715991757416810235, Morzine), réduite
# aux métadonnées lues : les chambres ne sont que dans le titre de partage.
PDP_REELLE = {
    "data": {
        "merlin": {
            "pdpSections": {
                "metadata": {
                    "loggingContext": {
                        "eventDataLogging": {
                            "personCapacity": 4,
                            "roomType": "Entire home/apt",
                            "listingLat": 46.15005540000001,
                            "listingLng": 6.757117464418014,
                        }
                    },
                    "sharingConfig": {
                        "title": "Appartement · Morzine · ★4,75 · 2 chambres · 3 lits · 1\xa0salle de bain",
                        "propertyType": "Logement entier\xa0: appartement",
                        "personCapacity": 4,
                    },
                    "bookingPrefetchData": {"isHotelRatePlanEnabled": None},
                }
            }
        }
    }
}


def test_fiche_reelle_capacite_chambres_position_et_type():
    occ = occupancy_from_pdp(PDP_REELLE)
    assert occ["guests"] == 4
    assert occ["bedrooms"] == 2, "lu dans le titre de partage"
    assert (occ["lat"], occ["lon"]) == (46.15005540000001, 6.757117464418014)
    assert occ["room_type"] == "Entire home/apt"
    assert occ["type_logement"] == "Logement entier\xa0: appartement"
    assert occ["dropped"] is False


def _titre(titre):
    return {"data": {"merlin": {"pdpSections": {"metadata": {"sharingConfig": {"title": titre}}}}}}


def test_titre_de_partage_studio_et_lieu_a_chiffre():
    studio = occupancy_from_pdp(_titre("Studio · Tignes · ★4,9 · 1 lit · 1 salle de bain"))
    assert (studio["bedrooms"], studio["rooms"]) == (0, 1)
    chalet = occupancy_from_pdp(_titre("Chalet · Les 2 Alpes · 5 chambres · 9 lits · 3 salles de bain"))
    assert chalet["bedrooms"] == 5
    assert chalet["guests"] is None, "des lits ne sont pas des voyageurs"
    lieu = occupancy_from_pdp(_titre("Appartement · Studio Village · ★4,5 · 2 chambres"))
    assert lieu["bedrooms"] == 2, "le lieu n'est pas lu"


def _pdp_apercu(items, titre="Logement entier : chalet · Hôte : Marie", log=None, share=None, prefetch=None):
    """Une fiche dont l'aperçu porte les lignes « 6 voyageurs », « 3 chambres »…

    Forme de pyairbnb (section OVERVIEW_DEFAULT, `detailItems`) ; la fiche
    sondée le 25 sept. 2026 n'en portait pas.
    """
    return {
        "data": {
            "merlin": {
                "pdpSections": {
                    "metadata": {
                        "loggingContext": {"eventDataLogging": log or {}},
                        "sharingConfig": share or {},
                        "bookingPrefetchData": prefetch or {},
                    },
                    "sections": [
                        {
                            "sectionComponentType": "OVERVIEW_DEFAULT",
                            "section": {"title": titre, "detailItems": [{"title": t} for t in items]},
                        }
                    ],
                }
            }
        }
    }


def test_l_apercu_donne_les_chambres_que_les_champs_taisent():
    occ = occupancy_from_pdp(
        _pdp_apercu(["6 voyageurs", "3 chambres", "4 lits", "2 salles de bain"], log={"personCapacity": 6})
    )
    assert occ["guests"] == 6
    assert occ["bedrooms"] == 3
    assert occ["type_logement"] == "Logement entier : chalet"
    assert occ["dropped"] is False


def test_les_champs_chiffres_passent_avant_l_apercu():
    occ = occupancy_from_pdp(_pdp_apercu(["4 voyageurs", "1 chambre"], log={"personCapacity": 6, "bedroomCount": 2}))
    assert occ["guests"] == 6
    assert occ["bedrooms"] == 2


def test_un_studio_de_l_apercu_n_a_aucune_chambre():
    occ = occupancy_from_pdp(_pdp_apercu(["2 voyageurs", "Studio", "1 lit"]))
    assert occ["guests"] == 2
    assert occ["bedrooms"] == 0
    assert occ["rooms"] == 1


def test_des_lits_ne_sont_ni_des_chambres_ni_des_voyageurs():
    occ = occupancy_from_pdp(_pdp_apercu(["4 lits", "1 salle de bain"]))
    assert occ["bedrooms"] is None
    assert occ["guests"] is None


def test_hotel_et_chambres_sont_ecartes_par_le_type_de_chambre():
    for room_type in ("Hotel room", "Private room", "Shared room"):
        assert occupancy_from_pdp(_pdp_apercu([], log={"roomType": room_type}))["dropped"], room_type
    assert occupancy_from_pdp(_pdp_apercu([], prefetch={"isHotelRatePlanEnabled": True}))["dropped"]
    assert not occupancy_from_pdp(_pdp_apercu([], log={"roomType": "Entire home/apt"}))["dropped"]


def test_chambre_d_hotes_et_insolites_sont_ecartes_mais_pas_la_cabane():
    def ecartee(titre, share=None):
        return occupancy_from_pdp(_pdp_apercu(["2 voyageurs"], titre=titre, share=share))["dropped"]

    assert ecartee("Chambre dans maison d'hôtes · Hôte : Paul")
    assert ecartee("Logement entier : tente · Hôte : Paul")
    assert ecartee("Yourte · Hôte : Paul")
    assert ecartee("Logement entier : bateau")
    assert ecartee("x", share={"propertyType": "Tipi"})
    assert not ecartee("Logement entier : cabane · Hôte : Paul")
    assert not ecartee("Logement entier : chalet · Hôte : Camping des Pins"), "le nom de l'hôte ne compte pas"
    assert not ecartee("Logement entier : appartement")


def test_merge_occupancy_pose_les_pieces_seulement_si_elles_manquent():
    occ = occupancy_from_pdp(_pdp_apercu(["2 voyageurs", "Studio"]))
    assert merge_occupancy({"id": "1", "guests": None, "bedrooms": None, "rooms": None}, occ)["rooms"] == 1
    assert merge_occupancy({"id": "1", "guests": None, "bedrooms": None, "rooms": 2}, occ)["rooms"] == 2
    assert merge_occupancy({"id": "1"}, {**occ, "dropped": True}) is None


def test_la_forme_stays_pdp_sections_se_lit_aussi():
    raw = {
        "data": {
            "presentation": {
                "stayProductDetailPage": {
                    "sections": {
                        "metadata": {
                            "loggingContext": {
                                "eventDataLogging": {
                                    "personCapacity": 5,
                                    "roomType": "Entire home/apt",
                                    "listingLat": 46.19,
                                    "listingLng": 6.77,
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    occ = occupancy_from_pdp(raw)
    assert occ["guests"] == 5
    assert occ["lat"] == 46.19
    assert occ["dropped"] is False


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
