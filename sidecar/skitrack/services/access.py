"""Métriques d'accès aux pistes d'un logement.

## Le chaînon manquant

Une API de logement ne renvoie jamais qu'un couple `(lat, lon)`. Elle ignore ce
qui fait l'objet de cette application : à quelle distance des pistes on dort, et
combien de dénivelé il faut remonter le soir, skis à l'épaule. Ces deux
grandeurs ne sont pas des données à obtenir — ce sont des **calculs**, et la base
locale contient déjà tout ce qu'il faut pour les faire : les tracés OpenSkiMap
des pistes et des remontées, avec leur altitude.

C'est ce que le modèle `AccessMetrics` annonce depuis le début en renvoyant à un
`services/access.py` qui n'existait pas. Le voici.

## Trois décisions qui déterminent la justesse du résultat

**1. Distance au segment, pas au sommet le plus proche.** Les tracés OpenSkiMap
ont couramment 50 à 150 m entre deux points. Mesurer la distance au sommet le
plus proche surestime donc l'éloignement de plusieurs dizaines de mètres — assez
pour faire basculer un logement de « skis aux pieds » à « navette ». On projette
localement en mètres et on calcule la distance point-segment.

**2. Altitude interpolée le long du segment.** Le dénivelé n'a de sens que
mesuré au point d'accès réel, pas au sommet voisin qui peut être vingt mètres
plus haut. La troisième composante des coordonnées OpenSkiMap le permet sans un
seul appel réseau.

**3. Rien n'est inventé quand la position est floue.** Airbnb et consorts ne
publient qu'un cercle approximatif avant réservation. Sur une position
`approximate`, annoncer « 63 m des pistes » serait une fausse précision : les
distances sont alors arrondies à la centaine et `precision` le signale, pour que
l'interface puisse afficher « ~100 m » plutôt qu'un chiffre qui ment.

## Ce que ce module ne calcule pas

`walk_dist_to_slope_m` et `walk_time_to_slope_min` restent vides. Une distance à
pied est un itinéraire piéton, pas un vol d'oiseau multiplié par un coefficient
inventé — en station, entre un immeuble en balcon et le front de neige trente
mètres plus bas, le rapport réel va de 1,1 à 3. Ces champs se rempliront le jour
où un routeur piéton sera branché ; d'ici là, ils valent `None`, ce qui se lit
« pas calculé » et non « zéro ».
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

from .geo_math import haversine_m, iter_coords

EARTH_RADIUS_M = 6_371_008.8

# --- Seuils de qualification de l'accès -------------------------------------
#
# Choisis pour correspondre à ce qu'un skieur appelle réellement ainsi, pas à
# une progression décimale : « skis aux pieds » suppose qu'on chausse devant la
# porte, ce qui ne tient plus dès qu'il faut traverser une route ou remonter un
# escalier — d'où le plafond de dénivelé, aussi déterminant que la distance.
SKI_IN_MAX_DIST_M = 150.0
SKI_IN_MAX_CLIMB_M = 15.0
SHUTTLE_MAX_DIST_M = 1_200.0

#: Au-delà, inutile de comparer la géométrie : un tracé dont la boîte englobante
#: est à plus de ça n'a aucun point pertinent. Évite de parcourir les milliers de
#: sommets d'un grand domaine pour chaque logement.
PREFILTER_RADIUS_M = 3_000.0


@dataclass(slots=True)
class NearestPoint:
    """Point le plus proche trouvé sur une géométrie."""

    distance_m: float
    lat: float
    lon: float
    elevation_m: float | None


@dataclass(slots=True)
class AccessResult:
    """Ce qu'on sait de l'accès aux pistes depuis un logement.

    Tous les champs sont facultatifs : un domaine importé sans les tracés
    (`--with-runs` non demandé) n'en produira aucun, et c'est un état normal qui
    doit se lire comme tel dans l'interface.
    """

    dist_to_nearest_slope_m: float | None = None
    nearest_slope_id: int | None = None
    denivele_to_slope_m: float | None = None

    dist_to_nearest_lift_m: float | None = None
    nearest_lift_id: int | None = None
    denivele_to_lift_m: float | None = None

    dist_to_center_m: float | None = None

    slope_access_type: str | None = None
    #: `exact` ou `approximate`, repris de l'annonce.
    precision: str = "exact"
    #: Ce qui a servi au calcul — repris dans `AccessMetrics.computed_with`.
    computed_with: dict[str, Any] = field(default_factory=dict)

    @property
    def dist_to_slopes_m(self) -> float | None:
        """La plus courte des deux distances (piste OU remontée).

        C'est la définition qu'un skieur donne à « distance aux pistes » : peu
        importe qu'on accède au domaine par le bas d'une piste ou par une gare de
        remontée, ce qui compte est le point skiable le plus proche. On retient
        donc le minimum des deux, en ignorant celui qui manque.
        """
        candidates = [
            d for d in (self.dist_to_nearest_slope_m, self.dist_to_nearest_lift_m) if d is not None
        ]
        return min(candidates) if candidates else None

    @property
    def denivele_m(self) -> float | None:
        """Dénivelé au point d'accès effectivement le plus proche.

        Cohérent avec `dist_to_slopes_m` : on rend le dénivelé du point qui a
        gagné la comparaison de distance, pas un mélange des deux — sinon on
        annoncerait la distance d'une piste et le dénivelé d'une remontée.
        """
        slope = self.dist_to_nearest_slope_m
        lift = self.dist_to_nearest_lift_m
        if slope is None and lift is None:
            return None
        if lift is None or (slope is not None and slope <= lift):
            return self.denivele_to_slope_m
        return self.denivele_to_lift_m


# --- Géométrie ---------------------------------------------------------------


def _metres_per_degree(lat: float) -> tuple[float, float]:
    """Facteurs de conversion degré → mètre autour d'une latitude.

    Projection équirectangulaire locale. Sur les quelques kilomètres qui nous
    intéressent, son erreur est très inférieure au mètre — négligeable devant
    l'incertitude du tracé OSM lui-même, et cent fois moins coûteuse qu'une
    haversine par segment.
    """
    lat_m = math.pi * EARTH_RADIUS_M / 180.0
    return lat_m, lat_m * math.cos(math.radians(lat))


def nearest_point_on_geometry(
    lat: float, lon: float, geometry: dict | None
) -> NearestPoint | None:
    """Point le plus proche d'un tracé GeoJSON, segments compris.

    Renvoie aussi l'altitude **interpolée** à ce point quand les deux extrémités
    du segment en portent une. Un tracé réduit à un seul sommet est traité comme
    un point, ce qui arrive sur des géométries dégradées.
    """
    points: list[tuple[float, float, float | None]] = list(iter_coords(geometry))
    if not points:
        return None

    per_lat, per_lon = _metres_per_degree(lat)
    px, py = lon * per_lon, lat * per_lat

    best: NearestPoint | None = None

    for index in range(len(points)):
        lon_a, lat_a, ele_a = points[index]
        ax, ay = lon_a * per_lon, lat_a * per_lat

        if index + 1 < len(points):
            lon_b, lat_b, ele_b = points[index + 1]
            bx, by = lon_b * per_lon, lat_b * per_lat
            dx, dy = bx - ax, by - ay
            length_sq = dx * dx + dy * dy
            # `t` borné à [0, 1] : la projection orthogonale peut tomber hors du
            # segment, auquel cas le point le plus proche est une extrémité.
            t = 0.0 if length_sq == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
            cx, cy = ax + t * dx, ay + t * dy
            elevation = (
                ele_a + (ele_b - ele_a) * t if ele_a is not None and ele_b is not None else ele_a
            )
        else:
            if best is not None:
                break
            cx, cy, t, elevation = ax, ay, 0.0, ele_a

        distance = math.hypot(px - cx, py - cy)
        if best is None or distance < best.distance_m:
            best = NearestPoint(
                distance_m=distance,
                lat=cy / per_lat,
                lon=cx / per_lon,
                elevation_m=elevation,
            )

    return best


def _bbox_is_far(lat: float, lon: float, geometry: dict | None) -> bool:
    """Rejet grossier par boîte englobante, avant le calcul segment par segment."""
    lats: list[float] = []
    lons: list[float] = []
    for point_lon, point_lat, _ in iter_coords(geometry):
        lons.append(point_lon)
        lats.append(point_lat)
    if not lats:
        return True

    per_lat, per_lon = _metres_per_degree(lat)
    # Distance à la boîte : nulle si le point est dedans.
    dx = max(min(lons) - lon, 0.0, lon - max(lons)) * per_lon
    dy = max(min(lats) - lat, 0.0, lat - max(lats)) * per_lat
    return math.hypot(dx, dy) > PREFILTER_RADIUS_M


# --- Qualification -----------------------------------------------------------


def classify_access(
    dist_slope_m: float | None,
    climb_m: float | None,
    dist_lift_m: float | None,
) -> str | None:
    """Traduit distance et dénivelé en une étiquette d'accès.

    Le dénivelé est **signé** : positif quand le logement est plus bas que le
    point d'accès, donc quand il faut monter pour rejoindre les pistes. C'est le
    sens pénible ; descendre trente mètres le matin ne coûte rien, les remonter
    le soir en chaussures de ski, si. Un logement plus haut que la piste n'est
    donc pas pénalisé.
    """
    candidates = [d for d in (dist_slope_m, dist_lift_m) if d is not None]
    if not candidates:
        return None
    nearest = min(candidates)

    climb = max(climb_m or 0.0, 0.0)
    if nearest <= SKI_IN_MAX_DIST_M and climb <= SKI_IN_MAX_CLIMB_M:
        return "skis_aux_pieds"
    if nearest <= SHUTTLE_MAX_DIST_M:
        return "navette"
    return "voiture"


def _round_for_precision(value: float | None, precision: str) -> float | None:
    """Arrondit à la centaine quand la position n'est qu'approximative."""
    if value is None:
        return None
    if precision == "approximate":
        return round(value / 100.0) * 100.0
    return round(value, 1)


# --- Point d'entrée ----------------------------------------------------------


def compute_access(
    lat: float,
    lon: float,
    altitude_m: float | None,
    slopes: Sequence[Any] = (),
    lifts: Sequence[Any] = (),
    center: tuple[float, float] | None = None,
    precision: str = "exact",
) -> AccessResult:
    """Calcule les métriques d'accès d'un logement.

    `slopes` et `lifts` sont des objets portant `id` et `geometry` — les entités
    `DomainSlope` et `DomainLift`, mais n'importe quel objet de même forme
    convient : le module ne connaît pas la base, ce qui le rend testable sans
    elle.

    Le dénivelé n'est calculé que si l'altitude du logement est connue. Elle vient
    de l'API altimétrique (`services/elevation.py`), **jamais de l'annonce** —
    voir la note sur `Accommodation.altitude_m`. Sans elle, la distance reste
    valable et le dénivelé vaut `None` : c'est une information partielle, pas une
    information fausse.
    """
    result = AccessResult(precision=precision)
    scanned = {"slopes": 0, "lifts": 0}

    def scan(entities: Iterable[Any], kind: str) -> tuple[NearestPoint | None, int | None]:
        best_point: NearestPoint | None = None
        best_id: int | None = None
        for entity in entities:
            geometry = getattr(entity, "geometry", None)
            if not geometry or _bbox_is_far(lat, lon, geometry):
                continue
            scanned[kind] += 1
            point = nearest_point_on_geometry(lat, lon, geometry)
            if point is None:
                continue
            if best_point is None or point.distance_m < best_point.distance_m:
                best_point, best_id = point, getattr(entity, "id", None)
        return best_point, best_id

    slope_point, slope_id = scan(slopes, "slopes")
    lift_point, lift_id = scan(lifts, "lifts")

    def denivele(point: NearestPoint | None) -> float | None:
        if point is None or point.elevation_m is None or altitude_m is None:
            return None
        # Signe : positif = le point d'accès est au-dessus du logement.
        return round(point.elevation_m - altitude_m, 1)

    if slope_point is not None:
        result.dist_to_nearest_slope_m = _round_for_precision(slope_point.distance_m, precision)
        result.nearest_slope_id = slope_id
        result.denivele_to_slope_m = denivele(slope_point)

    if lift_point is not None:
        result.dist_to_nearest_lift_m = _round_for_precision(lift_point.distance_m, precision)
        result.nearest_lift_id = lift_id
        result.denivele_to_lift_m = denivele(lift_point)

    if center is not None:
        result.dist_to_center_m = _round_for_precision(
            haversine_m(lat, lon, center[0], center[1]), precision
        )

    result.slope_access_type = classify_access(
        result.dist_to_nearest_slope_m,
        result.denivele_to_slope_m,
        result.dist_to_nearest_lift_m,
    )
    result.computed_with = {
        "method": "openskimap_geometry",
        "precision": precision,
        "scanned": scanned,
        "altitude_known": altitude_m is not None,
    }
    return result
