"""
Routes API pour le scraping
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import date

from ...providers.base import LodgingSearchParams
from ...providers.registry import create_provider, list_providers
from ...services.proxy_manager import ProxyManager
from ...services.captcha_solver import CaptchaSolver

router = APIRouter(prefix="/api", tags=["lodging"])


def get_proxy_manager():
    return ProxyManager()


def get_captcha_solver():
    return CaptchaSolver()


@router.post("/scrape/{provider_name}")
async def scrape_lodgings(
    provider_name: str,
    request: dict,
    proxy_manager: ProxyManager = Depends(get_proxy_manager),
    captcha_solver: CaptchaSolver = Depends(get_captcha_solver)
):
    available = list_providers()
    if provider_name not in available:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{provider_name}' non disponible. Disponibles: {available}"
        )
    
    provider = create_provider(provider_name, proxy_manager, captcha_solver)
    if not provider:
        raise HTTPException(status_code=500, detail=f"Erreur création provider {provider_name}")
    
    try:
        params = LodgingSearchParams(
            destination=request.get("destination", ""),
            checkin=date.fromisoformat(request["checkin"]) if request.get("checkin") else None,
            checkout=date.fromisoformat(request["checkout"]) if request.get("checkout") else None,
            guests=request.get("guests", 2),
            latitude=request.get("latitude"),
            longitude=request.get("longitude"),
            max_results=request.get("max_results", 50),
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Paramètres invalides: {e}")
    
    try:
        results = await provider.scrape(params, respect_robots=False)
        return {
            "success": True,
            "provider": provider_name,
            "count": len(results),
            "results": [r.to_dict() for r in results]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur scraping: {str(e)}")


@router.get("/providers")
async def get_providers():
    return {"providers": list_providers()}