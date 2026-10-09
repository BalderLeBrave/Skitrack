"""Tests hermétiques Booking. Aucun réseau."""

from map import (
    coords_from_hotel_html,
    coords_from_html,
    is_dropped_listing,
    listings_from_html,
    note_de_tuile,
    occupancy_from_text,
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
    rows = listings_from_html(HTML, check_in="2027-02-06", check_out="2027-02-13", adults=8)
    chalet = next(r for r in rows if r["title"].startswith("Chalet"))
    assert chalet["totalPrice"] == 2215
    assert chalet["capacity"] == 8
    assert chalet["bedrooms"] == 3
    assert "checkin=2027-02-06" in chalet["url"]
    assert chalet["priceConfidence"] == "total_confirmed"
    assert chalet["priceIndicative"] is False
    assert abs(chalet["latitude"] - 45.0106) < 0.0001
    assert abs(chalet["longitude"] - 6.1226) < 0.0001
    # Pas de note écrite sur cette tuile : on n'en fabrique pas.
    assert chalet["rating"] is None
    assert chalet["reviewCount"] is None
    # L'hôtel reste écarté : la source elle-même le met hors périmètre.
    assert not [r for r in rows if r["title"].startswith("Hôtel")]


def test_note_de_tuile_seulement_si_echelle_ecrite():
    assert note_de_tuile("8,6 / 10 · 120 avis") == (8.6, 120)
    assert note_de_tuile("8,6") == (None, None)
    assert note_de_tuile("8,6 sur 5") == (None, None)
    html = """
    <div data-testid="property-card" data-hotel-id="9">
      <a href="/hotel/fr/chalet-note.fr.html" data-testid="title">Chalet noté</a>
      <div data-testid="recommended-units">Appartement entier • 2 chambres • 6 personnes</div>
      <div data-testid="review-score">8,4 / 10 · 37 expériences vécues</div>
      <div data-testid="price-and-discounted-price">900 €</div>
    </div>
    <div data-testid="property-card" data-hotel-id="10">
      <a href="/hotel/fr/chalet-badge.fr.html" data-testid="title">Chalet badge</a>
      <div data-testid="recommended-units">Appartement entier • 1 chambre • 4 personnes</div>
      <div data-testid="review-score">9,1</div>
      <div data-testid="price-and-discounted-price">700 €</div>
    </div>
    """
    rows = listings_from_html(html)
    note = next(r for r in rows if r["sourceId"] == "9")
    badge = next(r for r in rows if r["sourceId"] == "10")
    assert note["rating"] == 8.4
    assert note["reviewCount"] == 37
    assert badge["rating"] is None
    assert badge["reviewCount"] is None


def test_prix_indicatif_reste_dans_la_liste():
    """« À partir de » n'est pas un total de séjour, mais ce n'est pas un motif
    de disparition : l'annonce sort à zéro, avec son libellé et son drapeau."""
    rows = listings_from_html(HTML, check_in="2027-02-06", check_out="2027-02-13", adults=8)
    studio = next(r for r in rows if r["title"] == "Studio")
    assert studio["totalPrice"] == 0
    assert studio["priceIndicative"] is True
    assert studio["priceLabel"] == "À partir de 800 €"
    assert studio["availabilityStatus"] == "unpriced"
    assert studio["rooms"] == 1
    assert studio["bedrooms"] == 0


def test_gps_apollo_par_id():
    rows = listings_from_html(APOLLO, check_in="2027-02-06", check_out="2027-02-13", adults=8)
    assert len(rows) == 1
    assert abs(rows[0]["latitude"] - 45.0106) < 0.0001
    # La tuile se joint par `data-hotel-id` : le type et les chambres publiés
    # sous `pageName` doivent la rejoindre, ils n'y arrivaient jamais.
    assert rows[0]["propertyType"] == "Appartement"
    assert rows[0]["bedrooms"] == 3
    bag = coords_from_html(APOLLO)
    assert "4242" in bag
    assert "chalet-neige" in bag


CHAMBRE = """
<div data-testid="property-card" data-hotel-id="777">
  <a href="/hotel/fr/residence-jandri.fr.html" data-testid="title">Résidence Jandri</a>
  <div data-testid="recommended-units">Chambre Double (2 personnes) • 1 lit double</div>
  <div data-testid="price-and-discounted-price">2 480 €</div>
</div>
"""


def test_capacite_d_une_chambre_n_est_pas_celle_du_logement():
    """Le cas nommé : « Chambre Double (2 personnes) » est la capacité d'une
    offre, pas celle du bien. Elle ne doit ni être posée sur l'annonce, ni la
    faire disparaître d'une recherche à huit."""
    rows = listings_from_html(CHAMBRE, check_in="2027-02-06", check_out="2027-02-13", adults=8)
    assert len(rows) == 1
    assert rows[0]["capacity"] is None
    assert rows[0]["totalPrice"] == 2480


def test_pieces_ne_sont_pas_des_chambres():
    assert occupancy_from_text("Appartement 3 pièces 8 personnes") == (8, None, 3)
    assert occupancy_from_text("T3 6 personnes") == (6, None, 3)
    assert occupancy_from_text("STUDIO CABINE 4 pers.") == (4, 0, 1)
    assert occupancy_from_text("Chalet 3 chambres 8 personnes") == (8, 3, None)


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


def test_la_source_dit_d_ou_vient_la_valeur():
    apollo = listings_from_html(APOLLO, check_in="2027-02-06", check_out="2027-02-13", adults=2)[0]
    assert (apollo["capacitySource"], apollo["bedroomsSource"]) == ("structured", "structured")
    rows = listings_from_html(HTML, check_in="2027-02-06", check_out="2027-02-13", adults=8)
    chalet = next(r for r in rows if r["title"].startswith("Chalet"))
    assert (chalet["capacitySource"], chalet["bedroomsSource"]) == ("text_regex", "text_regex")
    assert chalet["title"] in chalet["textes"], "Node relit le nom de la tuile"
