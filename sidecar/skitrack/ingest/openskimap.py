"""Import du référentiel depuis les dumps GeoJSON OpenSkiMap.

Source
------
OpenSkiMap (Russell Porter) publie quotidiennement trois dumps dérivés
d'OpenStreetMap et de Skimap.org :

* ``https://tiles.openskimap.org/geojson/ski_areas.geojson`` (~22 Mo)
* ``https://tiles.openskimap.org/geojson/lifts.geojson``     (~107 Mo)
* ``https://tiles.openskimap.org/geojson/runs.geojson``      (plusieurs centaines de Mo)

URLs vérifiées le 2026-08-11. Elles ne font l'objet d'aucun contrat : elles sont
donc **paramétrables** dans ``data/reference/datasources.yaml`` et l'import
accepte aussi un fichier local (``--file``), pour ne pas dépendre d'un chemin
qui peut bouger.

Licence : données OpenStreetMap sous **ODbL**. L'attribution
« © contributeurs OpenStreetMap / OpenSkiMap » est affichée dans l'UI et doit le
rester en cas de redistribution.

Ce que le dump donne — et ce qu'il ne donne pas
-----------------------------------------------
Donné, fiable : nom, pays/région/communes, code ISO 3166-2, statut, activités,
altitudes min/max des pistes et des remontées, longueurs par difficulté,
nombre de remontées par type, site officiel, géométrie d'emprise.

**Non donné** : altitude du village, présence d'un glacier, % de neige de
culture (renseigné sur ~4 % des domaines français), dates de saison, URL de
réservation. Ces champs viennent du fichier curated ou d'un enrichissement
dédié — jamais inventés. Voir docs/RISQUES.md.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import ijson
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import DomainLift, SkiDomain
from ..services.geo_math import bbox_of, centroid_of
from ..services.massif import massif_for

log = logging.getLogger(__name__)

DEFAULT_URLS = {
    "ski_areas": "https://tiles.openskimap.org/geojson/ski_areas.geojson",
    "lifts": "https://tiles.openskimap.org/geojson/lifts.geojson",
    "runs": "https://tiles.openskimap.org/geojson/runs.geojson",
}

#: Difficulté OpenSkiData -> couleur européenne. La couleur n'est pas stockée sur
#: la piste (la même difficulté se colore autrement en Amérique du Nord) mais
#: agrégée ici, car l'UI française raisonne en vert/bleu/rouge/noir.
DIFFICULTY_TO_COLOR = {
    "novice": "vert",
    "easy": "bleu",
    "intermediate": "rouge",
    "advanced": "noir",
    "expert": "noir",
    "freeride": "freeride",
    "extreme": "noir",
    "other": "autre",
}

ProgressFn = Callable[[float, str], None]


def _noop(_progress: float, _message: str) -> None:
    return None


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-") or "domaine"


# --------------------------------------------------------------------------- #
# Téléchargement
# --------------------------------------------------------------------------- #


async def download_dump(kind: str, *, force: bool = False, progress: ProgressFn = _noop) -> Path:
    """Télécharge un dump dans le cache. Ne retélécharge pas si le fichier date
    de moins de 24 h (les dumps sont régénérés quotidiennement)."""
    import time

    import httpx

    settings = get_settings()
    settings.ensure_dirs()
    url = DEFAULT_URLS[kind]
    target = settings.downloads_dir / f"{kind}.geojson"

    if target.exists() and not force:
        age_h = (time.time() - target.stat().st_mtime) / 3600
        if age_h < 24:
            progress(1.0, f"{kind}: dump local à jour ({age_h:.1f} h)")
            return target

    tmp = target.with_suffix(".part")
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(60.0, read=600.0),
        headers={"User-Agent": settings.user_agent},
        follow_redirects=True,
    ) as client:
        async with client.stream("GET", url) as resp:
            resp.raise_for_status()
            total = int(resp.headers.get("Content-Length") or 0)
            written = 0
            with tmp.open("wb") as fh:
                async for chunk in resp.aiter_bytes(1 << 20):
                    fh.write(chunk)
                    written += len(chunk)
                    if total:
                        progress(written / total, f"{kind}: {written / 1e6:.0f} / {total / 1e6:.0f} Mo")
                    else:
                        progress(0.0, f"{kind}: {written / 1e6:.0f} Mo")
    tmp.replace(target)
    progress(1.0, f"{kind}: téléchargé ({target.stat().st_size / 1e6:.0f} Mo)")
    return target


# --------------------------------------------------------------------------- #
# Lecture en flux
# --------------------------------------------------------------------------- #


def iter_features(path: Path) -> Iterator[dict[str, Any]]:
    """Itère les features sans charger le fichier en mémoire.

    Indispensable pour ``lifts.geojson`` (107 Mo, chaque remontée réembarquant
    la fiche complète de son domaine) et a fortiori pour ``runs.geojson``.
    """
    with path.open("rb") as fh:
        yield from ijson.items(fh, "features.item", use_float=True)


# --------------------------------------------------------------------------- #
# Mapping
# --------------------------------------------------------------------------- #


def _places_info(props: dict) -> tuple[str | None, str | None, str | None, list[str]]:
    """(country, region, admin_code, localities) depuis `properties.places`."""
    places = props.get("places") or []
    country = region = admin_code = None
    localities: list[str] = []
    for place in places:
        country = country or place.get("iso3166_1Alpha2")
        admin_code = admin_code or place.get("iso3166_2")
        loc = (place.get("localized") or {}).get("en") or {}
        region = region or loc.get("region")
        if loc.get("locality"):
            localities.append(loc["locality"])
    # dédoublonnage en conservant l'ordre (utile pour l'affichage)
    seen: set[str] = set()
    localities = [x for x in localities if not (x in seen or seen.add(x))]
    return country, region, admin_code, localities


def _downhill_stats(props: dict) -> dict[str, Any]:
    stats = props.get("statistics") or {}
    runs = stats.get("runs") or {}
    downhill = ((runs.get("byActivity") or {}).get("downhill") or {}).get("byDifficulty") or {}

    km_by_color: dict[str, float] = {}
    count_by_color: dict[str, int] = {}
    km_total = 0.0
    km_snowmaking = 0.0
    for difficulty, entry in downhill.items():
        color = DIFFICULTY_TO_COLOR.get(difficulty, "autre")
        km = float(entry.get("lengthInKm") or 0.0)
        km_by_color[color] = round(km_by_color.get(color, 0.0) + km, 2)
        count_by_color[color] = count_by_color.get(color, 0) + int(entry.get("count") or 0)
        km_total += km
        km_snowmaking += float(entry.get("snowmakingLengthInKm") or 0.0)

    lifts = stats.get("lifts") or {}
    by_type = lifts.get("byType") or {}
    lifts_count = sum(int(v.get("count") or 0) for v in by_type.values())
    lifts_km = sum(float(v.get("lengthInKm") or 0.0) for v in by_type.values())

    # OSM ne renseigne `piste:snowmaking` que très partiellement : une valeur de 0
    # signifie « non cartographié », pas « pas de neige de culture ». On ne
    # renvoie donc rien plutôt qu'un 0 % qui exclurait à tort le domaine d'un
    # filtre « enneigement artificiel ≥ 30 % ».
    snowmaking_pct = (
        round(100.0 * km_snowmaking / km_total) if km_total > 0 and km_snowmaking > 0 else None
    )

    return {
        "slopes_km_total": round(km_total, 1) if km_total else None,
        "slopes_km_by_color": km_by_color or None,
        "slopes_count_by_color": count_by_color or None,
        "lifts_count": lifts_count or None,
        "lifts_count_by_type": {k: int(v.get("count") or 0) for k, v in by_type.items()} or None,
        "lifts_km_total": round(lifts_km, 1) if lifts_km else None,
        "snowmaking_pct": snowmaking_pct,
        "snowmaking_source": "openskimap" if snowmaking_pct is not None else None,
        "altitude_min_m": _as_int((runs.get("minElevation")) or lifts.get("minElevation")),
        "altitude_max_m": _as_int((runs.get("maxElevation")) or lifts.get("maxElevation")),
    }


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _osm_id(props: dict) -> str | None:
    for src in props.get("sources") or []:
        if src.get("type") == "openstreetmap":
            return str(src.get("id"))
    return None


def map_ski_area(feature: dict) -> dict[str, Any] | None:
    """Feature OpenSkiMap -> dict de colonnes `SkiDomain`. `None` si inexploitable."""
    props = feature.get("properties") or {}
    source_id = props.get("id")
    name = props.get("name")
    if not source_id or not name:
        return None

    country, region, admin_code, localities = _places_info(props)
    geometry = feature.get("geometry")
    centroid = centroid_of(geometry)
    # `viewportHint.center` est [lon, lat] et cadre mieux le domaine que le centre
    # de bbox quand l'emprise est très allongée ; on le préfère quand il existe.
    hint = (props.get("viewportHint") or {}).get("center")
    if hint and len(hint) == 2:
        centroid = (float(hint[1]), float(hint[0]))

    websites = props.get("websites") or []

    row: dict[str, Any] = {
        "source": "openskimap",
        "source_id": str(source_id),
        "osm_id": _osm_id(props),
        "wikidata_id": props.get("wikidataID"),
        "name": name,
        "slug": slugify(name),
        "country": country,
        "region": region,
        "admin_code": admin_code,
        "massif": massif_for(admin_code, country),
        "localities": localities or None,
        "status": props.get("status") or "operating",
        "altitude_source": "openskimap",
        "official_website_url": websites[0] if websites else None,
        "centroid_lat": centroid[0] if centroid else None,
        "centroid_lon": centroid[1] if centroid else None,
        "bbox": bbox_of(geometry),
        "geometry": geometry,
    }
    row.update(_downhill_stats(props))
    return row


# --------------------------------------------------------------------------- #
# Import
# --------------------------------------------------------------------------- #

UPDATABLE_FIELDS = (
    "osm_id",
    "wikidata_id",
    "name",
    "slug",
    "country",
    "region",
    "admin_code",
    "massif",
    "localities",
    "status",
    "altitude_min_m",
    "altitude_max_m",
    "altitude_source",
    "slopes_km_total",
    "slopes_km_by_color",
    "slopes_count_by_color",
    "lifts_count",
    "lifts_count_by_type",
    "lifts_km_total",
    "snowmaking_pct",
    "snowmaking_source",
    "official_website_url",
    "centroid_lat",
    "centroid_lon",
    "bbox",
    "geometry",
)


def import_ski_areas(
    session: Session,
    path: Path,
    *,
    countries: list[str] | None = None,
    activities: tuple[str, ...] = ("downhill",),
    include_status: tuple[str, ...] = ("operating",),
    progress: ProgressFn = _noop,
) -> dict[str, int]:
    """Charge/actualise les domaines. Idempotent : la clé est (source, source_id).

    Les champs curatés (`curated=True`) ne sont **pas** écrasés — voir
    `ingest/curated.py`, qui est réappliqué après chaque import.
    """
    countries_up = {c.upper() for c in countries} if countries else None
    existing = {
        row.source_id: row
        for row in session.execute(
            select(SkiDomain).where(SkiDomain.source == "openskimap")
        ).scalars()
    }

    seen = 0
    created = 0
    updated = 0
    skipped = 0

    for feature in iter_features(path):
        seen += 1
        if seen % 1000 == 0:
            progress(min(0.95, seen / 13000), f"{seen} domaines lus, {created + updated} retenus")

        props = feature.get("properties") or {}
        if activities and not (set(props.get("activities") or []) & set(activities)):
            skipped += 1
            continue
        if include_status and (props.get("status") or "operating") not in include_status:
            skipped += 1
            continue

        row = map_ski_area(feature)
        if row is None:
            skipped += 1
            continue
        if countries_up and (row["country"] or "").upper() not in countries_up:
            skipped += 1
            continue

        current = existing.get(row["source_id"])
        if current is None:
            session.add(SkiDomain(**row))
            created += 1
        else:
            for field in UPDATABLE_FIELDS:
                # Un champ figé à la main reste figé : l'import ne doit jamais
                # défaire une correction utilisateur.
                if current.curated and field in _CURATED_PROTECTED:
                    continue
                setattr(current, field, row[field])
            updated += 1

    session.commit()
    progress(1.0, f"{created} créés, {updated} mis à jour, {skipped} ignorés")
    return {"seen": seen, "created": created, "updated": updated, "skipped": skipped}


#: Champs qu'un import ne réécrit pas si le domaine a été curaté.
_CURATED_PROTECTED = {
    "name",
    "massif",
    "altitude_min_m",
    "altitude_max_m",
    "snowmaking_pct",
    "snowmaking_source",
    "official_website_url",
}


def import_lifts(
    session: Session,
    path: Path,
    *,
    countries: list[str] | None = None,
    progress: ProgressFn = _noop,
) -> dict[str, int]:
    """Charge les remontées des domaines déjà importés.

    Double intérêt :

    1. La **gare aval la plus basse** sert d'estimation d'`altitude_village_m`,
       que le dump des domaines ne fournit pas.
    2. Les coordonnées de gare aval alimenteront `walk_time_to_lift_min` en
       phase 2 — la remontée est plus pertinente que la piste : personne ne
       chausse au milieu d'une rouge.

    Les altitudes sont lues directement dans la 3ᵉ composante des coordonnées
    GeoJSON : aucun appel à une API altimétrique n'est nécessaire.
    """
    domains_by_source = {
        row.source_id: row
        for row in session.execute(
            select(SkiDomain).where(SkiDomain.source == "openskimap")
        ).scalars()
    }
    if not domains_by_source:
        return {"seen": 0, "imported": 0, "domains_touched": 0}

    countries_up = {c.upper() for c in countries} if countries else None

    # On repart de zéro pour les domaines concernés : une remontée démontée doit
    # disparaître, et un delete/insert coûte moins qu'un diff sur 30 000 objets.
    touched: set[int] = set()
    seen = 0
    imported = 0
    base_elevations: dict[int, list[float]] = {}
    to_add: list[DomainLift] = []

    for feature in iter_features(path):
        seen += 1
        if seen % 5000 == 0:
            progress(min(0.95, seen / 60000), f"{seen} remontées lues, {imported} retenues")

        props = feature.get("properties") or {}
        if (props.get("status") or "operating") != "operating":
            continue

        area_ids = [
            (a.get("properties") or {}).get("id")
            for a in props.get("skiAreas") or []
            if isinstance(a, dict)
        ]
        domain = next((domains_by_source[a] for a in area_ids if a in domains_by_source), None)
        if domain is None:
            continue
        if countries_up and (domain.country or "").upper() not in countries_up:
            continue

        geometry = feature.get("geometry")
        coords = _line_endpoints(geometry)
        if coords is None:
            continue
        (lon_a, lat_a, ele_a), (lon_b, lat_b, ele_b) = coords
        elevations = [e for e in (ele_a, ele_b) if e is not None]
        base = (lat_a, lon_a, ele_a) if (ele_a or 0) <= (ele_b or 0) else (lat_b, lon_b, ele_b)

        touched.add(domain.id)
        to_add.append(
            DomainLift(
                domain_id=domain.id,
                source_id=str(props.get("id") or ""),
                name=props.get("name"),
                lift_type=props.get("liftType"),
                elevation_min_m=min(elevations) if elevations else None,
                elevation_max_m=max(elevations) if elevations else None,
                base_lat=base[0],
                base_lon=base[1],
                geometry=geometry,
            )
        )
        if base[2] is not None:
            base_elevations.setdefault(domain.id, []).append(float(base[2]))
        imported += 1

    if touched:
        session.query(DomainLift).filter(DomainLift.domain_id.in_(touched)).delete(
            synchronize_session=False
        )
    session.add_all(to_add)

    for domain_id, elevations in base_elevations.items():
        domain = session.get(SkiDomain, domain_id)
        if domain is None or (domain.curated and domain.altitude_village_m is not None):
            continue
        domain.altitude_village_m = int(round(min(elevations)))
        domain.altitude_village_source = "derived:lift_base"

    session.commit()
    progress(1.0, f"{imported} remontées importées sur {len(touched)} domaines")
    return {"seen": seen, "imported": imported, "domains_touched": len(touched)}


def _line_endpoints(
    geometry: dict | None,
) -> tuple[tuple[float, float, float | None], tuple[float, float, float | None]] | None:
    """Premier et dernier point d'une LineString (ou de la 1ʳᵉ ligne d'une MultiLineString)."""
    if not geometry:
        return None
    coords = geometry.get("coordinates")
    gtype = geometry.get("type")
    if gtype == "MultiLineString" and coords:
        coords = coords[0]
    if gtype not in ("LineString", "MultiLineString") or not coords or len(coords) < 2:
        return None

    def unpack(pt: list) -> tuple[float, float, float | None]:
        ele = float(pt[2]) if len(pt) > 2 and pt[2] is not None else None
        return (float(pt[0]), float(pt[1]), ele)

    return unpack(coords[0]), unpack(coords[-1])


def load_local_dump(path: str | Path) -> Path:
    """Valide un dump fourni à la main (option `--file` de l'import)."""
    p = Path(path).expanduser().resolve()
    if not p.exists():
        raise FileNotFoundError(f"Dump introuvable : {p}")
    with p.open("rb") as fh:
        head = fh.read(200).decode("utf-8", "ignore")
    if '"FeatureCollection"' not in head:
        raise ValueError(f"{p.name} ne ressemble pas à une FeatureCollection GeoJSON")
    return p


def dump_summary(path: Path) -> dict[str, Any]:
    """Métadonnées d'un dump, pour affichage dans les réglages."""
    stat = path.stat()
    return {
        "path": str(path),
        "size_mb": round(stat.st_size / 1e6, 1),
        "modified_at": stat.st_mtime,
    }


__all__ = [
    "DEFAULT_URLS",
    "DIFFICULTY_TO_COLOR",
    "download_dump",
    "dump_summary",
    "import_lifts",
    "import_ski_areas",
    "iter_features",
    "load_local_dump",
    "map_ski_area",
    "slugify",
]
