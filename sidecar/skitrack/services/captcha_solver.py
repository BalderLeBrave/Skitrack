"""
Solveur de CAPTCHA via 2captcha
"""
import os
import logging
import asyncio
from typing import Optional
import httpx

logger = logging.getLogger(__name__)


class CaptchaSolver:
    API_URL = "https://2captcha.com/in.php"
    RESULT_URL = "https://2captcha.com/res.php"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("CAPTCHA_API_KEY")
        if not self.api_key:
            logger.warning("Aucune clé API 2captcha configurée")
    
    async def solve_recaptcha(
        self, 
        site_key: str, 
        page_url: str,
        version: str = "v2",
        enterprise: bool = False
    ) -> Optional[str]:
        if not self.api_key:
            logger.error("Clé API 2captcha manquante")
            return None
        
        try:
            captcha_id = await self._submit_recaptcha(
                site_key, page_url, version, enterprise
            )
            
            if not captcha_id:
                return None
            
            token = await self._wait_for_solution(captcha_id)
            return token
            
        except Exception as e:
            logger.error(f"Erreur résolution CAPTCHA: {e}")
            return None
    
    async def _submit_recaptcha(self, site_key, page_url, version, enterprise):
        params = {
            "key": self.api_key,
            "method": "userrecaptcha",
            "googlekey": site_key,
            "pageurl": page_url,
            "json": "1",
        }
        
        if version == "v3":
            params["version"] = "v3"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(self.API_URL, params=params)
            data = response.json()
            
            if data.get("status") == 1:
                captcha_id = data.get("request")
                logger.info(f"CAPTCHA soumis, ID: {captcha_id}")
                return captcha_id
            else:
                logger.error(f"Erreur soumission: {data}")
                return None
    
    async def _wait_for_solution(self, captcha_id: str, max_wait: int = 120):
        params = {
            "key": self.api_key,
            "action": "get",
            "id": captcha_id,
            "json": "1",
        }
        
        start_time = asyncio.get_event_loop().time()
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            while (asyncio.get_event_loop().time() - start_time) < max_wait:
                await asyncio.sleep(5)
                
                response = await client.get(self.RESULT_URL, params=params)
                data = response.json()
                
                if data.get("status") == 1:
                    token = data.get("request")
                    logger.info("CAPTCHA résolu")
                    return token
        
        logger.error("Timeout attente solution CAPTCHA")
        return None