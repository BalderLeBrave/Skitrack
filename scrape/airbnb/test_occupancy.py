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
