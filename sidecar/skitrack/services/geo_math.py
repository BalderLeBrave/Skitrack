"""Géométrie de base — sans dépendance réseau."""

from __future__ import annotations

import math
from collections.abc import Iterable

EARTH_RADIUS_M = 6_371_008.8


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance orthodromique en mètres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def iter_coords(geometry: dict | None) -> Iterable[tuple[float, float, float | None]]:
    """Parcourt les positions d'une géométrie GeoJSON en (lon, lat, ele|None).

    OpenSkiMap publie des coordonnées à 3 composantes (lon, lat, altitude) : c'est
    ce qui permet de déterminer l'altitude d'une gare de départ sans un seul appel
    à une API altimétrique.
    """
    if not geometry:
        return
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if coords is None:
        if gtype == "GeometryCollection":
            for sub in geometry.get("geometries", []):
                yield from iter_coords(sub)
        return

    def walk(node):
        if not isinstance(node, list) or not node:
            return
        if isinstance(node[0], (int, float)):
            lon, lat = float(node[0]), float(node[1])
            ele = float(node[2]) if len(node) > 2 and node[2] is not None else None
            yield (lon, lat, ele)
            return
        for child in node:
            yield from walk(child)

    yield from walk(coords)


def bbox_of(geometry: dict | None) -> list[float] | None:
    """[min_lon, min_lat, max_lon, max_lat]."""
    lons, lats = [], []
    for lon, lat, _ in iter_coords(geometry):
        lons.append(lon)
        lats.append(lat)
    if not lons:
        return None
    return [min(lons), min(lats), max(lons), max(lats)]


def centroid_of(geometry: dict | None) -> tuple[float, float] | None:
    """Centroïde (lat, lon).

    Volontairement le centre de la *bbox* et non le barycentre des sommets : sur
    une emprise de domaine, les sommets sont densifiés là où le contour est
    tortueux, ce qui tire le barycentre vers un coin sans intérêt. Le centre de
    bbox place le marqueur au milieu visuel, ce qu'on veut pour la carte.
    """
    box = bbox_of(geometry)
    if box is None:
        return None
    return ((box[1] + box[3]) / 2, (box[0] + box[2]) / 2)


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Azimut 0-360° du point 1 vers le point 2."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def in_metropolitan_france(lat: float, lon: float) -> bool:
    """Test grossier de bbox — sert uniquement à choisir l'IGN plutôt que SRTM.

    Un faux positif (Genève, Turin) coûte un appel IGN qui renvoie `-99999`,
    traité comme « pas de donnée » et relayé vers OpenTopoData. Un faux négatif
    ne coûte que de la précision. Aucun des deux n'est bloquant.
    """
    return 41.0 <= lat <= 51.5 and -5.5 <= lon <= 9.8
