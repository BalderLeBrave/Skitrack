"""Routes de la pile de scraping (« v2 »).

## Pourquoi le préfixe `/api/scrape` et non `/api`

Le routeur portait `prefix="/api"` et exposait `GET /providers` — donc
`GET /api/providers`, **le chemin déjà servi par `settings.providers`**, qui
alimente l'écran « Sources » et rend un `list[ProviderStatus]`. Les deux
étaient enregistrés ; Starlette retient le premier, `settings` était inclus
avant (`app.py`), et cette route-ci était masquée en silence. Une inversion de
l'ordre d'inclusion aurait suffi à servir `{"providers": [...]}` à un écran qui
attend une autre forme.

Le préfixe propre supprime la collision et rend les deux chemins joignables :
`POST /api/scrape/{provider_name}` et `GET /api/scrape/providers`.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from ...providers.base import LodgingSearchParams
from ...providers.registry import create_provider, list_providers
from ...services.captcha_solver import CaptchaSolver
from ...services.proxy_manager import ProxyManager

router = APIRouter(prefix="/api/scrape", tags=["lodging"])


def get_proxy_manager():
    return ProxyManager()


def get_captcha_solver():
    return CaptchaSolver()


@router.post("/captcha/solve")
async def solve_captcha(
    request: dict,
    captcha_solver: CaptchaSolver = Depends(get_captcha_solver),
):
    """Rebranche le `CaptchaSolver` existant (2captcha) sur un sitekey déjà vu.

    Appelé par Electron (`src/main/captchaBridge.ts`) après un challenge
    visible. Pas une nouvelle technique : même solveur, même clé `CAPTCHA_API_KEY`.
    Échec → `success: false`, jamais une liste vide côté client.
    """
    site_key = request.get("site_key")
    page_url = request.get("page_url")
    version = request.get("version", "v2")
    if not site_key or not page_url:
        raise HTTPException(status_code=400, detail="site_key et page_url requis")
    token = await captcha_solver.solve_recaptcha(str(site_key), str(page_url), str(version))
    if not token:
        return {"success": False, "reason": "challenge_unresolved"}
    return {"success": True, "token": token}


@router.post("/{provider_name}")
async def scrape_lodgings(
    provider_name: str,
    request: dict,
    proxy_manager: ProxyManager = Depends(get_proxy_manager),
    captcha_solver: CaptchaSolver = Depends(get_captcha_solver),
):
    available = list_providers()
    if provider_name not in available:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{provider_name}' non disponible. Disponibles: {available}",
        )

    provider = create_provider(provider_name, proxy_manager, captcha_solver)
    if not provider:
        raise HTTPException(
            status_code=500, detail=f"Erreur création provider {provider_name}"
        )

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
    except (ValueError, TypeError, KeyError) as e:
        raise HTTPException(status_code=400, detail=f"Paramètres invalides: {e}") from e

    # `scrape()` relève désormais quand elle n'a rien pu relever : cette branche
    # est atteignable, et une panne de connecteur ne se déguise plus en
    # « 0 logement trouvé ».
    try:
        results = await provider.scrape(params, respect_robots=False)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur scraping: {e}") from e

    return {
        "success": True,
        "provider": provider_name,
        "count": len(results),
        "results": [r.to_dict() for r in results],
    }


@router.get("/providers")
async def get_providers():
    return {"providers": list_providers()}
