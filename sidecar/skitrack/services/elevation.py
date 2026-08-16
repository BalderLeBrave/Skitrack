"""Altimétrie.

Deux fournisseurs, tous deux ouverts et sans clé :

* **IGN Géoplateforme / RGE ALTI** — France, précision métrique.
  ``GET https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json``
  avec ``resource=ign_rge_alti_wld``. Jusqu'à 5 000 points par requête,
  5 requêtes/seconde par IP. Vérifié en fonctionnement le 2026-08-11.
* **OpenTopoData** (instance publique) — reste de l'Europe, jeu ``eudem25m``
  (25 m) avec repli ``srtm30m``. 100 points/requête, 1 requête/seconde,
  1 000 requêtes/jour sur l'instance publique.

Une altitude ne change pas : le TTL de cache est d'un an et le cache est
consulté avant tout appel réseau.
"""

from __future__ import annotations

import logging

from ..config import get_settings
from .geo_math import in_metropolitan_france
from .http import get_http

log = logging.getLogger(__name__)

IGN_URL = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json"
IGN_RESOURCE = "ign_rge_alti_wld"
IGN_MAX_POINTS = 500  # l'API en accepte 5 000, on reste prudent sur la taille d'URL
IGN_NODATA = -99999.0

OPENTOPO_URL = "https://api.opentopodata.org/v1/{dataset}"
OPENTOPO_DATASETS = ("eudem25m", "srtm30m")
OPENTOPO_MAX_POINTS = 100


async def _ign_batch(points: list[tuple[float, float]]) -> list[float | None]:
    settings = get_settings()
    http = get_http()
    params = {
        "lon": "|".join(f"{lon:.6f}" for _, lon in points),
        "lat": "|".join(f"{lat:.6f}" for lat, _ in points),
        "resource": IGN_RESOURCE,
        "delimiter": "|",
        "zonly": "false",
        "indent": "false",
    }
    data = await http.request_json(
        "GET",
        IGN_URL,
        namespace="elevation",
        ttl_s=settings.ttl_elevation_s,
        params=params,
        min_interval_s=0.25,  # 5 req/s autorisées, on prend 4
    )
    out: list[float | None] = []
    for item in (data or {}).get("elevations", []):
        z = item.get("z")
        out.append(None if z is None or float(z) <= IGN_NODATA else float(z))
    # L'API garantit l'ordre ; si le compte ne tombe pas juste, on préfère renvoyer
    # des trous plutôt que de décaler silencieusement les altitudes.
    if len(out) != len(points):
        log.warning("IGN : %d altitudes pour %d points demandés", len(out), len(points))
        return [None] * len(points)
    return out


async def _opentopo_batch(points: list[tuple[float, float]], dataset: str) -> list[float | None]:
    settings = get_settings()
    http = get_http()
    locations = "|".join(f"{lat:.6f},{lon:.6f}" for lat, lon in points)
    data = await http.request_json(
        "GET",
        OPENTOPO_URL.format(dataset=dataset),
        namespace="elevation",
        ttl_s=settings.ttl_elevation_s,
        params={"locations": locations, "interpolation": "bilinear"},
        min_interval_s=1.05,  # instance publique : 1 req/s
    )
    results = (data or {}).get("results", [])
    out = [None if r.get("elevation") is None else float(r["elevation"]) for r in results]
    if len(out) != len(points):
        log.warning("OpenTopoData : %d altitudes pour %d points", len(out), len(points))
        return [None] * len(points)
    return out


async def elevations(
    points: list[tuple[float, float]], *, prefer: str = "auto"
) -> list[tuple[float | None, str | None]]:
    """Altitudes de points (lat, lon). Renvoie (altitude_m, fournisseur).

    Les points sont routés par fournisseur *avant* découpage en lots, de sorte
    qu'une liste mixte France/Suisse ne dégrade pas la précision des points
    français.
    """
    if not points:
        return []

    if prefer == "ign":
        routing = ["ign"] * len(points)
    elif prefer == "opentopodata":
        routing = ["opentopodata"] * len(points)
    else:
        routing = [
            "ign" if in_metropolitan_france(lat, lon) else "opentopodata" for lat, lon in points
        ]

    out: list[tuple[float | None, str | None]] = [(None, None)] * len(points)

    ign_idx = [i for i, r in enumerate(routing) if r == "ign"]
    for start in range(0, len(ign_idx), IGN_MAX_POINTS):
        chunk = ign_idx[start : start + IGN_MAX_POINTS]
        try:
            values = await _ign_batch([points[i] for i in chunk])
        except Exception as exc:  # noqa: BLE001
            log.warning("IGN indisponible (%s) — bascule sur OpenTopoData", exc)
            values = [None] * len(chunk)
        for i, v in zip(chunk, values, strict=True):
            if v is None:
                routing[i] = "opentopodata"  # repli pour les trous de couverture
            else:
                out[i] = (v, "ign")

    topo_idx = [i for i, r in enumerate(routing) if r == "opentopodata" and out[i][0] is None]
    for dataset in OPENTOPO_DATASETS:
        remaining = [i for i in topo_idx if out[i][0] is None]
        if not remaining:
            break
        for start in range(0, len(remaining), OPENTOPO_MAX_POINTS):
            chunk = remaining[start : start + OPENTOPO_MAX_POINTS]
            try:
                values = await _opentopo_batch([points[i] for i in chunk], dataset)
            except Exception as exc:  # noqa: BLE001
                log.warning("OpenTopoData/%s indisponible : %s", dataset, exc)
                continue
            for i, v in zip(chunk, values, strict=True):
                if v is not None:
                    out[i] = (v, f"opentopodata:{dataset}")

    return out


async def elevation_at(lat: float, lon: float, *, prefer: str = "auto") -> tuple[float | None, str | None]:
    return (await elevations([(lat, lon)], prefer=prefer))[0]
