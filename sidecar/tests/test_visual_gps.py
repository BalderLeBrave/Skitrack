"""GPS visuel : Lens → fiche Gîtes/Booking, OSM vote, jamais le centroïde."""

from __future__ import annotations

import asyncio

from skitrack.services.geo_math import haversine_m
from skitrack.services.visual_gps import (
    MAX_FROM_APPROX_M,
    NEAR_M,
    NEED_NAME_M,
    OSM_DENSE_MIN,
    OsmHit,
    _geocode_published_address,
    _name_is_specific,
    _skip_url,
    accept_point,
    apply_osm_enrichment,
    fallback_osm,
    name_verdict,
    osm_named_neighbors,
    osm_rooms_as_bedrooms,
    parse_abritel,
    parse_booking,
    parse_candidate,
    parse_gites_de_france,
    parse_schema_geo,
    photo_is_stock,
    resolve_exact_coords,
    search_lens,
    unique_osm_in_bbox,
    unique_osm_match,
    validate_distance,
    ParsedPoint,
)

GITES_HTML = """
<script type="application/ld+json">
{"@type":"LodgingBusiness","name":"Chalet les Copains",
 "url":"https://www.gites-de-france.com/fr/isere/chalet-les-copains-38g253122",
 "geo":{"@type":"GeoCoordinates","latitude":45.0106,"longitude":6.1226},
 "address":{"streetAddress":"3 place de l'Église","postalCode":"38860","addressLocality":"Les Deux Alpes"}}
</script>
"""

BOOKING_HTML = """
<meta property="og:latitude" content="45.0108">
<meta property="og:longitude" content="6.1224">
<div data-atlas-latlng="45.0108,6.1224"></div>
<script>booking.env.b_map_center_latitude=45.0108;booking.env.b_map_center_longitude=6.1224;</script>
"""

BOOKING_APOLLO = """
<script type="application/json" data-capla-store-data="apollo">
{"basicPropertyData":{"pageName":"chalet-neige","name":"Chalet Neige",
 "location":{"latitude":45.0107,"longitude":6.1225},
 "occupancy":{"maxPersons":8},"accommodationTypeName":"Chalet"},
 "SkiLift:1":{"location":{"latitude":0,"longitude":0}}}
</script>
"""

BOOKING_ZERO = """
<script type="application/ld+json">
{"@type":"Hotel","geo":{"latitude":0,"longitude":0}}
</script>
<div data-atlas-latlng="0,0"></div>
"""
BOOKING_STATION_MAP = """
<script>booking.env.b_map_center_latitude=45.268;booking.env.b_map_center_longitude=6.171;</script>
"""
PLACE_HTML = """
<script type="application/ld+json">
{"@type":"Place","name":"Les Deux Alpes","geo":{"latitude":45.268,"longitude":6.171}}
</script>
"""
HAMEAU_HTML = """
<script type="application/ld+json">
{"@type":"LodgingBusiness","name":"Résidence Le Hameau des Arolles",
 "geo":{"@type":"GeoCoordinates","latitude":45.0156,"longitude":6.1230}}
</script>
"""
EDELWEISS_NEAR_HTML = """
<script type="application/ld+json">
{"@type":"Hotel","name":"Chalet Edelweiss",
 "geo":{"latitude":45.0136,"longitude":6.1230}}
</script>
"""
COPAINS_FAR_HTML = """
<script type="application/ld+json">
{"@type":"LodgingBusiness","name":"Chalet les Copains",
 "geo":{"@type":"GeoCoordinates","latitude":45.0156,"longitude":6.1226}}
</script>
"""
CITY_ONLY_HTML = """
<script type="application/ld+json">
{"@type":"LodgingBusiness","name":"Chalet les Copains",
 "address":{"addressLocality":"Les Deux Alpes","postalCode":"38860"}}
</script>
"""
NORTH_HTML = """
<meta property="og:latitude" content="45.0102">
<meta property="og:longitude" content="6.1230">
<script type="application/ld+json">
{"@type":"Hotel","name":"Chalet Nord","geo":{"latitude":45.0102,"longitude":6.1230}}
</script>
"""
SOUTH_HTML = """
<script type="application/ld+json">
{"@type":"LodgingBusiness","name":"Chalet Sud",
 "geo":{"latitude":45.0138,"longitude":6.1230}}
</script>
"""
STOCK_A = """
<meta property="og:latitude" content="45.0108">
<meta property="og:longitude" content="6.1224">
"""
STOCK_B = """
<meta property="og:latitude" content="45.0144">
<meta property="og:longitude" content="6.1224">
"""
STOCK_C = """
<script type="application/ld+json">
{"@type":"LodgingBusiness","name":"Chalet Catalogue",
 "geo":{"latitude":45.0072,"longitude":6.1224}}
</script>
"""
ABRITEL_HTML = """
<script type="application/ld+json">
{"@type":"Accommodation","geo":{"latitude":45.2974,"longitude":6.5849}}
</script>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"listingModel":{"latitude":45.2974,"longitude":6.5849,"propertyId":"p1"}}}}
</script>
"""

PAGES = {
    "https://www.gites-de-france.com/fr/isere/chalet-les-copains-38g253122": GITES_HTML,
    "https://www.booking.com/hotel/fr/chalet-neige.fr.html": BOOKING_HTML,
    "https://www.booking.com/hotel/fr/chalet-apollo.fr.html": BOOKING_APOLLO,
    "https://www.abritel.fr/p1": ABRITEL_HTML,
    "https://www.paris.fr/hotel": """<script type="application/ld+json">
        {"@type":"Hotel","geo":{"latitude":48.8566,"longitude":2.3522}}
        </script>""",
    "https://www.gites-de-france.com/fr/isere/hameau-38g111111": HAMEAU_HTML,
    "https://www.booking.com/hotel/fr/edelweiss.fr.html": EDELWEISS_NEAR_HTML,
    "https://www.gites-de-france.com/fr/isere/copains-loin-38g222222": COPAINS_FAR_HTML,
    "https://www.gites-de-france.com/fr/isere/ville-38g333333": CITY_ONLY_HTML,
    "https://www.booking.com/hotel/fr/nord.fr.html": NORTH_HTML,
    "https://www.gites-de-france.com/fr/isere/sud-38g444444": SOUTH_HTML,
    "https://www.booking.com/hotel/fr/stock-a.fr.html": STOCK_A,
    "https://www.booking.com/hotel/fr/stock-b.fr.html": STOCK_B,
    "https://www.gites-de-france.com/fr/isere/stock-38g555555": STOCK_C,
}


async def _fake_lens(url: str, **kwargs):
    params = kwargs.get("params") or {}
    photo = params.get("url") or ""
    if "facade" in photo:
        return {
            "visual_matches": [
                {"link": "https://www.booking.com/hotel/fr/chalet-neige.fr.html", "title": "Chalet Neige"},
                {"link": "https://www.pinterest.com/pin/1", "title": "pin"},
                {"link": "https://www.airbnb.fr/rooms/9", "title": "airbnb"},
            ]
        }
    if "gitespic" in photo:
        return {
            "visual_matches": [
                {
                    "link": "https://www.gites-de-france.com/fr/isere/chalet-les-copains-38g253122",
                    "title": "Les Copains",
                }
            ]
        }
    if "vote" in photo:
        return {
            "visual_matches": [
                {"link": "https://www.booking.com/hotel/fr/chalet-neige.fr.html", "title": "Booking"},
                {
                    "link": "https://www.gites-de-france.com/fr/isere/chalet-les-copains-38g253122",
                    "title": "Gîtes",
                },
            ]
        }
    if "paris" in photo:
        return {
            "visual_matches": [
                {"link": "https://www.paris.fr/hotel", "title": "Hôtel de Ville"},
            ]
        }
    if "hameau" in photo:
        return {
            "visual_matches": [
                {
                    "link": "https://www.gites-de-france.com/fr/isere/hameau-38g111111",
                    "title": "Chalet les Copains",
                }
            ]
        }
    if "voisin" in photo:
        return {
            "visual_matches": [
                {"link": "https://www.booking.com/hotel/fr/edelweiss.fr.html", "title": "Chalet les Copains"},
            ]
        }
    if "namedfar" in photo:
        return {
            "visual_matches": [
                {
                    "link": "https://www.gites-de-france.com/fr/isere/copains-loin-38g222222",
                    "title": "Chalet les Copains",
                }
            ]
        }
    if "stockpic" in photo:
        return {
            "visual_matches": [
                {"link": "https://www.booking.com/hotel/fr/stock-a.fr.html", "title": "salon"},
                {"link": "https://www.booking.com/hotel/fr/stock-b.fr.html", "title": "salon"},
                {
                    "link": "https://www.gites-de-france.com/fr/isere/stock-38g555555",
                    "title": "salon",
                },
            ]
        }
    if "twins" in photo:
        return {
            "visual_matches": [
                {"link": "https://www.booking.com/hotel/fr/nord.fr.html", "title": "Nord"},
                {
                    "link": "https://www.gites-de-france.com/fr/isere/sud-38g444444",
                    "title": "Sud",
                },
            ]
        }
    if "serp" in photo:
        return {
            "visual_matches": [
                {
                    "link": "https://www.booking.com/searchresults.fr.html?ss=Les+Deux+Alpes",
                    "title": "Les 2 Alpes",
                },
                {"link": "https://www.booking.com/city/fr/les-deux-alpes.html", "title": "Ville"},
                {
                    "link": "https://www.gites-de-france.com/fr/auvergne-rhone-alpes",
                    "title": "Isère",
                },
                {"link": "https://www.google.com/maps/place/Les+2+Alpes", "title": "Maps"},
            ]
        }
    if "cityonly" in photo:
        return {
            "visual_matches": [
                {
                    "link": "https://www.gites-de-france.com/fr/isere/ville-38g333333",
                    "title": "Les Copains",
                }
            ]
        }
    return {"visual_matches": []}


async def _fake_html(url: str) -> str:
    return PAGES.get(url, "")


async def _fake_overpass(url: str, **kwargs):
    return {
        "elements": [
            {
                "type": "way",
                "center": {"lat": 45.0105, "lon": 6.1225},
                "tags": {"name": "Chalet les Copains", "building": "yes", "tourism": "chalet", "rooms": "3", "beds": "8"},
            }
        ]
    }


async def _fake_overpass_twins(url: str, **kwargs):
    return {
        "elements": [
            {
                "type": "way",
                "center": {"lat": 45.0106, "lon": 6.1226},
                "tags": {"name": "Chalet les Copains", "building": "yes"},
            },
            {
                "type": "way",
                "center": {"lat": 45.0112, "lon": 6.1226},
                "tags": {"name": "Chalet les Copains", "building": "yes"},
            },
        ]
    }


async def _must_not_geocode(*_a, **_k):
    raise AssertionError("BAN city-only must not geocode")


def _blur(**extra):
    base = {
        "listing_id": "rooms/1",
        "source_origine": "abritel",
        "lat": 45.0120,
        "lng": 6.1230,
        "domain_lat": 45.01,
        "domain_lon": 6.12,
    }
    base.update(extra)
    return base


def test_parseurs_publient_un_vrai_point():
    g = parse_gites_de_france(GITES_HTML)
    assert g is not None
    assert g.source == "gites"
    assert abs(g.lat - 45.0106) < 1e-4
    assert "Église" in (g.address or "")

    b = parse_booking(BOOKING_HTML)
    assert b is not None
    assert abs(b.lat - 45.0108) < 1e-4

    assert parse_booking(BOOKING_ZERO) is None
    assert parse_booking(BOOKING_STATION_MAP) is None
    assert parse_schema_geo(PLACE_HTML) is None
    assert parse_gites_de_france(PLACE_HTML) is None
    assert parse_booking(PLACE_HTML) is None

    apollo = parse_booking(BOOKING_APOLLO)
    assert apollo is not None
    assert abs(apollo.lat - 45.0107) < 1e-4
    assert apollo.name == "Chalet Neige"

    a = parse_abritel(ABRITEL_HTML)
    assert a is not None
    assert abs(a.lon - 6.5849) < 1e-4

    assert parse_candidate("https://www.booking.com/hotel/fr/x.html", BOOKING_HTML).source == "booking"


def test_distance_1000_m():
    assert validate_distance(45.0106, 6.1226, 45.0146, 6.1226) is not None
    assert validate_distance(45.0106, 6.1226, 45.055, 6.1226) is None
    assert validate_distance(0, 0, 45.01, 6.12) is None


def test_nom_generique_refuse():
    assert _name_is_specific("Chalet") is False
    assert _name_is_specific("Chalet les Copains") is True
    assert _name_is_specific("Appartement") is False
    assert _name_is_specific("Résidence Le Hameau") is False


def test_name_verdict_ne_prend_pas_le_titre_lens():
    assert name_verdict("Chalet les Copains", "Chalet les Copains") == "match"
    assert name_verdict("Chalet les Copains", "Résidence Le Hameau des Arolles") == "conflict"
    assert name_verdict("Chalet", "Chalet Edelweiss") == "unknown"
    assert name_verdict("Chalet les Copains", None) == "unknown"


def test_accept_point_politique():
    assert accept_point(80, "unknown", 1) is True
    assert accept_point(80, "conflict", 1) is False
    assert accept_point(80, "conflict", 2) is True
    assert accept_point(400, "unknown", 1) is False
    assert accept_point(400, "match", 1) is True
    assert accept_point(400, "conflict", 1) is False
    assert accept_point(800, "match", 1) is False
    assert accept_point(800, "match", 2) is True
    assert 150 <= NEAR_M < NEED_NAME_M <= MAX_FROM_APPROX_M


def test_accept_point_hameau_dense():
    assert accept_point(80, "unknown", 1, 0) is True
    assert accept_point(80, "unknown", 1, OSM_DENSE_MIN + 1) is False
    assert accept_point(80, "match", 1, OSM_DENSE_MIN + 1) is True
    assert accept_point(80, "unknown", 2, OSM_DENSE_MIN + 1) is True


def test_skip_serp_et_catalogue():
    assert _skip_url("https://www.booking.com/searchresults.fr.html?ss=2alpes") is True
    assert _skip_url("https://www.booking.com/city/fr/les-deux-alpes.html") is True
    assert _skip_url("https://www.gites-de-france.com/fr/auvergne-rhone-alpes") is True
    assert _skip_url("https://www.google.com/maps/place/Les+2+Alpes") is True
    assert _skip_url("https://www.booking.com/hotel/fr/chalet-neige.fr.html") is False
    assert _skip_url("https://www.gites-de-france.com/fr/isere/chalet-les-copains-38g253122") is False


def test_photo_catalogue_trois_clusters():
    pts = [
        (ParsedPoint(45.0108, 6.1224, "booking"), 140.0),
        (ParsedPoint(45.0144, 6.1224, "booking"), 270.0),
        (ParsedPoint(45.0072, 6.1224, "gites"), 530.0),
    ]
    assert photo_is_stock(pts) is True
    assert photo_is_stock(pts[:2]) is False


def test_lens_ignore_airbnb_et_pinterest():
    rows = asyncio.run(search_lens("https://img.example/facade.jpg", fetch_json=_fake_lens, api_key="x"))
    assert len(rows) == 1
    assert "booking.com" in rows[0]["link"]


def test_lens_ignore_searchresults_et_pages_ville():
    rows = asyncio.run(search_lens("https://img.example/serp.jpg", fetch_json=_fake_lens, api_key="x"))
    assert rows == []


def test_match_booking_dans_le_cercle():
    out = asyncio.run(
        resolve_exact_coords(
            _blur(photos=["https://img.example/facade.jpg"], name="Chalet Neige"),
            fetch_json=_fake_lens,
            fetch_text=_fake_html,
            api_key="x",
        )
    )
    assert out["source_resolution"] == "google_lens_booking"
    assert out["confidence_score"] == "high"
    assert abs(out["lat_exacte"] - 45.0108) < 1e-4
    assert out["source_origine"] == "abritel"


def test_match_paris_jete_quand_le_cercle_est_aux_2_alpes():
    out = asyncio.run(
        resolve_exact_coords(
            {
                "listing_id": "rooms/2",
                "source": "airbnb",
                "lat": 45.0120,
                "lng": 6.1230,
                "photos": ["https://img.example/paris.jpg"],
                "domain_lat": 45.01,
                "domain_lon": 6.12,
            },
            fetch_json=_fake_lens,
            fetch_text=_fake_html,
            api_key="x",
        )
    )
    assert out["source_resolution"] == "none"
    assert out["confidence_score"] == "low"
    assert abs(out["lat_exacte"] - 45.0120) < 1e-4


def test_osm_fallback_nom_strict():
    point = asyncio.run(
        fallback_osm("Chalet les Copains", 45.0106, 6.1226, fetch_json=_fake_overpass)
    )
    assert point is not None
    assert point.source == "osm"
    assert abs(point.lat - 45.0105) < 1e-4

    assert asyncio.run(fallback_osm("Chalet", 45.0106, 6.1226, fetch_json=_fake_overpass)) is None


def test_osm_jumeaux_meme_nom():
    assert asyncio.run(
        fallback_osm("Chalet les Copains", 45.0106, 6.1226, fetch_json=_fake_overpass_twins)
    ) is None


def test_sans_match_garde_le_cercle_pas_le_domaine():
    out = asyncio.run(
        resolve_exact_coords(
            {
                "listing_id": "p9",
                "source_origine": "abritel",
                "lat": 45.297,
                "lng": 6.580,
                "photos": [],
                "name": "Chalet",
                "domain_lat": 45.30,
                "domain_lon": 6.58,
            },
            fetch_json=_fake_lens,
            fetch_text=_fake_html,
            api_key="x",
        )
    )
    assert out["source_resolution"] == "none"
    assert out["lat_exacte"] == 45.297
    assert out["lng_exacte"] == 6.580


def test_zero_zero_n_est_pas_rendu():
    out = asyncio.run(
        resolve_exact_coords(
            {
                "listing_id": "b0",
                "source_origine": "booking",
                "lat": 0,
                "lng": 0,
                "photos": [],
                "domain_lat": 45.01,
                "domain_lon": 6.12,
            },
            fetch_json=_fake_lens,
            fetch_text=_fake_html,
            api_key="x",
        )
    )
    assert out["lat_exacte"] is None
    assert out["source_resolution"] == "none"


def test_lens_gites():
    out = asyncio.run(
        resolve_exact_coords(
            {
                "listing_id": "rooms/g",
                "source": "airbnb",
                "lat": 45.0110,
                "lng": 6.1230,
                "photos": ["https://img.example/gitespic.jpg"],
                "domain_lat": 45.01,
                "domain_lon": 6.12,
            },
            fetch_json=_fake_lens,
            fetch_text=_fake_html,
            api_key="x",
        )
    )
    assert out["source_resolution"] == "google_lens_gites"
    assert out["confidence_score"] == "high"
    assert abs(out["lat_exacte"] - 45.0106) < 1e-4


def test_deux_sources_votent_le_meme_batiment():
    out = asyncio.run(
        resolve_exact_coords(
            {
                "listing_id": "rooms/v",
                "source_origine": "abritel",
                "lat": 45.0107,
                "lng": 6.1225,
                "photos": ["https://img.example/vote.jpg"],
                "domain_lat": 45.01,
                "domain_lon": 6.12,
            },
            fetch_json=_fake_lens,
            fetch_text=_fake_html,
            api_key="x",
        )
    )
    assert out["confidence_score"] == "high"
    assert out["source_resolution"] in {"google_lens_booking", "google_lens_gites"}
    assert abs(out["lat_exacte"] - 45.01) < 0.01


def test_osm_via_resolve_sans_lens():
    out = asyncio.run(
        resolve_exact_coords(
            {
                "listing_id": "rooms/osm",
                "source": "airbnb",
                "lat": 45.0106,
                "lng": 6.1226,
                "photos": [],
                "name": "Chalet les Copains",
                "domain_lat": 45.01,
                "domain_lon": 6.12,
            },
            fetch_json=_fake_overpass,
            fetch_text=_fake_html,
        )
    )
    assert out["source_resolution"] == "osm"
    assert out["confidence_score"] == "high"
    assert abs(out["lat_exacte"] - 45.0105) < 1e-4


def test_nom_different_a_400_m_garde_le_cercle():
    dist = haversine_m(45.0120, 6.1230, 45.0156, 6.1230)
    assert 350 < dist < 500
    out = asyncio.run(
        resolve_exact_coords(
            _blur(
                listing_id="rooms/h",
                photos=["https://img.example/hameau.jpg"],
                name="Chalet les Copains",
            ),
            fetch_json=_fake_lens,
            fetch_text=_fake_html,
            api_key="x",
        )
    )
    assert out["source_resolution"] == "none"
    assert abs(out["lat_exacte"] - 45.0120) < 1e-4


def test_voisin_nomme_dans_le_cercle_refuse():
    dist = haversine_m(45.0120, 6.1230, 45.0136, 6.1230)
    assert dist < NEAR_M
    out = asyncio.run(
        resolve_exact_coords(
            _blur(
                listing_id="rooms/e",
                photos=["https://img.example/voisin.jpg"],
                name="Chalet les Copains",
            ),
            fetch_json=_fake_lens,
            fetch_text=_fake_html,
            api_key="x",
        )
    )
    assert out["source_resolution"] == "none"
    assert abs(out["lat_exacte"] - 45.0120) < 1e-4


def test_vrai_match_nomme_a_400_m():
    out = asyncio.run(
        resolve_exact_coords(
            _blur(
                listing_id="rooms/ok",
                photos=["https://img.example/namedfar.jpg"],
                name="Chalet les Copains",
            ),
            fetch_json=_fake_lens,
            fetch_text=_fake_html,
            api_key="x",
        )
    )
    assert out["source_resolution"] == "google_lens_gites"
    assert abs(out["lat_exacte"] - 45.0156) < 1e-4
    assert out["confidence_score"] == "medium"


def test_photo_catalogue_garde_le_cercle():
    out = asyncio.run(
        resolve_exact_coords(
            _blur(listing_id="rooms/s", photos=["https://img.example/stockpic.jpg"], name="Chalet"),
            fetch_json=_fake_lens,
            fetch_text=_fake_html,
            api_key="x",
        )
    )
    assert out["source_resolution"] == "none"
    assert abs(out["lat_exacte"] - 45.0120) < 1e-4


def test_deux_clusters_egaux_garde_le_cercle():
    d_ab = haversine_m(45.0102, 6.1230, 45.0138, 6.1230)
    d_a = haversine_m(45.0120, 6.1230, 45.0102, 6.1230)
    d_b = haversine_m(45.0120, 6.1230, 45.0138, 6.1230)
    assert d_ab > 300
    assert d_a < NEED_NAME_M and d_b < NEED_NAME_M
    out = asyncio.run(
        resolve_exact_coords(
            _blur(listing_id="rooms/t", photos=["https://img.example/twins.jpg"]),
            fetch_json=_fake_lens,
            fetch_text=_fake_html,
            api_key="x",
        )
    )
    assert out["source_resolution"] == "none"
    assert abs(out["lat_exacte"] - 45.0120) < 1e-4


def test_ban_ignore_chef_lieu():
    out = asyncio.run(
        _geocode_published_address(
            CITY_ONLY_HTML,
            domain_lat=45.01,
            domain_lon=6.12,
            geocode_fn=_must_not_geocode,
        )
    )
    assert out is None

    pinned = asyncio.run(
        resolve_exact_coords(
            _blur(
                listing_id="rooms/c",
                photos=["https://img.example/cityonly.jpg"],
                name="Chalet les Copains",
            ),
            fetch_json=_fake_lens,
            fetch_text=_fake_html,
            geocode_fn=_must_not_geocode,
            api_key="x",
        )
    )
    assert pinned["source_resolution"] == "none"
    assert abs(pinned["lat_exacte"] - 45.0120) < 1e-4


async def _fake_lens_and_osm(url: str, **kwargs):
    params = kwargs.get("params") or {}
    if params.get("data") or "overpass" in url:
        return await _fake_overpass(url, **kwargs)
    return await _fake_lens(url, **kwargs)


DENSE_OSM = {
    "elements": [
        {"center": {"lat": 45.0121, "lon": 6.1230}, "tags": {"name": "Chalet Alpha", "tourism": "chalet"}},
        {"center": {"lat": 45.0122, "lon": 6.1231}, "tags": {"name": "Chalet Beta", "tourism": "chalet"}},
        {"center": {"lat": 45.0118, "lon": 6.1229}, "tags": {"name": "Chalet Gamma", "tourism": "chalet"}},
        {"center": {"lat": 45.0120, "lon": 6.1232}, "tags": {"name": "Chalet Delta", "tourism": "chalet"}},
    ]
}


async def _fake_dense(url: str, **kwargs):
    params = kwargs.get("params") or {}
    if params.get("data") or "overpass" in url:
        return DENSE_OSM
    return await _fake_lens(url, **kwargs)


def test_osm_voisinage_et_jumeau():
    hits = [
        OsmHit(45.0105, 6.1225, name="Chalet les Copains"),
        OsmHit(45.0121, 6.1230, name="Chalet Alpha"),
        OsmHit(45.0122, 6.1231, name="Chalet Beta"),
        OsmHit(45.0119, 6.1229, name="Chalet Gamma"),
    ]
    assert osm_named_neighbors(hits, 45.0120, 6.1230) >= 3
    assert unique_osm_match(hits, "Chalet les Copains", 45.0106, 6.1226) is not None
    twins = hits + [OsmHit(45.0108, 6.1225, name="Chalet les Copains")]
    assert unique_osm_match(twins, "Chalet les Copains", 45.0106, 6.1226) is None


def test_lens_anonyme_refuse_si_hameau_dense():
    out = asyncio.run(
        resolve_exact_coords(
            _blur(photos=["https://img.example/facade.jpg"], name="Chalet les Copains"),
            fetch_json=_fake_dense,
            fetch_text=_fake_html,
            api_key="x",
        )
    )
    assert out["source_resolution"] == "none"
    assert abs(out["lat_exacte"] - 45.0120) < 1e-4


def test_osm_vote_avec_lens():
    out = asyncio.run(
        resolve_exact_coords(
            _blur(photos=["https://img.example/facade.jpg"], name="Chalet les Copains"),
            fetch_json=_fake_lens_and_osm,
            fetch_text=_fake_html,
            api_key="x",
        )
    )
    assert out["confidence_score"] == "high"
    assert out["source_resolution"] in {"osm", "google_lens_booking", "google_lens_osm"}
    assert abs(out["lat_exacte"] - 45.0105) < 1e-3


def test_osm_rooms_studio():
    assert osm_rooms_as_bedrooms(1) == 0
    assert osm_rooms_as_bedrooms(3) == 3
    assert osm_rooms_as_bedrooms(None) is None


def test_osm_enrich_cercle_flou_et_chambres():
    hits = [
        OsmHit(45.0105, 6.1225, name="Chalet les Copains", rooms=3, beds=8, capacity=8),
    ]
    out = apply_osm_enrichment(
        name="Chalet les Copains",
        lat=45.0120,
        lon=6.1230,
        precision="approximate",
        bedrooms=None,
        capacity=None,
        hits=hits,
    )
    assert out.geocode_source == "osm"
    assert abs(out.lat - 45.0105) < 1e-4
    assert out.precision == "exact"
    assert out.bedrooms == 3
    assert out.capacity_max == 8
    assert out.capacity_source == "osm"


def test_osm_enrich_gps_exact_ne_bouge_pas():
    hits = [OsmHit(45.0105, 6.1225, name="Chalet les Copains", rooms=3, capacity=8)]
    out = apply_osm_enrichment(
        name="Chalet les Copains",
        lat=45.0108,
        lon=6.1224,
        precision="exact",
        bedrooms=None,
        capacity=2,
        hits=hits,
    )
    assert out.lat is None
    assert out.bedrooms == 3
    assert out.capacity_max is None
    assert out.capacity_source == "osm"


def test_osm_enrich_provider_chambres_conservees():
    hits = [OsmHit(45.0105, 6.1225, name="Chalet les Copains", rooms=5, capacity=12)]
    out = apply_osm_enrichment(
        name="Chalet les Copains",
        lat=45.0106,
        lon=6.1226,
        precision="approximate",
        bedrooms=2,
        capacity=6,
        hits=hits,
    )
    assert out.bedrooms is None
    assert out.capacity_max is None
    assert out.geocode_source == "osm"


def test_osm_enrich_jumeaux_silence():
    hits = [
        OsmHit(45.0105, 6.1225, name="Chalet les Copains", rooms=3, capacity=8),
        OsmHit(45.0110, 6.1225, name="Chalet les Copains", rooms=4, capacity=10),
    ]
    assert unique_osm_in_bbox(hits, "Chalet les Copains") is None
    out = apply_osm_enrichment(
        name="Chalet les Copains",
        lat=None,
        lon=None,
        precision="unknown",
        bedrooms=None,
        capacity=None,
        hits=hits,
    )
    assert out.lat is None
    assert out.bedrooms is None


def test_osm_enrich_sans_gps_nom_unique():
    hits = [OsmHit(45.0105, 6.1225, name="Chalet les Copains", rooms=1, beds=4)]
    out = apply_osm_enrichment(
        name="Chalet les Copains",
        lat=None,
        lon=None,
        precision="unknown",
        bedrooms=None,
        capacity=None,
        hits=hits,
    )
    assert out.geocode_source == "osm"
    assert out.bedrooms == 0
    assert out.capacity_max == 4
    assert out.capacity_source == "osm"


def test_osm_enrich_chambres_seules_marquent_la_source():
    hits = [OsmHit(45.0105, 6.1225, name="Chalet les Copains", rooms=3)]
    out = apply_osm_enrichment(
        name="Chalet les Copains",
        lat=45.0106,
        lon=6.1226,
        precision="exact",
        bedrooms=None,
        capacity=6,
        hits=hits,
    )
    assert out.bedrooms == 3
    assert out.capacity_max is None
    assert out.capacity_source == "osm"
    assert out.lat is None
