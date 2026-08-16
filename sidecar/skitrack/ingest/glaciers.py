"""Détection des domaines glaciaires via Overpass.

Le dump OpenSkiMap ne porte pas l'information « glacier », pourtant décisive pour
l'enneigement garanti. On la reconstruit par intersection géométrique avec les
polygones ``natural=glacier`` d'OpenStreetMap.

Coût maîtrisé : **une seule requête Overpass par emprise de pays**, pas une par
domaine. L'API Overpass publique est une ressource partagée gratuite ; 300
requêtes pour 300 domaines seraient un usage abusif.

Limite honnête : un domaine dont l'emprise OSM effleure un glacier non skiable
sera marqué à tort. Le champ reste donc surchargeable en curated, qui gagne.
"""

from __future__ import annotations

import logging
from typing import Any

from shapely.geometry import shape
from shapely.strtree import STRtree
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import SkiDomain
from ..services.http import get_http

log = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

#: Emprises grossières par pays, pour borner la requête Overpass.
COUNTRY_BBOX = {
    "FR": (41.0, -5.5, 51.5, 9.8),
    "CH": (45.8, 5.9, 47.9, 10.6),
    "IT": (36.6, 6.6, 47.1, 18.6),
    "AT": (46.3, 9.5, 49.1, 17.2),
    "ES": (35.9, -9.4, 43.9, 4.4),
    "AD": (42.4, 1.4, 42.7, 1.8),
    "DE": (47.2, 5.8, 55.1, 15.1),
    "SI": (45.4, 13.3, 46.9, 16.6),
}


def _overpass_query(bbox: tuple[float, float, float, float]) -> str:
    south, west, north, east = bbox
    return f"""
[out:json][timeout:180];
(
  way["natural"="glacier"]({south},{west},{north},{east});
  relation["natural"="glacier"]({south},{west},{north},{east});
);
out geom;
""".strip()


def _elements_to_polygons(elements: list[dict[str, Any]]) -> list:
    """Convertit la sortie `out geom` d'Overpass en polygones shapely."""
    polygons = []
    for el in elements:
        rings: list[list[tuple[float, float]]] = []
        if el.get("type") == "way" and el.get("geometry"):
            rings.append([(p["lon"], p["lat"]) for p in el["geometry"]])
        elif el.get("type") == "relation":
            for member in el.get("members") or []:
                if member.get("role") == "outer" and member.get("geometry"):
                    rings.append([(p["lon"], p["lat"]) for p in member["geometry"]])
        for ring in rings:
            if len(ring) < 4:
                continue
            if ring[0] != ring[-1]:
                ring = [*ring, ring[0]]
            try:
                poly = shape({"type": "Polygon", "coordinates": [ring]})
            except Exception:  # noqa: BLE001 — anneau dégénéré côté OSM
                continue
            if poly.is_valid and not poly.is_empty:
                polygons.append(poly)
    return polygons


async def detect_glaciers(session: Session, *, countries: list[str] | None = None) -> dict[str, Any]:
    settings = get_settings()
    countries = [c.upper() for c in (countries or ["FR"])]
    http = get_http()

    polygons: list = []
    for country in countries:
        bbox = COUNTRY_BBOX.get(country)
        if bbox is None:
            log.warning("Pas d'emprise connue pour %s — glaciers non détectés", country)
            continue
        data = await http.request_json(
            "GET",
            OVERPASS_URL,
            namespace="elevation",  # même famille de purge : référentiel quasi immuable
            ttl_s=settings.ttl_elevation_s,
            params={"data": _overpass_query(bbox)},
            min_interval_s=2.0,
        )
        polygons.extend(_elements_to_polygons((data or {}).get("elements", [])))

    if not polygons:
        return {"glaciers_found": 0, "domains_marked": 0}

    tree = STRtree(polygons)
    marked = 0
    query = select(SkiDomain).where(SkiDomain.geometry.is_not(None))
    if countries:
        query = query.where(SkiDomain.country.in_(countries))

    for domain in session.execute(query).scalars():
        if domain.curated and domain.glacier is not None:
            continue
        try:
            geom = shape(domain.geometry)
        except Exception:  # noqa: BLE001
            continue
        candidates = tree.query(geom)
        has_glacier = any(polygons[i].intersects(geom) for i in candidates)
        if domain.glacier != has_glacier:
            domain.glacier = has_glacier
            if has_glacier:
                marked += 1

    session.commit()
    return {"glaciers_found": len(polygons), "domains_marked": marked}
