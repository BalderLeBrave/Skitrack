"""Import et entretien du référentiel des domaines."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...config import get_settings
from ...db.session import get_session, session_scope
from ...ingest.curated import apply_curated
from ...ingest.glaciers import detect_glaciers
from ...ingest.openskimap import (
    DEFAULT_URLS,
    download_dump,
    dump_summary,
    import_lifts,
    import_runs,
    import_ski_areas,
    load_local_dump,
)
from ...schemas.common import JobStatus
from ...services import jobs

router = APIRouter(prefix="/referential", tags=["referential"])


class ImportRequest(BaseModel):
    countries: list[str] = Field(default_factory=lambda: ["FR"])
    with_lifts: bool = True
    with_runs: bool = True
    detect_glaciers: bool = False
    """Une requête Overpass par pays. Désactivé par défaut : c'est une ressource
    communautaire gratuite, on ne la sollicite que sur demande explicite."""
    force_download: bool = False
    ski_areas_file: str | None = None
    lifts_file: str | None = None
    runs_file: str | None = None
    """Dumps déjà téléchargés à la main — utile en réseau contraint."""


@router.get("/sources")
def sources() -> dict:
    settings = get_settings()
    settings.ensure_dirs()
    local = {}
    for kind in DEFAULT_URLS:
        path = settings.downloads_dir / f"{kind}.geojson"
        local[kind] = dump_summary(path) if path.exists() else None
    return {
        "urls": DEFAULT_URLS,
        "local_dumps": local,
        "license": "Données OpenStreetMap sous ODbL, via OpenSkiMap.",
        "attribution": "© contributeurs OpenStreetMap — OpenSkiMap.org",
    }


@router.post("/import", response_model=JobStatus)
async def start_import(req: ImportRequest) -> JobStatus:
    # `async def` obligatoire : `jobs.start()` appelle `asyncio.create_task()`,
    # qui exige une boucle d'événements courante. FastAPI exécute les endpoints
    # synchrones dans un threadpool, où il n'y en a pas — l'appel lèverait un
    # RuntimeError transformé en HTTP 500.
    async def body(handle: jobs.JobHandle) -> dict:
        result: dict = {}

        handle.progress(0.02, "Récupération du dump des domaines…")
        if req.ski_areas_file:
            areas_path = load_local_dump(req.ski_areas_file)
        else:
            areas_path = await download_dump(
                "ski_areas",
                force=req.force_download,
                progress=lambda p, m: handle.progress(0.02 + 0.18 * p, m),
            )

        handle.progress(0.22, "Import des domaines…")
        with session_scope() as session:
            result["ski_areas"] = import_ski_areas(
                session,
                areas_path,
                countries=req.countries,
                progress=lambda p, m: handle.progress(0.22 + 0.23 * p, m),
            )

        if req.with_lifts:
            handle.progress(0.45, "Récupération du dump des remontées (~107 Mo)…")
            if req.lifts_file:
                lifts_path = load_local_dump(req.lifts_file)
            else:
                lifts_path = await download_dump(
                    "lifts",
                    force=req.force_download,
                    progress=lambda p, m: handle.progress(0.45 + 0.20 * p, m),
                )
            handle.progress(0.65, "Import des remontées…")
            with session_scope() as session:
                result["lifts"] = import_lifts(
                    session,
                    lifts_path,
                    countries=req.countries,
                    progress=lambda p, m: handle.progress(0.65 + 0.10 * p, m),
                )

        if req.with_runs:
            handle.progress(0.76, "Récupération du dump des pistes…")
            if req.runs_file:
                runs_path = load_local_dump(req.runs_file)
            else:
                runs_path = await download_dump(
                    "runs",
                    force=req.force_download,
                    progress=lambda p, m: handle.progress(0.76 + 0.06 * p, m),
                )
            handle.progress(0.83, "Import des pistes…")
            with session_scope() as session:
                result["runs"] = import_runs(
                    session,
                    runs_path,
                    countries=req.countries,
                    progress=lambda p, m: handle.progress(0.83 + 0.08 * p, m),
                )

        if req.detect_glaciers:
            handle.progress(0.86, "Détection des glaciers (Overpass)…")
            with session_scope() as session:
                result["glaciers"] = await detect_glaciers(session, countries=req.countries)

        handle.progress(0.95, "Application des données curatées…")
        with session_scope() as session:
            result["curated"] = apply_curated(session)

        return result

    return jobs.start("referential.import", body)


@router.post("/curated/apply")
def reapply_curated(session: Session = Depends(get_session)) -> dict:
    """Recharge le YAML curaté sans refaire l'import — pratique pendant la saisie."""
    return apply_curated(session)


@router.post("/glaciers/detect", response_model=JobStatus)
async def start_glacier_detection(countries: list[str] | None = None) -> JobStatus:
    async def body(handle: jobs.JobHandle) -> dict:
        handle.progress(0.1, "Requête Overpass…")
        with session_scope() as session:
            return await detect_glaciers(session, countries=countries or ["FR"])

    return jobs.start("referential.glaciers", body)


@router.delete("/dumps/{kind}")
def delete_dump(kind: str) -> dict:
    if kind not in DEFAULT_URLS:
        raise HTTPException(status_code=404, detail=f"Dump inconnu : {kind}")
    path: Path = get_settings().downloads_dir / f"{kind}.geojson"
    if path.exists():
        path.unlink()
        return {"deleted": str(path)}
    return {"deleted": None}
