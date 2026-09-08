"""Tuiles SERP Drupal + typologie ITEA. Pas le tarif /semaine."""

from __future__ import annotations

import json
import re
import html as htmlmod
from typing import Any
from urllib.parse import urljoin

CODE_RE = re.compile(r"(\d{2}g\d{3,})", re.I)
TILE_RE = re.compile(
    r'<div class="[^"]*js-search-tile[^"]*"[\s\S]*?(?=<div class="[^"]*js-search-tile|$)',
    re.I,
)
LD_RE = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.I | re.S,
)
# Carte OSM Leaflet de la fiche Drupal (`#location` → `#map-accommodation`).
MAP_TAG_RE = re.compile(r"<[^>]*\bid=[\"']map-accommodation[\"'][^>]*>", re.I)
MAP_LAT_RE = re.compile(r'data-lat=["\']([^"\']+)["\']', re.I)
MAP_LNG_RE = re.compile(r'data-lng=["\']([^"\']+)["\']', re.I)


def _fold(s: str) -> str:
    import unicodedata

    n = unicodedata.normalize("NFD", s)
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", n).strip().lower()


def _strip(html: str) -> str:
    t = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = t.replace("&nbsp;", " ").replace("&#160;", " ")
    return re.sub(r"\s+", " ", t).strip()


def code_from_url(url: str) -> str | None:
    m = CODE_RE.search(url or "")
    return m.group(1).upper() if m else None


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
    if n != n:
        return None
    return n


def _plausible_latlon(lat: float | None, lon: float | None) -> bool:
    if lat is None or lon is None:
        return False
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return False
    return not (lat == 0.0 and lon == 0.0)


def osm_pin_from_html(html: str) -> tuple[float | None, float | None]:
    """Pin Leaflet de la fiche Gîtes (`#map-accommodation`).

    La fiche Drupal n'embarque pas le GPS dans le JSON-LD (graphe Product).
    Le point OSM que le visiteur voit est `data-lat` / `data-lng` sur la carte.
    """
    m = MAP_TAG_RE.search(html or "")
    if not m:
        return None, None
    tag = m.group(0)
    lat_m = MAP_LAT_RE.search(tag)
    lng_m = MAP_LNG_RE.search(tag)
    lat = _coord(lat_m.group(1) if lat_m else None)
    lon = _coord(lng_m.group(1) if lng_m else None)
    if _plausible_latlon(lat, lon):
        return lat, lon
    return None, None


def _address_of(node: dict[str, Any]) -> tuple[str | None, str | None]:
    addr = node.get("address")
    if isinstance(addr, str) and addr.strip():
        return addr.strip(), None
    if not isinstance(addr, dict):
        return None, None
    street = str(addr.get("streetAddress") or "").strip()
    postal = str(addr.get("postalCode") or "").strip()
    city = str(addr.get("addressLocality") or "").strip()
    parts = [p for p in (street, postal, city) if p]
    return (", ".join(parts) or None), (city or None)


def _geo_of(node: dict[str, Any]) -> tuple[float | None, float | None]:
    """Lat/lon schema.org : geo racine (SERP) ou location.geo (fiche ITEA / carte OSM)."""
    geo = node.get("geo") if isinstance(node.get("geo"), dict) else {}
    loc = node.get("location") if isinstance(node.get("location"), dict) else {}
    loc_geo = loc.get("geo") if isinstance(loc.get("geo"), dict) else {}
    lat = _coord(geo.get("latitude"))
    lon = _coord(geo.get("longitude"))
    if lat is None:
        lat = _coord(loc_geo.get("latitude"))
    if lon is None:
        lon = _coord(loc_geo.get("longitude"))
    if lat is None:
        lat = _coord(node.get("latitude"))
    if lon is None:
        lon = _coord(node.get("longitude"))
    return lat, lon


def geo_index_from_html(html: str) -> dict[str, dict[str, Any]]:
    """JSON-LD + pin OSM Leaflet → {code 38G…: lat/lon/address/city}.

    SERP Drupal : geo à la racine du LodgingBusiness (parfois un centroïde).
    Fiche Drupal : JSON-LD Product **sans** geo ; le pin est `#map-accommodation`.
    Fiche ITEA (carte OSM/Leaflet) : location.geo, même point que la fiche Drupal.
    Un titre n'est pas une adresse. (0, 0) n'est pas un gîte.
    """
    out: dict[str, dict[str, Any]] = {}

    def walk(node: Any) -> None:
        if isinstance(node, list):
            for item in node:
                walk(item)
            return
        if not isinstance(node, dict):
            return
        url = node.get("url") if isinstance(node.get("url"), str) else None
        code = code_from_url(url or "")
        if code:
            lat, lon = _geo_of(node)
            address, city = _address_of(node)
            slot = out.setdefault(code, {})
            if _plausible_latlon(lat, lon):
                slot["lat"] = lat
                slot["lon"] = lon
            if address:
                slot["address"] = address
            if city:
                slot["city"] = city
        for value in node.values():
            if isinstance(value, (dict, list)):
                walk(value)

    for match in LD_RE.finditer(html or ""):
        raw = htmlmod.unescape(match.group(1)).strip()
        if not raw:
            continue
        try:
            walk(json.loads(raw))
        except json.JSONDecodeError:
            continue

    pin_lat, pin_lon = osm_pin_from_html(html)
    if _plausible_latlon(pin_lat, pin_lon):
        # Une fiche = un pin. On n'assigne pas un pin unique à une SERP multi-tuiles.
        if len(out) == 1:
            slot = next(iter(out.values()))
            slot["lat"] = pin_lat
            slot["lon"] = pin_lon
        elif not out:
            canon = re.search(r'rel=["\']canonical["\'][^>]*href=["\']([^"\']+)', html or "", re.I)
            og = re.search(
                r'property=["\']og:url["\'][^>]*content=["\']([^"\']+)', html or "", re.I
            )
            page_code = code_from_url(
                (canon.group(1) if canon else "") or (og.group(1) if og else "") or (html or "")
            )
            if page_code:
                out[page_code] = {"lat": pin_lat, "lon": pin_lon}
    return out


def classify(ident: str = "", url: str = "", type_label: str = "") -> str:
    if ident:
        m = re.search(r"\.([A-Za-z]+)$", ident.strip())
        if m:
            s = m.group(1).upper()
            if s == "G":
                return "gite"
            if s == "H":
                return "chambre_hotes"
            if s in ("GS", "GG"):
                return "groupe"
    path = _fold((url or "").replace("\\", "/"))
    if re.search(r"chambre[-_ ]?d[-_ ]?hotes|bed-and-breakfast", path):
        return "chambre_hotes"
    if re.search(r"gites?[-_ ]de[-_ ]groupe|gites?[-_ ]de[-_ ]sejour", path):
        return "groupe"
    label = _fold(type_label)
    if label:
        if "chambre" in label and "hote" in label:
            return "chambre_hotes"
        if re.search(r"gite(?:s)?\s+de\s+(?:groupe|sejour)|\bgroupe\b", label):
            return "groupe"
        if re.search(r"camping|\baire\b", label):
            return "bad_type"
        if re.search(r"\bgites?\b", label):
            return "gite"
    if re.search(r"/gite[-_]|gite-", path):
        return "gite"
    return "missing"


def keep_gite(ident: str = "", url: str = "", type_label: str = "") -> bool:
    return classify(ident=ident, url=url, type_label=type_label) == "gite"


def parse_stay_total(html: str) -> float | None:
    m = re.search(r'sp_montantPrixTotal[^>]*data-prix="([\d.]+)"', html, flags=re.I)
    if m:
        n = float(m.group(1))
        return round(n, 2) if n > 0 else None
    m = re.search(r'data-prixtotal="([\d\s.,]+)\s*(?:€|&euro;)?"', html, flags=re.I)
    if m:
        n = float(m.group(1).replace(" ", "").replace(",", "."))
        return round(n, 2) if n > 0 else None
    return None


def quote_blocked(body: str) -> bool:
    if parse_stay_total(body) is not None:
        return False
    return "contactSiNonVendable" in body or bool(
        re.search(r"nous ne pouvons pas calculer le prix de ce s[ée]jour", body, re.I)
    )


def widget_context(html: str) -> dict[str, str] | None:
    ident = re.search(r'data-ident="([^"]+)"', html)
    instance = re.search(r'data-instance="([^"]+)"', html)
    exercice = re.search(r'data-exercice="([^"]+)"', html)
    if not (ident and instance and exercice):
        return None
    return {"ident": ident.group(1), "instance": instance.group(1), "exercice": exercice.group(1)}


def widget_photo(html: str) -> str | None:
    og = re.search(r'property=["\']og:image["\'][^>]*content=["\'](https?://[^"\']+)["\']', html, re.I)
    if og:
        return og.group(1)
    itea = re.search(r"https?://widget-fngf\.itea\.fr/photos/[^\"'\s>]+\.(?:jpe?g|png|webp)", html, re.I)
    return itea.group(0) if itea else None


def last_page_index(html: str) -> int:
    """Drupal `page=` 0-based. 0 si un seul écran."""
    nums = [int(n) for n in re.findall(r"[?&]page=(\d+)", html or "")]
    return max(nums) if nums else 0


def advertised_count(html: str) -> int | None:
    m = re.search(r"(\d+)\s*R[ée]sultats?", html or "", re.I)
    if not m:
        return None
    n = int(m.group(1))
    return n if 0 < n < 50_000 else None


def tiles_from_html(html: str) -> list[dict[str, Any]]:
    blocks = TILE_RE.findall(html or "")
    if not blocks and "js-search-tile" in (html or ""):
        blocks = [html]
    geo = geo_index_from_html(html)
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for chunk in blocks:
        href = re.search(r'href="(/fr/[^"]*\d{2}g\d{3,}[^"]*)"', chunk, re.I)
        if not href:
            href = re.search(
                r'href="(https?://www\.gites-de-france\.com/fr/[^"]*\d{2}g\d{3,}[^"]*)"',
                chunk,
                re.I,
            )
        if not href:
            continue
        raw = htmlmod.unescape(href.group(1))
        url = raw if raw.startswith("http") else urljoin("https://www.gites-de-france.com", raw)
        code = code_from_url(url)
        if not code or code in seen:
            continue
        seen.add(code)
        kind = re.search(r"g2f-accommodationTile-text-type[^>]*>([\s\S]*?)</", chunk, re.I)
        type_label = _strip(kind.group(1)) if kind else ""
        if not keep_gite(url=url, type_label=type_label):
            continue
        title_m = re.search(r"g2f-accommodationTile-link[^>]*>([\s\S]*?)</", chunk, re.I)
        title = htmlmod.unescape(_strip(title_m.group(1))) if title_m else code
        cap = _strip(chunk)
        gm = re.search(r"(\d+)\s*(?:personnes?|voyageurs?)", cap, re.I)
        bm = re.search(r"(\d+)\s*chambres?", cap, re.I)
        price_h = re.search(r"g2f-accommodationTile-text-price[\s\S]{0,500}", chunk, re.I)
        row: dict[str, Any] = {
            "source": "gites-web",
            "sourceId": code,
            "title": title,
            "url": url,
            "propertyType": type_label or "Gîte",
        }
        if gm:
            row["guests"] = int(gm.group(1))
        if bm:
            row["bedrooms"] = int(bm.group(1))
        if price_h:
            row["weeklyFromText"] = _strip(price_h.group(0))
        img = re.search(
            r"/sites/default/files/[^\"'\s>]+\.(?:jpe?g|png|webp)(?:\?[^\"'\s>]*)?",
            chunk,
            re.I,
        )
        if img:
            row["images"] = [urljoin("https://www.gites-de-france.com", img.group(0))]
        hit = geo.get(code)
        if hit:
            if hit.get("lat") is not None:
                row["latitude"] = hit["lat"]
                row["longitude"] = hit["lon"]
            if hit.get("address"):
                row["address"] = hit["address"]
            if hit.get("city"):
                row["city"] = hit["city"]
        out.append(row)
    return out
