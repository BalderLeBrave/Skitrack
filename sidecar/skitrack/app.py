"""Assemblage de l'application FastAPI."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from . import __version__
from .api.routes import (
    domains,
    geo,
    health,
    lodgings,
    referential,
    settings as settings_routes,
)
from .api.routes.lodging import router as lodging_router
from .config import get_settings
from .db.bootstrap import initialize
from .db.session import init_engine, session_scope
from .security import TokenAuthMiddleware
from .services import jobs
from .services.http import ProviderUnavailable, RateLimitError, close_http
from .services.settings_store import load as load_settings

log = logging.getLogger(__name__)


class ErrorEnvelopeMiddleware(BaseHTTPMiddleware):
    """Transforme toute erreur non prévue en réponse JSON, **sous** CORS.

    Un `@app.exception_handler(Exception)` ne conviendrait pas : Starlette
    l'installe sur `ServerErrorMiddleware`, qui est le middleware le plus
    externe — sa réponse ne traverse donc jamais CORSMiddleware. Le navigateur
    ne voit alors aucun en-tête `Access-Control-Allow-Origin` et signale
    « TypeError: Failed to fetch », ce qui rend un bug serveur indiscernable
    d'une coupure réseau. Constaté en conditions réelles sur un HTTP 500.

    Les `HTTPException` (404, 422…) sont traitées plus bas par
    `ExceptionMiddleware` et ne remontent pas jusqu'ici : leur format n'est pas
    modifié.
    """

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:  # noqa: BLE001 — c'est précisément le filet
            log.exception("Erreur non gérée sur %s %s", request.method, request.url.path)
            return JSONResponse(
                status_code=500,
                content={
                    "code": "internal_error",
                    "message": f"{type(exc).__name__}: {exc}",
                    "detail": "Consultez le journal du moteur local (écran d'amorçage → Journal).",
                },
            )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    settings.ensure_dirs()
    init_engine(settings.db_path)
    with session_scope() as session:
        initialize(session)
    load_settings()
    log.info("Sidecar prêt — base : %s", settings.db_path)
    try:
        yield
    finally:
        await jobs.shutdown()
        await close_http()


def create_app() -> FastAPI:
    app = FastAPI(
        title="SKITRACK — sidecar",
        version=__version__,
        description=(
            "API locale de SKITRACK. Écoute uniquement sur 127.0.0.1 et exige "
            "le token de session généré par Electron (en-tête X-Skitrack-Token)."
        ),
        lifespan=lifespan,
    )
    # Ordre important : `add_middleware` empile de l'intérieur vers l'extérieur,
    # le dernier ajouté est donc le plus externe. On veut :
    #
    #     CORS  →  authentification  →  enveloppe d'erreur  →  routes
    #
    # CORS doit envelopper l'authentification, sinon la requête préliminaire
    # OPTIONS (déclenchée par l'en-tête X-Skitrack-Token) partirait sans en-têtes
    # CORS et le navigateur bloquerait tout appel.
    app.add_middleware(ErrorEnvelopeMiddleware)
    app.add_middleware(TokenAuthMiddleware)
    app.add_middleware(
        CORSMiddleware,
        # Le renderer est `http://localhost:5173` en développement et `file://`
        # (origine `null`) une fois empaqueté : les deux sont cross-origin par
        # rapport à `http://127.0.0.1:<port>`.
        allow_origin_regex=r"^(null|file://.*|http://(localhost|127\.0\.0\.1)(:\d+)?)$",
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-Skitrack-Token"],
        # Pas de cookies : l'authentification passe par un en-tête. Autoriser les
        # identifiants élargirait la surface sans rien apporter.
        allow_credentials=False,
        max_age=600,
    )

    @app.exception_handler(RateLimitError)
    async def _rate_limit(_request: Request, exc: RateLimitError) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={
                "code": "rate_limited",
                "message": str(exc),
                "detail": (
                    "Le quota du fournisseur est épuisé. Les résultats déjà en "
                    "cache restent consultables."
                ),
            },
        )

    @app.exception_handler(ProviderUnavailable)
    async def _provider_down(_request: Request, exc: ProviderUnavailable) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={"code": "provider_unavailable", "message": str(exc)},
        )

    app.include_router(health.router, prefix="/api")
    app.include_router(domains.router, prefix="/api")
    app.include_router(geo.router, prefix="/api")
    app.include_router(lodgings.router, prefix="/api")
    app.include_router(referential.router, prefix="/api")
    app.include_router(settings_routes.router, prefix="/api")
    # Routes de scraping (pile « v2 »). Sans préfixe : le routeur porte déjà le
    # sien (`/api`). Elles étaient montées sur une seconde application créée au
    # niveau du module, que `__main__.py` ne sert jamais — donc injoignables, et
    # sans le middleware de token qui protège tout le reste.
    app.include_router(lodging_router)
    return app
