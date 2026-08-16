"""Registre de tâches longues en mémoire.

L'import du référentiel (téléchargement de 130 Mo + parsing) et le pré-calcul de
300 itinéraires dépassent largement le timeout d'une requête HTTP. Ils tournent
donc en tâche de fond et l'UI interroge `GET /api/jobs/{id}`.

En mémoire volontairement : un job perdu au redémarrage du sidecar n'a aucune
conséquence — il suffit de le relancer, tout est idempotent.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable

from ..db.base import utcnow
from ..schemas.common import JobStatus

log = logging.getLogger(__name__)

_JOBS: dict[str, JobStatus] = {}
_TASKS: dict[str, asyncio.Task] = {}
_MAX_KEPT = 50


class JobHandle:
    """Passé au corps du job pour publier son avancement."""

    def __init__(self, job_id: str) -> None:
        self.id = job_id

    def progress(self, value: float, message: str = "") -> None:
        job = _JOBS.get(self.id)
        if job is None:
            return
        job.progress = max(0.0, min(1.0, value))
        if message:
            job.message = message

    def cancelled(self) -> bool:
        job = _JOBS.get(self.id)
        return job is not None and job.state == "cancelled"


def _trim() -> None:
    if len(_JOBS) <= _MAX_KEPT:
        return
    finished = [j for j in _JOBS.values() if j.state in ("done", "error", "cancelled")]
    finished.sort(key=lambda j: j.finished_at or j.started_at or utcnow())
    for job in finished[: len(_JOBS) - _MAX_KEPT]:
        _JOBS.pop(job.id, None)
        _TASKS.pop(job.id, None)


def start(kind: str, body: Callable[[JobHandle], Awaitable[dict]]) -> JobStatus:
    job_id = uuid.uuid4().hex[:12]
    status = JobStatus(id=job_id, kind=kind, state="pending", started_at=utcnow())
    _JOBS[job_id] = status
    handle = JobHandle(job_id)

    async def runner() -> None:
        status.state = "running"
        try:
            result = await body(handle)
            if status.state != "cancelled":
                status.state = "done"
                status.result = result
                status.progress = 1.0
        except asyncio.CancelledError:
            status.state = "cancelled"
            status.message = "Annulé"
            raise
        except Exception as exc:  # noqa: BLE001 — remonté tel quel à l'UI
            log.exception("Job %s (%s) en échec", job_id, kind)
            status.state = "error"
            status.error = f"{type(exc).__name__}: {exc}"
        finally:
            status.finished_at = utcnow()
            _trim()

    _TASKS[job_id] = asyncio.create_task(runner())
    return status


def get(job_id: str) -> JobStatus | None:
    return _JOBS.get(job_id)


def list_jobs() -> list[JobStatus]:
    return sorted(_JOBS.values(), key=lambda j: j.started_at or utcnow(), reverse=True)


def cancel(job_id: str) -> bool:
    task = _TASKS.get(job_id)
    job = _JOBS.get(job_id)
    if task is None or job is None or job.state in ("done", "error", "cancelled"):
        return False
    job.state = "cancelled"
    task.cancel()
    return True


async def shutdown() -> None:
    for task in list(_TASKS.values()):
        if not task.done():
            task.cancel()
    if _TASKS:
        await asyncio.gather(*_TASKS.values(), return_exceptions=True)
    _TASKS.clear()
