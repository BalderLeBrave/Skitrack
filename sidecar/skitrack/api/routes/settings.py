"""Préférences, secrets, état des sources, jobs, deep-links."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ...providers.deeplinks import DeepLink, DeepLinkRequest, build_links, reload_config
from ...providers.registry import provider_statuses
from ...schemas.common import JobStatus, ProviderStatus
from ...services import jobs, secrets
from ...services.http import purge_cache
from ...services.settings_store import all_settings, set_settings

router = APIRouter(tags=["settings"])


class SettingsPatch(BaseModel):
    values: dict[str, object] = Field(default_factory=dict)


class SecretsPayload(BaseModel):
    """Clés d'API poussées par Electron après déchiffrement DPAPI.

    Elles restent en mémoire du sidecar. Rien n'est écrit en base ni en log.
    """

    values: dict[str, str] = Field(default_factory=dict)


@router.get("/settings")
def read_settings() -> dict:
    return {"settings": all_settings(), "secrets_configured": secrets.configured_keys()}


@router.patch("/settings")
def patch_settings(payload: SettingsPatch) -> dict:
    return {"settings": set_settings(payload.values)}


@router.post("/settings/secrets")
def push_secrets(payload: SecretsPayload) -> dict:
    unknown = secrets.set_secrets(payload.values)
    return {"configured": secrets.configured_keys(), "unknown_ignored": unknown}


@router.get("/providers", response_model=list[ProviderStatus])
def providers() -> list[ProviderStatus]:
    return provider_statuses()


@router.post("/deeplinks", response_model=list[DeepLink])
def deeplinks(req: DeepLinkRequest) -> list[DeepLink]:
    """Construit les URLs de recherche pré-remplies. Aucune n'est appelée ici :
    l'app se contente de les fabriquer, l'utilisateur décide de les ouvrir."""
    return build_links(req)


@router.post("/deeplinks/reload")
def deeplinks_reload() -> dict:
    reload_config()
    return {"reloaded": True}


@router.get("/jobs", response_model=list[JobStatus])
def list_jobs() -> list[JobStatus]:
    return jobs.list_jobs()


@router.get("/jobs/{job_id}", response_model=JobStatus)
def get_job(job_id: str) -> JobStatus:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job inconnu")
    return job


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str) -> dict:
    return {"cancelled": jobs.cancel(job_id)}


@router.delete("/cache")
def clear_cache(namespace: str | None = None) -> dict:
    """Purge du cache HTTP. `namespace` parmi elevation / route / geocode /
    weather / offer — purger les altitudes n'a aucun intérêt et coûte des
    milliers d'appels, d'où la purge sélective."""
    return {"deleted": purge_cache(namespace)}
