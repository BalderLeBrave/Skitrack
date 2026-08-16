"""Authentification du sidecar.

Le serveur n'écoute que sur 127.0.0.1, ce qui ne suffit pas : sous Windows, tout
processus de la session peut joindre un port local. Un token de session généré
par Electron au démarrage et exigé sur chaque requête empêche une autre
application locale d'interroger la base ou de faire consommer les quotas d'API.

Le token est comparé en temps constant et n'est jamais journalisé.
"""

from __future__ import annotations

import hmac
import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import get_settings

log = logging.getLogger(__name__)

HEADER_NAME = "X-Skitrack-Token"

#: Chemins joignables sans token — strictement le nécessaire au handshake.
PUBLIC_PATHS = {"/api/health", "/openapi.json", "/docs", "/redoc", "/docs/oauth2-redirect"}


class TokenAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        settings = get_settings()
        if not settings.token:
            # Mode dev / tests : aucun token fourni au lancement, pas d'auth.
            return await call_next(request)

        if request.method == "OPTIONS" or request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        supplied = request.headers.get(HEADER_NAME, "")
        if not hmac.compare_digest(supplied, settings.token):
            return JSONResponse(
                status_code=401,
                content={
                    "code": "unauthorized",
                    "message": "Token de session invalide ou absent.",
                },
            )
        return await call_next(request)
