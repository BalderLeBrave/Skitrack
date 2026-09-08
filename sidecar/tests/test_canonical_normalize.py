"""Normalisation : jamais d'altitude marketing, 0 ≠ None, sources distinctes."""

from __future__ import annotations

from skitrack.scrapers.normalize import normalize
from skitrack.scrapers.sources.abritel import normalize_abritel
from skitrack.scrapers.sources.airbnb import normalize_airbnb
from skitrack.scrapers.sources.booking import normalize_booking
from skitrack.scrapers.sources.central import normalize_central
from skitrack.scrapers.sources.cozycozy import normalize_cozycozy
from skitrack.scrapers.sources.gites import normalize_gites
from skitrack.scrapers.sources.liteapi import normalize_liteapi
from skitrack.scrapers.sources.osm import normalize_osm
from skitrack.services.accommodation import upsert_canonical


def test_altitude_annonce_est_jetee():
    raw = {
        "id": "123",
        "title": "Chalet d'altitude 2000 m",
        "url": "https://www.airbnb.fr/rooms/123",
        "lat": 45.3,
        "lon": 6.6,
        "altitude_m": 2000,
        "guests": 6,
        "bedrooms": 2,
        "totalPrice": 2100,
    }
    listing = normalize_airbnb(raw)
    assert listing.altitude_m is None
    assert listing.altitude_source == "none"
    assert listing.fields_quality["altitude_m"] == "missing"
    assert listing.dist_to_nearest_lift_m is None
    assert listing.location_precision == "approximate"
    assert listing.capacity_max == 6
    assert listing.bedrooms == 2
    assert listing.price_total_eur == 2100


def test_airbnb_graphql_aliases():
    listing = normalize_airbnb(
        {
            "id": "rooms/9",
            "title": "Duplex",
            "listing": {"bedroomCount": 3, "personCapacity": 8, "lat": 45.2, "lon": 6.5},
            "url": "https://www.airbnb.fr/rooms/9",
        }
    )
    assert listing.bedrooms == 3
    assert listing.capacity_max == 8
    assert listing.location_precision == "approximate"
    assert listing.source == "airbnb_scraper"


def test_booking_number_of_bedrooms_et_note_sur_dix():
    listing = normalize_booking(
        {
            "id": "b",
            "title": "Hôtel",
            "numberOfBedrooms": 2,
            "maxPersons": 5,
            "rating": 8.4,
            "url": "https://booking.com/hotel/fr/x.html",
            "lat": 45.1,
            "lon": 6.2,
        }
    )
    assert listing.bedrooms == 2
    assert listing.capacity_max == 5
    assert listing.rating == 8.4
    assert listing.rating_scale == 10
    assert listing.source == "booking_scraper"
    assert listing.location_precision == "exact"


def test_abritel_bedroom_count():
    listing = normalize_abritel(
        {"id": "p1", "title": "Chalet", "bedRoomCount": 4, "guestCapacity": 10, "lat": 45.0, "lon": 6.0}
    )
    assert listing.bedrooms == 4
    assert listing.capacity_max == 10
    assert listing.source == "abritel_scraper"
    assert listing.location_precision == "approximate"


def test_gites_precision_adresse():
    listing = normalize_gites(
        {"id": "38G1", "title": "Gîte", "chambres": 3, "personnes": 8, "lat": 45.1, "lon": 6.1}
    )
    assert listing.source == "gites_de_france"
    assert listing.location_precision == "address"
    assert listing.bedrooms == 3
    assert listing.capacity_max == 8


def test_zero_zero_n_est_pas_un_gps():
    listing = normalize_booking(
        {
            "id": "b0",
            "title": "Chalet",
            "url": "https://booking.com/hotel/fr/x.html",
            "lat": 0,
            "lon": 0,
            "maxPersons": 8,
        }
    )
    assert listing.lat is None
    assert listing.lon is None
    assert listing.location_precision == "unknown"


def test_liteapi_note_sur_dix():
    listing = normalize_liteapi({"id": "h1", "title": "Hôtel", "occupancy": 4, "rating": 8.1, "lat": 45.0, "lon": 6.0})
    assert listing.source == "liteapi"
    assert listing.capacity_max == 4
    assert listing.rating_scale == 10
    assert listing.location_precision == "exact"


def test_osm_beds_pas_de_prix():
    listing = normalize_osm({"id": "node/1", "title": "Chalet", "beds": 6, "rooms": 3, "lat": 45.0, "lon": 6.0})
    assert listing.source == "osm"
    assert listing.capacity_source == "osm"
    assert listing.capacity_max == 6
    assert listing.price_total_eur is None


def test_centrale_source_prefixe():
    listing = normalize_central({"id": "c1", "title": "Résidence", "rooms": 4, "pers": 8}, engine="ceto")
    assert listing.source == "central:ceto"
    assert listing.capacity_max == 8


def test_cozycozy_porte():
    listing = normalize_cozycozy({"id": "cz", "title": "Appart", "guests": 4, "lat": 45.0, "lon": 6.0})
    assert listing.source == "cozycozy_scraper"
    assert listing.location_precision == "approximate"


def test_adults_plus_children():
    listing = normalize({"id": "x", "title": "Chalet", "adults": 4, "children": 2, "source": "airbnb"})
    assert listing.capacity_max == 6


def test_zero_n_est_pas_une_capacite():
    listing = normalize({"id": "x", "title": "Studio", "guests": 0, "bedrooms": 0, "source": "booking-web"})
    assert listing.capacity_max is None
    assert listing.bedrooms is None
    assert listing.fields_quality["capacity_max"] == "missing"
    assert listing.fields_quality["bedrooms"] == "missing"


def test_studio_une_piece_zero_chambre():
    listing = normalize({"id": "s", "title": "Studio", "rooms": 1, "source": "ceto"})
    assert listing.bedrooms == 0


def test_booking_note_sur_dix():
    listing = normalize_booking({"id": "b", "title": "Hôtel", "rating": 8.4, "url": "https://booking.com/hotel/fr/x.html"})
    assert listing.rating == 8.4
    assert listing.rating_scale == 10
    assert listing.source == "booking_scraper"


def test_upsert_ne_recopie_pas_l_altitude_marketing(db):
    listing = normalize_airbnb(
        {"id": "99", "title": "Chalet", "url": "https://airbnb.fr/rooms/99", "lat": 45.2, "lon": 6.5, "guests": 4}
    )
    listing.altitude_m = 1850  # ce qu'un parser mal élevé aurait copié
    listing.altitude_source = "none"
    from skitrack.db.session import session_scope

    with session_scope() as session:
        row = upsert_canonical(session, listing)
        assert row.altitude_m is None
        listing.altitude_source = "ign"
        listing.altitude_m = 1720
        row = upsert_canonical(session, listing)
        assert row.altitude_m == 1720
        assert row.altitude_source == "ign"
        assert row.capacity_max == 4


def test_quatre_sources_memes_champs():
    raws = [
        normalize_airbnb({"id": "a", "title": "A", "bedroomCount": 2, "personCapacity": 6}),
        normalize_booking({"id": "b", "title": "B", "numberOfBedrooms": 2, "maxPersons": 6}),
        normalize_gites({"id": "g", "title": "G", "chambres": 2, "personnes": 6}),
        normalize_liteapi({"id": "l", "title": "L", "occupancy": 6, "bedrooms": 2}),
    ]
    keys = {tuple(sorted(item.model_dump().keys())) for item in raws}
    assert len(keys) == 1
    assert all(item.capacity_max == 6 for item in raws)
    assert all(item.altitude_m is None for item in raws)
    assert all(item.dist_to_nearest_lift_m is None for item in raws)
