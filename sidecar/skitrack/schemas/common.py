from __future__ import annotations

import datetime as dt
from typing import Any, Literal

from pydantic import BaseModel, Field


class ProblemDetail(BaseModel):
    """Format d'erreur unique renvoyé par le sidecar (RFC 7807 allégé)."""

    code: str
    message: str
    detail: str | None = None


class ProviderStatus(BaseModel):
    name: str
    kind: Literal["lodging", "routing", "elevation", "weather", "geocoding"]
    enabled: bool
    configured: bool
    label: str
    """Libellé affiché dans l'UI, ex. « Expedia Rapid (non configuré) »."""
    reason: str | None = None
    docs_url: str | None = None
    last_error: str | None = None


class JobStatus(BaseModel):
    """Suivi d'une tâche longue (import du référentiel, pré-calcul des trajets)."""

    id: str
    kind: str
    state: Literal["pending", "running", "done", "error", "cancelled"]
    progress: float = Field(0.0, ge=0.0, le=1.0)
    message: str = ""
    result: dict[str, Any] | None = None
    error: str | None = None
    started_at: dt.datetime | None = None
    finished_at: dt.datetime | None = None
