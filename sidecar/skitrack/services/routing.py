"""Itinéraires voiture : matrices, trajets détaillés, isochrones.

Trois adaptateurs derrière une interface unique. Aucun n'est équivalent aux
autres, et c'est justement pourquoi l'interface expose ses *capacités* :

===================  =========  ==============  ==============  ==============
Fournisseur          Clé        Isochrones      Éviter péages   Quota indicatif
===================  =========  ==============  ==============  ==============
OpenRouteService     requise    oui             oui (routes)    2 000 trajets/j,
                                                                500 matrices/j,
                                                                500 isochrones/j
OSRM auto-hébergé    non        non             non             illimité
Google Routes API    requise    non             oui             facturé
===================  =========  ==============  ==============  ==============

Conséquence assumée : **la matrice ORS ignore l'option « éviter les péages »**
(l'endpoint `/v2/matrix` n'accepte pas `options.avoid_features`). Le pré-calcul
de masse se fait donc avec péages, et le trajet sans péage est recalculé à la
demande, domaine par domaine, via `/v2/directions`. L'UI le signale au lieu de
laisser croire que les 300 temps affichés respectent le réglage.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol

from ..config import get_settings
from .http import ProviderUnavailable, get_http
from .secrets import get_secret

log = logging.getLogger(__name__)

ORS_BASE = "https://api.openrouteservice.org"
OSRM_DEMO_BASE = "https://router.project-osrm.org"
GOOGLE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"


@dataclass
class RouteMetric:
    duration_min: float | None
    distance_km: float | None
    provider: str


@dataclass
class ProviderCapabilities:
    isochrones: bool
    avoid_tolls_route: bool
    avoid_tolls_matrix: bool
    max_matrix_destinations: int


class RoutingProvider(Protocol):
    name: str
    capabilities: ProviderCapabilities

    def is_configured(self) -> bool: ...

    async def matrix(
        self, origin: tuple[float, float], destinations: list[tuple[float, float]], *, avoid_tolls: bool
    ) -> list[RouteMetric]: ...

    async def route(
        self, origin: tuple[float, float], destination: tuple[float, float], *, avoid_tolls: bool
    ) -> RouteMetric: ...

    async def isochrone(
        self, origin: tuple[float, float], ranges_min: list[int], *, avoid_tolls: bool
    ) -> dict: ...


class OpenRouteServiceProvider:
    name = "openrouteservice"
    capabilities = ProviderCapabilities(
        isochrones=True,
        avoid_tolls_route=True,
        avoid_tolls_matrix=False,  # limitation réelle de l'endpoint /v2/matrix
        max_matrix_destinations=500,
    )

    def is_configured(self) -> bool:
        return bool(get_secret("openrouteservice"))

    def _headers(self) -> dict[str, str]:
        key = get_secret("openrouteservice")
        if not key:
            raise ProviderUnavailable(
                "Clé OpenRouteService absente. Créez-en une gratuitement sur "
                "openrouteservice.org puis renseignez-la dans Réglages → Clés d'API."
            )
        return {"Authorization": key, "Content-Type": "application/json"}

    async def matrix(self, origin, destinations, *, avoid_tolls: bool) -> list[RouteMetric]:
        if not destinations:
            return []
        if avoid_tolls:
            log.info(
                "ORS : /v2/matrix n'accepte pas l'évitement des péages — "
                "matrice calculée avec péages, à raffiner par /v2/directions."
            )
        settings = get_settings()
        locations = [[origin[1], origin[0]]] + [[lon, lat] for lat, lon in destinations]
        body = {
            "locations": locations,
            "sources": [0],
            "destinations": list(range(1, len(locations))),
            "metrics": ["duration", "distance"],
            "units": "km",
        }
        data = await get_http().request_json(
            "POST",
            f"{ORS_BASE}/v2/matrix/driving-car",
            namespace="route",
            ttl_s=settings.ttl_route_s,
            json_body=body,
            headers=self._headers(),
            min_interval_s=1.6,  # 40 requêtes/minute sur le plan gratuit
        )
        durations = (data.get("durations") or [[]])[0]
        distances = (data.get("distances") or [[]])[0]
        out = []
        for i in range(len(destinations)):
            d = durations[i] if i < len(durations) else None
            km = distances[i] if i < len(distances) else None
            out.append(
                RouteMetric(
                    duration_min=None if d is None else round(d / 60.0, 1),
                    distance_km=None if km is None else round(float(km), 1),
                    provider=self.name,
                )
            )
        return out

    async def route(self, origin, destination, *, avoid_tolls: bool) -> RouteMetric:
        settings = get_settings()
        body: dict = {
            "coordinates": [[origin[1], origin[0]], [destination[1], destination[0]]],
            "units": "km",
        }
        if avoid_tolls:
            body["options"] = {"avoid_features": ["tollways"]}
        data = await get_http().request_json(
            "POST",
            f"{ORS_BASE}/v2/directions/driving-car",
            namespace="route",
            ttl_s=settings.ttl_route_s,
            json_body=body,
            headers=self._headers(),
            min_interval_s=1.6,
        )
        routes = data.get("routes") or []
        if not routes:
            return RouteMetric(None, None, self.name)
        summary = routes[0].get("summary", {})
        return RouteMetric(
            duration_min=round(summary.get("duration", 0) / 60.0, 1) or None,
            distance_km=round(float(summary.get("distance", 0)), 1) or None,
            provider=self.name,
        )

    async def isochrone(self, origin, ranges_min, *, avoid_tolls: bool) -> dict:
        settings = get_settings()
        body: dict = {
            "locations": [[origin[1], origin[0]]],
            "range": [int(m * 60) for m in ranges_min],
            "range_type": "time",
            "attributes": ["total_pop"],
        }
        if avoid_tolls:
            body["options"] = {"avoid_features": ["tollways"]}
        return await get_http().request_json(
            "POST",
            f"{ORS_BASE}/v2/isochrones/driving-car",
            namespace="route",
            ttl_s=settings.ttl_route_s,
            json_body=body,
            headers=self._headers(),
            min_interval_s=3.1,  # 20 requêtes/minute
        )


class OsrmProvider:
    """OSRM. Aucune clé, aucun quota — mais aucune isochrone ni évitement de péage.

    L'instance publique ``router.project-osrm.org`` est une **démo** : sa
    politique interdit l'usage soutenu et son service `/table` plafonne à
    100 coordonnées. Renseignez l'URL de votre propre instance dans les réglages
    pour un usage réel.
    """

    name = "osrm"
    capabilities = ProviderCapabilities(
        isochrones=False,
        avoid_tolls_route=False,
        avoid_tolls_matrix=False,
        max_matrix_destinations=95,
    )

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or OSRM_DEMO_BASE).rstrip("/")

    def is_configured(self) -> bool:
        return True

    async def matrix(self, origin, destinations, *, avoid_tolls: bool) -> list[RouteMetric]:
        if not destinations:
            return []
        settings = get_settings()
        coords = ";".join(
            [f"{origin[1]:.6f},{origin[0]:.6f}"]
            + [f"{lon:.6f},{lat:.6f}" for lat, lon in destinations]
        )
        data = await get_http().request_json(
            "GET",
            f"{self.base_url}/table/v1/driving/{coords}",
            namespace="route",
            ttl_s=settings.ttl_route_s,
            params={"sources": "0", "annotations": "duration,distance"},
            min_interval_s=1.0,
        )
        durations = (data.get("durations") or [[]])[0][1:]
        distances = (data.get("distances") or [[]])[0][1:]
        out = []
        for i in range(len(destinations)):
            d = durations[i] if i < len(durations) else None
            m = distances[i] if i < len(distances) else None
            out.append(
                RouteMetric(
                    duration_min=None if d is None else round(d / 60.0, 1),
                    distance_km=None if m is None else round(m / 1000.0, 1),
                    provider=self.name,
                )
            )
        return out

    async def route(self, origin, destination, *, avoid_tolls: bool) -> RouteMetric:
        if avoid_tolls:
            log.info("OSRM ne sait pas éviter les péages — trajet standard renvoyé.")
        settings = get_settings()
        coords = f"{origin[1]:.6f},{origin[0]:.6f};{destination[1]:.6f},{destination[0]:.6f}"
        data = await get_http().request_json(
            "GET",
            f"{self.base_url}/route/v1/driving/{coords}",
            namespace="route",
            ttl_s=settings.ttl_route_s,
            params={"overview": "false"},
            min_interval_s=1.0,
        )
        routes = data.get("routes") or []
        if not routes:
            return RouteMetric(None, None, self.name)
        r = routes[0]
        return RouteMetric(
            duration_min=round(r["duration"] / 60.0, 1),
            distance_km=round(r["distance"] / 1000.0, 1),
            provider=self.name,
        )

    async def isochrone(self, origin, ranges_min, *, avoid_tolls: bool) -> dict:
        raise ProviderUnavailable(
            "OSRM ne calcule pas d'isochrones. Basculez sur OpenRouteService dans "
            "les réglages pour afficher les zones de temps de trajet."
        )


class GoogleRoutesProvider:
    """Google Routes API (``computeRouteMatrix``). Payant, activé seulement si
    l'utilisateur fournit une clé."""

    name = "google"
    capabilities = ProviderCapabilities(
        isochrones=False,
        avoid_tolls_route=True,
        avoid_tolls_matrix=True,
        max_matrix_destinations=100,
    )

    def is_configured(self) -> bool:
        return bool(get_secret("google_maps"))

    def _headers(self) -> dict[str, str]:
        key = get_secret("google_maps")
        if not key:
            raise ProviderUnavailable("Clé Google Maps absente.")
        return {
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _waypoint(pt: tuple[float, float]) -> dict:
        return {"waypoint": {"location": {"latLng": {"latitude": pt[0], "longitude": pt[1]}}}}

    async def matrix(self, origin, destinations, *, avoid_tolls: bool) -> list[RouteMetric]:
        if not destinations:
            return []
        settings = get_settings()
        body = {
            "origins": [self._waypoint(origin)],
            "destinations": [self._waypoint(d) for d in destinations],
            "travelMode": "DRIVE",
            "routingPreference": "TRAFFIC_UNAWARE",
        }
        if avoid_tolls:
            body["routeModifiers"] = {"avoidTolls": True}
        data = await get_http().request_json(
            "POST",
            GOOGLE_MATRIX_URL,
            namespace="route",
            ttl_s=settings.ttl_route_s,
            json_body=body,
            headers=self._headers(),
            min_interval_s=0.2,
        )
        out = [RouteMetric(None, None, self.name) for _ in destinations]
        for row in data or []:
            idx = row.get("destinationIndex")
            if idx is None or idx >= len(out):
                continue
            if row.get("condition") != "ROUTE_EXISTS":
                continue
            seconds = float(str(row.get("duration", "0s")).rstrip("s") or 0)
            out[idx] = RouteMetric(
                duration_min=round(seconds / 60.0, 1),
                distance_km=round(row.get("distanceMeters", 0) / 1000.0, 1),
                provider=self.name,
            )
        return out

    async def route(self, origin, destination, *, avoid_tolls: bool) -> RouteMetric:
        return (await self.matrix(origin, [destination], avoid_tolls=avoid_tolls))[0]

    async def isochrone(self, origin, ranges_min, *, avoid_tolls: bool) -> dict:
        raise ProviderUnavailable(
            "L'API Google Routes ne fournit pas d'isochrones. Utilisez OpenRouteService."
        )


_PROVIDERS: dict[str, RoutingProvider] = {}


def get_routing_provider(name: str | None = None, *, osrm_base_url: str | None = None) -> RoutingProvider:
    name = name or "openrouteservice"
    if name not in _PROVIDERS:
        if name == "osrm":
            _PROVIDERS[name] = OsrmProvider(osrm_base_url)
        elif name == "google":
            _PROVIDERS[name] = GoogleRoutesProvider()
        else:
            _PROVIDERS[name] = OpenRouteServiceProvider()
    return _PROVIDERS[name]


def available_providers() -> list[RoutingProvider]:
    return [OpenRouteServiceProvider(), OsrmProvider(), GoogleRoutesProvider()]
