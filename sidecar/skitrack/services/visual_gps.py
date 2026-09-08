"""GPS exact d'une annonce dont la source ne publie qu'un cercle flou.

Airbnb et Abritel masquent l'épingle jusqu'à la réservation. Gîtes de France et
Booking, eux, publient un vrai point (JSON-LD, Apollo, `data-atlas-latlng`).
Quand la **même façade** apparaît sur l'une de ces fiches, on la retrouve par
correspondance visuelle (Google Lens via SerpApi) et on lit **leurs**
coordonnées — jamais un centroïde de domaine, jamais `(0, 0)`.

Ce n'est **pas** un appel du lot `POST /api/lodgings/access` : Lens est payant
et une recherche ramène des dizaines de photos. On le déclenche à la demande
(`resolve_exact_coords` / `POST /api/lodgings/pin-exact`), clé `serpapi`.

OpenStreetMap vote **avec** Lens : Overpass interroge les hébergements nommés
autour du cercle avant le choix. Même bâtiment = 2 sources. Un hameau dense
(≥ 3 chalets nommés dans 200 m) refuse un GPS anonyme, même à 80 m.

Faux positifs refusés, même dans le kilomètre : voisin au nom différent,
photo de catalogue (3 GPS distincts), SERP Booking / page ville, mini-plan
`b_map_center` (station), `Place` Schema.org, chef-lieu BAN, deux bâtiments
OSM homonymes, GPS anonyme dans un hameau dense.

Sans match : bâtiment OSM au nom unique, ou le cercle d'origine
(`confidence_score=low`). Un titre générique (« Chalet ») n'est pas un nom.
"""

from __future__ import annotations

import json
import logging
import os
import re
import unicodedata
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import urlparse

from .geo_math import haversine_m, plausible_point
from .geolocate import MAX_KM_FROM_DOMAIN, geocode_query

log = logging.getLogger(__name__)

SERPAPI_LENS = "https://serpapi.com/search.json"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

#: Airbnb publie ~150 m de flou. 200 m laisse une marge GPS sans avaler
#: le hameau d'à côté. Au-delà, il faut un nom ou deux sources.
MAX_FROM_APPROX_M = 800.0
NEAR_M = 200.0
NEED_NAME_M = 450.0
CLUSTER_M = 40.0
#: Rayon Overpass autour du cercle. Un homonyme de l'autre bout de station
#: ne vote pas.
OSM_RADIUS_M = 500
#: ≥ 3 chalets OSM nommés dans NEAR_M : trop serré pour un GPS anonyme.
OSM_DENSE_MIN = 3
MAX_PHOTOS = 3
MAX_LENS_MATCHES = 8
MIN_NAME_LEN = 8
MAX_CLUSTERS_PER_PHOTO = 2

OSM_TOURISM = (
    "chalet|apartment|apartments|guest_house|hotel|alpine_hut|hostel|resort|motel"
)

Confidence = Literal["high", "medium", "low"]
Origin = Literal["gites_de_france", "booking", "abritel"]
NameVerdict = Literal["match", "conflict", "unknown"]

USER_AGENTS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
)

SKIP_HOSTS = (
    "airbnb.",
    "pinterest.",
    "facebook.",
    "instagram.",
    "tiktok.",
    "youtube.",
    "twitter.",
    "x.com",
    "googletagmanager.",
    "doubleclick.",
    "google.",
    "googleapis.",
    "gstatic.",
    "tripadvisor.",
    "wikipedia.org",
    "wikimedia.org",
    "flickr.",
    "unsplash.",
    "shutterstock.",
    "gettyimages.",
    "istockphoto.",
    "alamy.",
    "adobe.com",
    "leboncoin.",
    "seloger.",
    "logic-immo.",
    "skiresort.info",
    "j2ski.",
    "winter-sports.",
    "france-montagnes.com",
)

SKIP_PATH_HINTS = (
    "/searchresults",
    "/search/",
    "/sr/",
    "/maps/",
    "/map/",
    "/hotels/index",
    "/destination/",
    "/city/",
    "/region/",
    "/district/",
    "/landmark/",
    "/country/",
    "/place/",
)

GENERIC_NAME = re.compile(
    r"^(le |la |les |l['’])?(chalet|appartement|studio|gites?|gîtes?|maison|villa|"
    r"residence|résidence|logement|hébergement|hebergement)$",
    re.I,
)

PROPERTY_STOP = {
    "chalet",
    "appartement",
    "appart",
    "studio",
    "gite",
    "gites",
    "maison",
    "villa",
    "residence",
    "logement",
    "hebergement",
    "hotel",
    "duplex",
    "chambre",
    "entier",
    "vue",
    "pistes",
    "piste",
    "ski",
    "skis",
    "alpes",
    "montagne",
    "vacances",
    "location",
    "cosy",
    "cozy",
    "luxe",
    "prestige",
    "coeur",
    "centre",
    "station",
    "front",
    "pied",
    "neiges",
    "hameau",
    "immeuble",
    "batiment",
    "les",
    "des",
    "une",
    "aux",
    "sur",
    "sous",
    "pres",
    "avec",
    "pour",
    "dans",
    "plus",
    "saint",
    "sainte",
}

LD_RE = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.I | re.S,
)
NEXT_RE = re.compile(
    r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>',
    re.I | re.S,
)
APOLLO_RE = re.compile(
    r'<script[^>]*data-capla-store-data=["\']apollo["\'][^>]*>(.*?)</script>',
    re.I | re.S,
)
ATLAS_RE = re.compile(r'data-atlas-latlng="\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*"')
OG_LAT_RE = re.compile(
    r'<meta[^>]+(?:property|name)=["\'](?:og:latitude|place:location:latitude)["\'][^>]+content=["\'](-?\d+(?:\.\d+)?)["\']',
    re.I,
)
OG_LON_RE = re.compile(
    r'<meta[^>]+(?:property|name)=["\'](?:og:longitude|place:location:longitude)["\'][^>]+content=["\'](-?\d+(?:\.\d+)?)["\']',
    re.I,
)
OG_TITLE_RE = re.compile(
    r'<meta[^>]+(?:property|name)=["\']og:title["\'][^>]+content=["\']([^"\']+)',
    re.I,
)
ITEM_LAT_RE = re.compile(
    r'itemprop=["\']latitude["\'][^>]*content=["\'](-?\d+(?:\.\d+)?)["\']|'
    r'content=["\'](-?\d+(?:\.\d+)?)["\'][^>]*itemprop=["\']latitude["\']',
    re.I,
)
ITEM_LON_RE = re.compile(
    r'itemprop=["\']longitude["\'][^>]*content=["\'](-?\d+(?:\.\d+)?)["\']|'
    r'content=["\'](-?\d+(?:\.\d+)?)["\'][^>]*itemprop=["\']longitude["\']',
    re.I,
)
CODE_RE = re.compile(r"(\d{2}g\d{3,})", re.I)

LODGING_LD_TYPES = (
    "LodgingBusiness",
    "Accommodation",
    "VacationRental",
    "Hotel",
    "Resort",
    "House",
    "Apartment",
    "Residence",
)

FetchJson = Callable[..., Awaitable[Any]]
FetchText = Callable[..., Awaitable[str]]


@dataclass(slots=True)
class ParsedPoint:
    lat: float
    lon: float
    source: str
    address: str | None = None
    name: str | None = None
    lens_title: str | None = None


@dataclass(slots=True)
class OsmHit:
    lat: float
    lon: float
    name: str | None = None
    tourism: str | None = None
    rooms: int | None = None
    beds: int | None = None
    capacity: int | None = None


_ua_i = 0


def _next_ua() -> str:
    global _ua_i
    ua = USER_AGENTS[_ua_i % len(USER_AGENTS)]
    _ua_i += 1
    return ua


def _fold(text: str) -> str:
    n = unicodedata.normalize("NFD", text or "")
    return "".join(c for c in n if unicodedata.category(c) != "Mn").lower().strip()


def _coord(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        n = float(value)
    elif isinstance(value, str):
        try:
            n = float(value.replace(",", ".").strip())
        except ValueError:
            return None
    else:
        return None
    return n if n == n else None


def _host(url: str) -> str:
    try:
        host = urlparse(url).hostname
        return host.replace("www.", "").lower() if host else ""
    except Exception:  # noqa: BLE001
        return ""


def _skip_url(url: str) -> bool:
    """Pages qui localisent la *station*, un catalogue, ou une photo de banque."""
    host = _host(url)
    if not host:
        return True
    if any(skip in host or host.endswith(skip.rstrip(".")) for skip in SKIP_HOSTS):
        return True
    parsed = urlparse(url)
    path = (parsed.path or "").lower()
    if path.rstrip("/") in {"/search", "/sr", "/maps", "/map"}:
        return True
    if any(hint in path for hint in SKIP_PATH_HINTS):
        return True
    if "booking.com" in host:
        if "/hotel/" not in path:
            return True
        tail = path.split("/hotel/", 1)[-1].strip("/")
        if not tail or tail.startswith("index"):
            return True
    if "gites-de-france" in host and not CODE_RE.search(url):
        return True
    return False


def _place_stopwords(*places: str | None) -> set[str]:
    extra: set[str] = set()
    for place in places:
        if not place:
            continue
        extra.update(re.findall(r"[a-z0-9]{3,}", _fold(place)))
    return extra


def _tokens(text: str | None, extra_stop: set[str] | None = None) -> set[str]:
    words = re.findall(r"[a-z0-9]{3,}", _fold(text or ""))
    stop = PROPERTY_STOP | (extra_stop or set())
    return {w for w in words if w not in stop}


def _name_is_specific(name: str | None) -> bool:
    raw = (name or "").strip()
    if len(raw) < MIN_NAME_LEN:
        return False
    if GENERIC_NAME.match(_fold(raw)):
        return False
    return any(len(tok) >= 4 for tok in _tokens(raw))


def name_verdict(
    listing_name: str | None,
    page_name: str | None = None,
    extra_stop: set[str] | None = None,
) -> NameVerdict:
    """Homonymie utile, collision, ou silence.

    Un titre d'annonce n'est pas une adresse ; ici on ne compare que des *noms
    publiés sur la fiche candidate*. Le titre Lens (souvent l'écho de la requête)
    n'est pas une preuve.

    « Chalet les Copains » vs « Résidence Le Hameau des Arolles » = collision.
    « Chalet » n'a pas de jeton distinctif = silence.
    """
    a = _tokens(listing_name, extra_stop)
    if not a:
        return "unknown"
    page = _tokens(page_name, extra_stop)
    if not page:
        return "unknown"
    if a & page:
        return "match"
    return "conflict"


def _usable(lat: Any, lon: Any) -> tuple[float, float] | None:
    a, b = _coord(lat), _coord(lon)
    if a is None or b is None or not plausible_point(a, b):
        return None
    return a, b


def _too_far_domain(lat: float, lon: float, domain_lat: float | None, domain_lon: float | None) -> bool:
    if domain_lat is None or domain_lon is None:
        return False
    return haversine_m(lat, lon, domain_lat, domain_lon) > MAX_KM_FROM_DOMAIN * 1000


def _point_from_mapping(node: dict[str, Any]) -> tuple[float, float] | None:
    pairs = (
        ("latitude", "longitude"),
        ("lat", "lng"),
        ("lat", "lon"),
        ("latExacte", "lngExacte"),
    )
    for a, b in pairs:
        hit = _usable(node.get(a), node.get(b))
        if hit:
            return hit
    geo = node.get("geo") if isinstance(node.get("geo"), dict) else None
    if geo:
        hit = _point_from_mapping(geo)
        if hit:
            return hit
    loc = node.get("location") if isinstance(node.get("location"), dict) else None
    if loc:
        hit = _point_from_mapping(loc)
        if hit:
            return hit
    coord = node.get("coordinate") if isinstance(node.get("coordinate"), dict) else None
    if coord:
        hit = _point_from_mapping(coord)
        if hit:
            return hit
    coords = node.get("coordinates")
    if isinstance(coords, (list, tuple)) and len(coords) >= 2:
        hit = _usable(coords[1], coords[0]) or _usable(coords[0], coords[1])
        if hit:
            return hit
    return None


def _walk_ld(node: Any, types: tuple[str, ...] | None = None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if isinstance(node, list):
        for item in node:
            out.extend(_walk_ld(item, types))
        return out
    if not isinstance(node, dict):
        return out
    raw_type = node.get("@type")
    kinds: set[str] = set()
    if isinstance(raw_type, list):
        kinds = {str(x).split("/")[-1] for x in raw_type}
    elif raw_type:
        kinds = {str(raw_type).split("/")[-1]}
    if types is None:
        if kinds:
            out.append(node)
    elif kinds.intersection(types):
        out.append(node)
    graph = node.get("@graph")
    if graph is not None:
        out.extend(_walk_ld(graph, types))
    for value in node.values():
        if isinstance(value, (dict, list)):
            out.extend(_walk_ld(value, types))
    return out


def _ld_blocks(html: str) -> list[Any]:
    blocks: list[Any] = []
    for match in LD_RE.finditer(html or ""):
        raw = match.group(1).strip()
        if not raw:
            continue
        try:
            blocks.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    return blocks


def _address_of(node: dict[str, Any]) -> str | None:
    addr = node.get("address")
    if isinstance(addr, str) and len(addr.strip()) >= 8:
        return addr.strip()
    if not isinstance(addr, dict):
        return None
    parts = [
        str(addr.get(key) or "").strip()
        for key in ("streetAddress", "postalCode", "addressLocality", "addressRegion")
        if str(addr.get(key) or "").strip()
    ]
    return ", ".join(parts) if parts else None


def _first_group(match: re.Match[str] | None) -> str | None:
    if match is None:
        return None
    for value in match.groups():
        if value:
            return value
    return None


def _html_name(html: str) -> str | None:
    """Nom publié sur la fiche (JSON-LD lodging, sinon og:title). Pas un titre Lens."""
    for block in _ld_blocks(html):
        for node in _walk_ld(block, LODGING_LD_TYPES):
            n = str(node.get("name") or "").strip()
            if n:
                return n
    match = OG_TITLE_RE.search(html or "")
    if match:
        title = match.group(1).strip()
        if title:
            return title
    return None


def _microdata_point(html: str, source: str) -> ParsedPoint | None:
    hit = _usable(_first_group(ITEM_LAT_RE.search(html or "")), _first_group(ITEM_LON_RE.search(html or "")))
    if not hit:
        return None
    return ParsedPoint(hit[0], hit[1], source, name=_html_name(html))


def parse_gites_de_france(html: str) -> ParsedPoint | None:
    """JSON-LD Gîtes : geo + éventuellement l'adresse postale (pas le titre)."""
    for block in _ld_blocks(html):
        for node in _walk_ld(block, LODGING_LD_TYPES):
            hit = _point_from_mapping(node)
            if not hit:
                continue
            url = node.get("url")
            if isinstance(url, str) and url and not CODE_RE.search(url):
                continue
            return ParsedPoint(
                hit[0],
                hit[1],
                "gites",
                address=_address_of(node),
                name=str(node.get("name") or "").strip() or None,
            )
    return _microdata_point(html, "gites")


def _booking_apollo(html: str) -> ParsedPoint | None:
    """`basicPropertyData.location` seulement. Un SkiLift Apollo à (0, 0) est ignoré."""

    def walk(node: Any) -> ParsedPoint | None:
        if isinstance(node, list):
            for item in node:
                found = walk(item)
                if found:
                    return found
            return None
        if not isinstance(node, dict):
            return None
        loc = node.get("location") if isinstance(node.get("location"), dict) else None
        page = node.get("pageName")
        property_like = any(
            node.get(key)
            for key in (
                "pageName",
                "occupancy",
                "accommodationTypeName",
                "numberOfBedrooms",
            )
        ) or bool(page)
        if loc or property_like:
            hit = _point_from_mapping(loc or node)
            if hit and property_like:
                n = str(node.get("name") or "").strip() or None
                return ParsedPoint(hit[0], hit[1], "booking", name=n)
        for value in node.values():
            if isinstance(value, (dict, list)):
                found = walk(value)
                if found:
                    return found
        return None

    for match in APOLLO_RE.finditer(html or ""):
        raw = match.group(1).strip()
        if not raw:
            continue
        try:
            found = walk(json.loads(raw))
        except json.JSONDecodeError:
            continue
        if found:
            return found
    return None


def parse_booking(html: str) -> ParsedPoint | None:
    """og / atlas / Apollo / JSON-LD lodging. `b_map_center` (mini-plan station) ignoré."""
    name = _html_name(html)
    og = _usable(_first_group(OG_LAT_RE.search(html or "")), _first_group(OG_LON_RE.search(html or "")))
    if og:
        return ParsedPoint(og[0], og[1], "booking", name=name)
    atlas = ATLAS_RE.search(html or "")
    if atlas:
        hit = _usable(atlas.group(1), atlas.group(2))
        if hit:
            return ParsedPoint(hit[0], hit[1], "booking", name=name)
    apollo = _booking_apollo(html)
    if apollo:
        if name and not apollo.name:
            return ParsedPoint(apollo.lat, apollo.lon, apollo.source, name=name, address=apollo.address)
        return apollo
    for block in _ld_blocks(html):
        for node in _walk_ld(block, LODGING_LD_TYPES):
            hit = _point_from_mapping(node)
            if hit:
                return ParsedPoint(
                    hit[0],
                    hit[1],
                    "booking",
                    address=_address_of(node),
                    name=str(node.get("name") or "").strip() or name,
                )
    return _microdata_point(html, "booking")


def _abritel_from_next(html: str) -> ParsedPoint | None:
    match = NEXT_RE.search(html or "")
    if not match:
        return None
    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None

    prefer = ("listingModel", "listing", "property", "pageProps", "geo", "location")

    def walk(node: Any, depth: int = 0) -> ParsedPoint | None:
        if depth > 12:
            return None
        if isinstance(node, list):
            if len(node) > 40:
                return None
            for item in node:
                found = walk(item, depth + 1)
                if found:
                    return found
            return None
        if not isinstance(node, dict):
            return None
        if any(node.get(key) for key in ("listingModel", "propertyId", "listingId", "@type")):
            hit = _point_from_mapping(node)
            if hit:
                return ParsedPoint(
                    hit[0],
                    hit[1],
                    "abritel",
                    address=_address_of(node),
                    name=str(node.get("name") or "").strip() or None,
                )
        for key in prefer:
            child = node.get(key)
            if isinstance(child, (dict, list)):
                found = walk(child, depth + 1)
                if found:
                    return found
        for child in node.values():
            if isinstance(child, (dict, list)):
                found = walk(child, depth + 1)
                if found:
                    return found
        return None

    return walk(data)


def parse_abritel(html: str) -> ParsedPoint | None:
    """JSON-LD Accommodation, sinon state React (`__NEXT_DATA__` / listingModel)."""
    for block in _ld_blocks(html):
        for node in _walk_ld(block, LODGING_LD_TYPES):
            hit = _point_from_mapping(node)
            if hit:
                return ParsedPoint(
                    hit[0],
                    hit[1],
                    "abritel",
                    address=_address_of(node),
                    name=str(node.get("name") or "").strip() or None,
                )
    nxt = _abritel_from_next(html)
    if nxt:
        return nxt
    return _microdata_point(html, "abritel")


def parse_schema_geo(html: str) -> ParsedPoint | None:
    """Microdonnées Schema.org sur une fiche d'agence / office de tourisme."""
    for block in _ld_blocks(html):
        for node in _walk_ld(block, LODGING_LD_TYPES):
            hit = _point_from_mapping(node)
            if hit:
                return ParsedPoint(
                    hit[0],
                    hit[1],
                    "schema",
                    address=_address_of(node),
                    name=str(node.get("name") or "").strip() or None,
                )
    return _microdata_point(html, "schema")


def parse_candidate(url: str, html: str) -> ParsedPoint | None:
    host = _host(url)
    if "gites-de-france" in host:
        parsed = parse_gites_de_france(html)
    elif "booking.com" in host:
        parsed = parse_booking(html)
    elif any(h in host for h in ("abritel.", "vrbo.", "homeaway.")):
        parsed = parse_abritel(html)
    else:
        parsed = parse_schema_geo(html)
    if parsed is None:
        return None
    n = parsed.name or _html_name(html)
    if not n:
        return parsed
    return ParsedPoint(
        parsed.lat,
        parsed.lon,
        parsed.source,
        address=parsed.address,
        name=n,
        lens_title=parsed.lens_title,
    )


def validate_distance(
    lat_a: float,
    lon_a: float,
    lat_b: float,
    lon_b: float,
    max_m: float = MAX_FROM_APPROX_M,
) -> float | None:
    """Haversine en mètres, ou None si hors rayon / point inutilisable."""
    if not plausible_point(lat_a, lon_a) or not plausible_point(lat_b, lon_b):
        return None
    dist = haversine_m(lat_a, lon_a, lat_b, lon_b)
    return dist if dist <= max_m else None


def _serpapi_key() -> str | None:
    try:
        from .secrets import get_secret

        vault = get_secret("serpapi")
    except Exception:  # noqa: BLE001
        vault = None
    return vault or os.environ.get("SERPAPI_API_KEY") or os.environ.get("SKITRACK_SERPAPI_KEY") or None


async def search_lens(
    photo_url: str,
    *,
    fetch_json: FetchJson | None = None,
    api_key: str | None = None,
) -> list[dict[str, str]]:
    """visual_matches SerpApi (`engine=google_lens`). Liste vide sans clé / sans photo."""
    if not photo_url or photo_url.startswith("data:") or "/placeholder" in photo_url:
        return []
    key = api_key or _serpapi_key()
    if not key and fetch_json is None:
        return []
    lookup = fetch_json
    if lookup is None:
        from ..config import get_settings
        from .http import get_http

        settings = get_settings()

        async def lookup(url: str, **kwargs: Any) -> Any:
            return await get_http().request_json(
                "GET",
                url,
                namespace="visual_gps",
                ttl_s=max(7 * 24 * 3600, getattr(settings, "ttl_geocode_s", 0)),
                params=kwargs.get("params"),
                min_interval_s=1.0,
            )

    try:
        data = await lookup(
            SERPAPI_LENS,
            params={"engine": "google_lens", "url": photo_url, "api_key": key, "hl": "fr"},
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("Lens indisponible pour %s : %s", photo_url[:80], exc)
        return []
    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    for bucket in ("visual_matches", "exact_matches"):
        for item in (data or {}).get(bucket) or []:
            if not isinstance(item, dict):
                continue
            link = str(item.get("link") or item.get("source") or "").strip()
            if not link.startswith("http") or _skip_url(link) or link in seen:
                continue
            seen.add(link)
            rows.append({"link": link, "title": str(item.get("title") or "")})
            if len(rows) >= MAX_LENS_MATCHES:
                return rows
    return rows


def _overpass_around_query(lat: float, lon: float, radius_m: int) -> str:
    return f"""
[out:json][timeout:25];
(
  nwr["tourism"~"^({OSM_TOURISM})$"](around:{radius_m},{lat},{lon});
  nwr["building"]["name"](around:{radius_m},{lat},{lon});
);
out center 80;
""".strip()


def _overpass_name_query(name: str, lat: float, lon: float, radius_m: int) -> str:
    esc = name.replace("\\", "\\\\").replace('"', '\\"')
    return f"""
[out:json][timeout:25];
(
  nwr["building"]["name"~"{esc}", i](around:{radius_m},{lat},{lon});
  nwr["tourism"~"^(chalet|apartment|guest_house|hotel|alpine_hut)$"]["name"~"{esc}", i](around:{radius_m},{lat},{lon});
  nwr["addr:housenumber"]["addr:street"]["name"~"{esc}", i](around:{radius_m},{lat},{lon});
);
out center 8;
""".strip()


def _osm_center(el: dict[str, Any]) -> tuple[float, float] | None:
    if "center" in el and isinstance(el["center"], dict):
        return _usable(el["center"].get("lat"), el["center"].get("lon"))
    return _usable(el.get("lat"), el.get("lon"))


def _tag_int(tags: dict[str, Any], *keys: str) -> int | None:
    for key in keys:
        raw = tags.get(key)
        if raw is None or raw == "":
            continue
        try:
            n = int(str(raw).strip())
        except (TypeError, ValueError):
            continue
        if n > 0:
            return n
    return None


def _hits_from_overpass(data: Any) -> list[OsmHit]:
    hits: list[OsmHit] = []
    seen: set[str] = set()
    for el in (data or {}).get("elements") or []:
        tags = el.get("tags") if isinstance(el.get("tags"), dict) else {}
        center = _osm_center(el)
        if not center:
            continue
        name = str(tags.get("name") or "").strip() or None
        key = f"{_fold(name or '')}|{center[0]:.4f}|{center[1]:.4f}"
        if key in seen:
            continue
        seen.add(key)
        hits.append(
            OsmHit(
                center[0],
                center[1],
                name=name,
                tourism=str(tags.get("tourism") or "") or None,
                rooms=_tag_int(tags, "rooms"),
                beds=_tag_int(tags, "beds"),
                capacity=_tag_int(tags, "capacity", "beds"),
            )
        )
    return hits


async def _overpass_lookup(fetch_json: FetchJson | None) -> FetchJson:
    if fetch_json is not None:
        return fetch_json
    from ..config import get_settings
    from .http import get_http

    settings = get_settings()

    async def lookup(url: str, **kwargs: Any) -> Any:
        return await get_http().request_json(
            "GET",
            url,
            namespace="visual_gps",
            ttl_s=max(30 * 24 * 3600, getattr(settings, "ttl_geocode_s", 0)),
            params=kwargs.get("params"),
            min_interval_s=2.0,
        )

    return lookup


async def query_osm_around(
    lat: float,
    lon: float,
    *,
    fetch_json: FetchJson | None = None,
    radius_m: int = OSM_RADIUS_M,
) -> list[OsmHit]:
    """Hébergements OSM nommés autour du cercle. Une requête, tout le hameau."""
    if not plausible_point(lat, lon):
        return []
    lookup = await _overpass_lookup(fetch_json)
    try:
        data = await lookup(OVERPASS_URL, params={"data": _overpass_around_query(lat, lon, radius_m)})
    except Exception as exc:  # noqa: BLE001
        log.warning("Overpass voisinage en échec : %s", exc)
        return []
    return _hits_from_overpass(data)


def _overpass_bbox_query(south: float, west: float, north: float, east: float) -> str:
    return f"""
[out:json][timeout:25];
(
  nwr["tourism"~"^({OSM_TOURISM})$"]({south},{west},{north},{east});
  nwr["building"="chalet"]["name"]({south},{west},{north},{east});
);
out center 400;
""".strip()


async def query_osm_bbox(
    south: float,
    west: float,
    north: float,
    east: float,
    *,
    fetch_json: FetchJson | None = None,
) -> list[OsmHit]:
    """Hébergements OSM d'un domaine. Une requête Overpass, pas une par annonce."""
    if south >= north or west >= east:
        return []
    lookup = await _overpass_lookup(fetch_json)
    try:
        data = await lookup(
            OVERPASS_URL,
            params={"data": _overpass_bbox_query(south, west, north, east)},
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("Overpass emprise en échec : %s", exc)
        return []
    return _hits_from_overpass(data)



def osm_named_neighbors(
    hits: list[OsmHit],
    lat: float,
    lon: float,
    radius_m: float = NEAR_M,
) -> int:
    """Chalets OSM au nom spécifique dans le rayon — densité du hameau."""
    seen: set[str] = set()
    n = 0
    for hit in hits:
        if not _name_is_specific(hit.name):
            continue
        if haversine_m(lat, lon, hit.lat, hit.lon) > radius_m:
            continue
        key = _fold(hit.name or "")
        if key in seen:
            continue
        seen.add(key)
        n += 1
    return n


def unique_osm_match(
    hits: list[OsmHit],
    listing_name: str | None,
    lat: float,
    lon: float,
    extra_stop: set[str] | None = None,
) -> OsmHit | None:
    """Un seul bâtiment au nom de l'annonce. Deux homonymes proches : silence."""
    if not _name_is_specific(listing_name):
        return None
    ranked: list[tuple[float, OsmHit]] = []
    for hit in hits:
        if name_verdict(listing_name, hit.name, extra_stop=extra_stop) != "match":
            continue
        ranked.append((haversine_m(lat, lon, hit.lat, hit.lon), hit))
    if not ranked:
        return None
    ranked.sort(key=lambda row: row[0])
    if len(ranked) >= 2 and ranked[1][0] < max(2 * ranked[0][0], 80.0) and ranked[1][0] < 400:
        return None
    return ranked[0][1]


def unique_osm_in_bbox(
    hits: list[OsmHit],
    listing_name: str | None,
    extra_stop: set[str] | None = None,
) -> OsmHit | None:
    """Un seul homonyme dans tout le domaine. Deux « Copains » : silence."""
    if not _name_is_specific(listing_name):
        return None
    matches = [
        hit for hit in hits if name_verdict(listing_name, hit.name, extra_stop=extra_stop) == "match"
    ]
    if len(matches) != 1:
        return None
    return matches[0]


def osm_rooms_as_bedrooms(rooms: int | None) -> int | None:
    """Pièces OSM → chambres. 1 pièce = studio (0 chambre). Rien n'est inventé."""
    if rooms is None:
        return None
    return 0 if rooms == 1 else rooms


@dataclass(slots=True)
class OsmEnrichment:
    """Ce qu'OSM peut poser sur une annonce sans écraser le provider."""

    lat: float | None = None
    lon: float | None = None
    precision: str | None = None
    geocode_source: str | None = None
    bedrooms: int | None = None
    capacity_max: int | None = None
    capacity_source: str | None = None


def apply_osm_enrichment(
    *,
    name: str | None,
    lat: float | None,
    lon: float | None,
    precision: str,
    bedrooms: int | None,
    capacity: int | None,
    hits: list[OsmHit],
    extra_stop: set[str] | None = None,
) -> OsmEnrichment:
    """Chambres / capacité manquantes, et GPS flou calé sur un bâtiment unique.

    GPS `exact` du provider : on ne le déplace pas. BAN `address` : on ne
    recentre que si le nœud OSM est dans 40 m (même bâtiment). Cercle flou :
    unique nom dans 450 m.
    """
    out = OsmEnrichment()
    if not hits:
        return out

    hit: OsmHit | None = None
    dist: float | None = None
    if lat is not None and lon is not None and plausible_point(lat, lon):
        hit = unique_osm_match(hits, name, lat, lon, extra_stop)
        if hit is not None:
            dist = haversine_m(lat, lon, hit.lat, hit.lon)
            neighbors = osm_named_neighbors(hits, lat, lon)
            if not accept_point(dist, "match", 1, neighbors):
                hit = None
                dist = None
    else:
        hit = unique_osm_in_bbox(hits, name, extra_stop)

    if hit is None:
        return out

    prec = (precision or "unknown").lower()
    can_snap = False
    if lat is None or lon is None:
        can_snap = True
    elif prec in {"approximate", "unknown"}:
        can_snap = True
    elif prec == "address" and dist is not None and dist <= CLUSTER_M:
        can_snap = True
    if can_snap:
        out.lat = hit.lat
        out.lon = hit.lon
        out.precision = "exact"
        out.geocode_source = "osm"

    if bedrooms is None:
        mapped = osm_rooms_as_bedrooms(hit.rooms)
        if mapped is not None:
            out.bedrooms = mapped
    if capacity is None:
        cap = hit.capacity or hit.beds
        if cap is not None:
            out.capacity_max = cap
    if out.bedrooms is not None or out.capacity_max is not None:
        out.capacity_source = "osm"
    return out


def osm_conflict_at(
    hits: list[OsmHit],
    lat: float,
    lon: float,
    listing_name: str | None,
    extra_stop: set[str] | None = None,
    radius_m: float = CLUSTER_M,
) -> bool:
    """Un autre chalet nommé occupe déjà ce GPS."""
    if not _name_is_specific(listing_name):
        return False
    for hit in hits:
        if haversine_m(lat, lon, hit.lat, hit.lon) > radius_m:
            continue
        if name_verdict(listing_name, hit.name, extra_stop=extra_stop) == "conflict":
            return True
    return False


async def fallback_osm(
    name: str | None,
    lat: float,
    lon: float,
    *,
    fetch_json: FetchJson | None = None,
    radius_m: int = OSM_RADIUS_M,
) -> ParsedPoint | None:
    """Centroïde d'un bâtiment OSM au nom strict et unique. Pas un chef-lieu."""
    if not _name_is_specific(name) or not plausible_point(lat, lon):
        return None
    hits = await query_osm_around(lat, lon, fetch_json=fetch_json, radius_m=radius_m)
    if not hits:
        lookup = await _overpass_lookup(fetch_json)
        try:
            data = await lookup(
                OVERPASS_URL,
                params={"data": _overpass_name_query(name.strip(), lat, lon, radius_m)},
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("Overpass fallback en échec : %s", exc)
            return None
        hits = _hits_from_overpass(data)
    hit = unique_osm_match(hits, name, lat, lon)
    if hit is None:
        return None
    return ParsedPoint(hit.lat, hit.lon, "osm", name=hit.name)


def group_clusters(
    points: list[tuple[ParsedPoint, float]],
    radius_m: float = CLUSTER_M,
) -> list[list[tuple[ParsedPoint, float]]]:
    """Regroupe les GPS du même bâtiment. Une grille coupait des voisins à 20 m."""
    clusters: list[list[tuple[ParsedPoint, float]]] = []
    for item in points:
        placed = False
        for cluster in clusters:
            if any(
                haversine_m(item[0].lat, item[0].lon, other[0].lat, other[0].lon) <= radius_m
                for other in cluster
            ):
                cluster.append(item)
                placed = True
                break
        if not placed:
            clusters.append([item])
    return clusters


def photo_is_stock(points: list[tuple[ParsedPoint, float]]) -> bool:
    """Une façade unique ne pointe pas trois adresses. Un salon IKEA, si."""
    if len(points) < 3:
        return False
    return len(group_clusters(points)) >= MAX_CLUSTERS_PER_PHOTO + 1


def accept_point(
    dist: float,
    verdict: NameVerdict,
    n_sources: int,
    osm_neighbors: int = 0,
) -> bool:
    """Un GPS n'est pas le bien sous prétexte qu'il tombe dans 800 m.

    ≤ 200 m : cercle de flou Airbnb. Collision de nom + une source = voisin.
    Hameau dense (≥ 3 chalets OSM nommés) : il faut le nom, ou deux sources.
    200–450 m : le nom, ou deux fiches d'accord.
    450–800 m : nom **et** deux sources. Au-delà : hors jeu.
    """
    dense = osm_neighbors >= OSM_DENSE_MIN
    if dist <= NEAR_M:
        if verdict == "conflict" and n_sources < 2:
            return False
        if dense and verdict != "match" and n_sources < 2:
            return False
        return True
    if dist <= NEED_NAME_M:
        return verdict == "match" or n_sources >= 2
    if dist <= MAX_FROM_APPROX_M:
        return verdict == "match" and n_sources >= 2
    return False


def confidence_of(
    dist: float,
    verdict: NameVerdict,
    n_sources: int,
    source: str,
) -> Confidence:
    if n_sources >= 2:
        return "high"
    if source in {"gites", "booking", "osm"} and dist <= NEAR_M and verdict != "conflict":
        return "high"
    if verdict == "match" and dist <= NEAR_M:
        return "high"
    return "medium"


def _cluster_verdict(
    cluster: list[tuple[ParsedPoint, float]],
    listing_name: str | None,
    extra_stop: set[str] | None,
) -> NameVerdict:
    """Le nom de n'importe quel vote du bâtiment, pas seulement le plus proche."""
    verdicts = [name_verdict(listing_name, point.name, extra_stop=extra_stop) for point, _ in cluster]
    if "match" in verdicts:
        return "match"
    if "conflict" in verdicts:
        return "conflict"
    return "unknown"


def _pick_best(
    points: list[tuple[ParsedPoint, float]],
    listing_name: str | None = None,
    extra_stop: set[str] | None = None,
    osm_neighbors: int = 0,
) -> tuple[ParsedPoint, float, Confidence] | None:
    if not points:
        return None
    scored: list[tuple[int, int, float, NameVerdict, Confidence, ParsedPoint]] = []
    for cluster in group_clusters(points):
        n_src = len({p.source for p, _ in cluster})
        point, dist = min(cluster, key=lambda row: row[1])
        # Centroïde OSM plus précis que l'og: d'une fiche, si le nom concorde.
        osm_in = next((p for p, _ in cluster if p.source == "osm"), None)
        if osm_in is not None and name_verdict(listing_name, osm_in.name, extra_stop=extra_stop) == "match":
            point = osm_in
        verdict = _cluster_verdict(cluster, listing_name, extra_stop)
        if not accept_point(dist, verdict, n_src, osm_neighbors=osm_neighbors):
            continue
        conf = confidence_of(dist, verdict, n_src, point.source)
        scored.append((len(cluster), n_src, dist, verdict, conf, point))
    if not scored:
        return None
    scored.sort(key=lambda s: (-s[0], 0 if s[3] == "match" else 1, s[2]))
    if len(scored) >= 2:
        first, second = scored[0], scored[1]
        apart = haversine_m(first[5].lat, first[5].lon, second[5].lat, second[5].lon)
        if apart > CLUSTER_M and first[0] == second[0]:
            if first[3] == "match" and second[3] != "match":
                pass
            else:
                return None
    top = scored[0]
    return top[5], top[2], top[4]


def _resolution_of(point: ParsedPoint, via_lens: bool) -> str:
    if point.source == "osm":
        return "google_lens_osm" if via_lens else "osm"
    if point.source == "gites":
        return "google_lens_gites" if via_lens else "gites_api"
    if point.source == "booking":
        return "google_lens_booking" if via_lens else "booking"
    if point.source == "abritel":
        return "google_lens_abritel" if via_lens else "abritel"
    if point.source == "ban":
        return "google_lens_ban" if via_lens else "ban"
    if via_lens:
        return f"google_lens_{point.source}"
    return point.source


def _origin_of(raw: str | None) -> Origin:
    s = (raw or "").lower()
    if "gite" in s:
        return "gites_de_france"
    if "book" in s:
        return "booking"
    return "abritel"


def _listing_lon(listing: dict[str, Any]) -> float | None:
    for key in ("lng", "longitude", "lon"):
        if listing.get(key) is not None:
            return _coord(listing.get(key))
    return None


def _result(
    listing_id: str,
    origin: Origin,
    lat: float | None,
    lon: float | None,
    confidence: Confidence,
    resolution: str,
) -> dict[str, Any]:
    return {
        "listing_id": listing_id,
        "source_origine": origin,
        "lat_exacte": lat,
        "lng_exacte": lon,
        "confidence_score": confidence,
        "source_resolution": resolution,
    }


async def _fetch_html(url: str, fetch_text: FetchText | None) -> str:
    if fetch_text is not None:
        return await fetch_text(url)
    from .http import get_http

    return await get_http().request_text(
        "GET",
        url,
        namespace="visual_gps",
        ttl_s=7 * 24 * 3600,
        headers={"User-Agent": _next_ua(), "Accept-Language": "fr-FR,fr;q=0.9"},
        min_interval_s=0.8,
    )


async def _geocode_published_address(
    html: str,
    *,
    domain_lat: float | None,
    domain_lon: float | None,
    geocode_fn: Callable[..., Awaitable[list[Any]]] | None,
) -> ParsedPoint | None:
    """Adresse *de la fiche candidate* → BAN. Pas le titre, pas un chef-lieu."""
    addr = None
    for block in _ld_blocks(html):
        for node in _walk_ld(block, LODGING_LD_TYPES):
            addr = _address_of(node)
            if addr:
                break
        if addr:
            break
    hoped = geocode_query(addr, None) if addr else None
    if hoped is None or hoped[1] != "address":
        return None
    from .geolocate import refine_listing_coords

    refined = await refine_listing_coords(
        lat=None,
        lon=None,
        precision="unknown",
        address=addr,
        commune=None,
        domain_lat=domain_lat,
        domain_lon=domain_lon,
        geocode_fn=geocode_fn,
    )
    if refined.lat is None or refined.lon is None:
        return None
    return ParsedPoint(refined.lat, refined.lon, "ban", address=addr)


async def resolve_exact_coords(
    listing: dict[str, Any],
    *,
    fetch_json: FetchJson | None = None,
    fetch_text: FetchText | None = None,
    geocode_fn: Callable[..., Awaitable[list[Any]]] | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    """Pipeline autonome. `listing` : id, source, lat/lon flous, photos, name.

    Le centroïde du domaine (`domain_lat` / `domain_lon`) ne sert qu'à **écarter**
    un match visuel à l'autre bout du pays. Il n'est jamais écrit.
    """
    listing_id = str(listing.get("listing_id") or listing.get("id") or "")
    origin = _origin_of(str(listing.get("source_origine") or listing.get("source") or ""))
    lat0 = _coord(listing.get("lat") if listing.get("lat") is not None else listing.get("latitude"))
    lon0 = _listing_lon(listing)
    domain_lat = _coord(listing.get("domain_lat"))
    domain_lon = _coord(listing.get("domain_lon"))
    photos = [p for p in (listing.get("photos") or listing.get("images") or []) if isinstance(p, str)]
    name = str(listing.get("name") or listing.get("title") or "").strip() or None
    extra_stop = _place_stopwords(
        listing.get("commune"),
        listing.get("city"),
        listing.get("domain_name"),
        listing.get("destination"),
    )

    kept_approx = plausible_point(lat0, lon0) and not _too_far_domain(
        float(lat0), float(lon0), domain_lat, domain_lon
    )

    osm_hits: list[OsmHit] = []
    if kept_approx:
        osm_hits = await query_osm_around(float(lat0), float(lon0), fetch_json=fetch_json)
    neighbors = osm_named_neighbors(osm_hits, float(lat0), float(lon0)) if osm_hits else 0
    osm_hit = unique_osm_match(osm_hits, name, float(lat0), float(lon0), extra_stop) if osm_hits else None

    lens_points: list[tuple[ParsedPoint, float]] = []
    via_lens = False
    for photo in photos[:MAX_PHOTOS]:
        matches = await search_lens(photo, fetch_json=fetch_json, api_key=api_key)
        photo_points: list[tuple[ParsedPoint, float]] = []
        for match in matches:
            url = match["link"]
            if _skip_url(url):
                continue
            try:
                html = await _fetch_html(url, fetch_text)
            except Exception as exc:  # noqa: BLE001
                log.info("fiche candidate illisible %s : %s", url[:80], exc)
                continue
            parsed = parse_candidate(url, html)
            if parsed is None:
                parsed = await _geocode_published_address(
                    html, domain_lat=domain_lat, domain_lon=domain_lon, geocode_fn=geocode_fn
                )
            if parsed is None:
                continue
            parsed = ParsedPoint(
                parsed.lat,
                parsed.lon,
                parsed.source,
                address=parsed.address,
                name=parsed.name,
                lens_title=match.get("title") or parsed.lens_title,
            )
            if _too_far_domain(parsed.lat, parsed.lon, domain_lat, domain_lon):
                continue
            if (
                name_verdict(name, parsed.name, extra_stop=extra_stop) != "match"
                and osm_conflict_at(osm_hits, parsed.lat, parsed.lon, name, extra_stop)
            ):
                continue
            if kept_approx:
                dist = validate_distance(float(lat0), float(lon0), parsed.lat, parsed.lon)
                if dist is None:
                    continue
            else:
                dist = 0.0
            photo_points.append((parsed, dist))
        if photo_is_stock(photo_points):
            log.info("photo catalogue écartée (%d GPS distincts)", len(group_clusters(photo_points)))
            continue
        if photo_points:
            via_lens = True
            lens_points.extend(photo_points)

    if osm_hit is not None and kept_approx:
        dist = validate_distance(float(lat0), float(lon0), osm_hit.lat, osm_hit.lon)
        if dist is not None:
            lens_points.append(
                (ParsedPoint(osm_hit.lat, osm_hit.lon, "osm", name=osm_hit.name), dist)
            )

    best = _pick_best(
        lens_points,
        listing_name=name,
        extra_stop=extra_stop,
        osm_neighbors=neighbors,
    )
    if best:
        point, _dist, conf = best
        used_lens = via_lens and point.source != "osm"
        return _result(
            listing_id,
            origin,
            point.lat,
            point.lon,
            conf,
            _resolution_of(point, via_lens=used_lens),
        )

    if kept_approx:
        return _result(listing_id, origin, float(lat0), float(lon0), "low", "none")
    return _result(listing_id, origin, None, None, "low", "none")
