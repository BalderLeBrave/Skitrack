"""Tests hermétiques Booking. Aucun réseau."""

from map import (
    coords_from_hotel_html,
    coords_from_html,
    is_dropped_listing,
    listings_from_html,
    stay_total_from_label,
)
from urls import search_url


def test_url_total_et_offset():
    url = search_url(
        {"destination": "Les 2 Alpes", "checkIn": "2027-02-06", "checkOut": "2027-02-13", "adults": 8},
        25,
    )
    assert "ss=Les+2+Alpes" in url or "ss=Les%202%20Alpes" in url
    assert "checkin=2027-02-06" in url
    assert "group_adults=8" in url
    assert "sb_price_type=total" in url
    assert "offset=25" in url
    assert "ht_id" in url


def test_stay_total_accepte():
    assert stay_total_from_label("1 234 €") == 1234
    assert stay_total_from_label("1234 € pour 7 nuits") == 1234


def test_stay_total_refuse_nuit_et_a_partir():
    assert stay_total_from_label("89 € /nuit") is None
    assert stay_total_from_label("À partir de 1 200 €") is None


def test_hotel_ecarte():
    assert is_dropped_listing("Hôtel Les Glaciers") is True
    assert is_dropped_listing("Appartement 8 couchages") is False


HTML = """
<div data-testid="property-card" data-hotel-id="123" data-atlas-latlng="45.0106,6.1226">
  <a href="/hotel/fr/chalet-neige.fr.html" data-testid="title">Chalet 8 personnes</a>
  <div data-testid="recommended-units">Appartement entier • 3 chambres • 8 personnes</div>
  <div data-testid="price-and-discounted-price">2 215 €</div>
  <img data-testid="image" src="https://cf.bstatic.com/x.jpg" />
</div>
<div data-testid="property-card">
  <a href="/hotel/fr/palace.fr.html" data-testid="title">Hôtel Palace</a>
  <div data-testid="price-and-discounted-price">390 € /nuit</div>
</div>
<div data-testid="property-card">
  <a href="/hotel/fr/teaser.fr.html" data-testid="title">Studio</a>
  <div data-testid="price-and-discounted-price">À partir de 800 €</div>
</div>
"""

APOLLO = """
<script data-capla-store-data="apollo">
{"basicPropertyData":{"id":"4242","pageName":"chalet-neige","location":{"latitude":45.0106,"longitude":6.1226},"occupancy":{"maxPersons":8},"numberOfBedrooms":3,"accommodationTypeName":"Appartement"}}
</script>
<div data-testid="property-card" data-hotel-id="4242">
  <a href="/hotel/fr/chalet-neige.fr.html" data-testid="title">Chalet Neige</a>
  <div data-testid="recommended-units">Appartement entier • 8 personnes</div>
  <div data-testid="price-and-discounted-price">1 890 €</div>
</div>
"""


def test_listings_from_html_total_seulement():
    rows = listings_from_html(HTML, check_in="2027-02-06", check_out="2027-02-13", adults=8, min_guests=8)
    assert len(rows) == 1
    row = rows[0]
    assert row["title"].startswith("Chalet")
    assert row["totalPrice"] == 2215
    assert row["guests"] == 8
    assert row["bedrooms"] == 3
    assert "checkin=2027-02-06" in row["url"]
    assert row["priceConfidence"] == "total_confirmed"
    assert abs(row["latitude"] - 45.0106) < 0.0001
    assert abs(row["longitude"] - 6.1226) < 0.0001


def test_gps_apollo_par_id():
    rows = listings_from_html(APOLLO, check_in="2027-02-06", check_out="2027-02-13", adults=8)
    assert len(rows) == 1
    assert abs(rows[0]["latitude"] - 45.0106) < 0.0001
    bag = coords_from_html(APOLLO)
    assert "4242" in bag
    assert "chalet-neige" in bag


def test_gps_fiche_hotel():
    html = '<div id="hotel_sidebar_static_map" data-atlas-latlng="45.009,6.122"></div>'
    pair = coords_from_hotel_html(html)
    assert pair is not None
    assert abs(pair[0] - 45.009) < 0.0001


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
