"""Tests hermétiques occupancy STL/PDP. Aucun réseau."""

from occupancy import merge_occupancy, occupancy_from_pdp


def _raw(**over):
    rec = {
        "data": {
            "merlin": {
                "pdpSections": {
                    "metadata": {
                        "loggingContext": {
                            "eventDataLogging": {
                                "personCapacity": 8,
                                "roomType": "Entire home/apt",
                            }
                        },
                        "sharingConfig": {"personCapacity": 8},
                        "bookingPrefetchData": {"isHotelRatePlanEnabled": False},
                    }
                }
            }
        }
    }
    rec.update(over)
    return rec


def test_person_capacity():
    occ = occupancy_from_pdp(_raw())
    assert occ["guests"] == 8
    assert occ["room_type"] == "Entire home/apt"
    assert occ["dropped"] is False


def test_hotel_ecarte():
    raw = _raw()
    raw["data"]["merlin"]["pdpSections"]["metadata"]["bookingPrefetchData"][
        "isHotelRatePlanEnabled"
    ] = True
    occ = occupancy_from_pdp(raw)
    assert occ["dropped"] is True


def test_chambre_privee_ecartee():
    raw = _raw()
    raw["data"]["merlin"]["pdpSections"]["metadata"]["loggingContext"]["eventDataLogging"][
        "roomType"
    ] = "Private room"
    occ = occupancy_from_pdp(raw)
    assert occ["dropped"] is True


def test_merge_complete_guests_sans_inventer_le_prix():
    listing = {"id": "1", "name": "Chalet", "total": 1775, "guests": None, "bedrooms": 3}
    merged = merge_occupancy(listing, occupancy_from_pdp(_raw()))
    assert merged is not None
    assert merged["guests"] == 8
    assert merged["total"] == 1775
    assert merged["bedrooms"] == 3


def test_merge_hotel_supprime_l_annonce():
    listing = {"id": "1", "name": "Hotel", "total": 3900, "guests": None}
    raw = _raw()
    raw["data"]["merlin"]["pdpSections"]["metadata"]["bookingPrefetchData"][
        "isHotelRatePlanEnabled"
    ] = True
    assert merge_occupancy(listing, occupancy_from_pdp(raw)) is None


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
