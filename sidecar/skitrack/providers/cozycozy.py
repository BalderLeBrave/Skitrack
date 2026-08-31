"""
Provider CozyCozy - HTTP direct
"""
from typing import List, Optional
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

from .base import BaseProvider, LodgingSearchParams, LodgingResult


class CozyCozyProvider(BaseProvider):
    name = "cozycozy"
    base_url = "https://www.cozycozy.com"
    
    def __init__(self, proxy_manager=None, captcha_solver=None):
        super().__init__(proxy_manager, captcha_solver)
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        }
    
    async def scrape(
        self, 
        params: LodgingSearchParams, 
        respect_robots: bool = False
    ) -> List[LodgingResult]:
        results = []
        
        try:
            location = quote_plus(params.destination)
            url = f"{self.base_url}/fr/search?location={location}"
            
            if params.checkin and params.checkout:
                url += f"&checkin={params.checkin.isoformat()}"
                url += f"&checkout={params.checkout.isoformat()}"
            
            if params.guests:
                url += f"&guests={params.guests}"
            
            self.logger.info(f"CozyCozy: {url}")
            
            async with httpx.AsyncClient(
                headers=self.headers,
                follow_redirects=True,
                timeout=30.0
            ) as client:
                
                if self.proxy_manager:
                    proxy = self.proxy_manager.get_random_proxy()
                    if proxy:
                        client.proxies = {"http://": proxy, "https://": proxy}
                
                response = await client.get(url)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, 'lxml')
                results = self._parse_results(soup, params.max_results)
                
        except Exception as e:
            self.logger.error(f"Erreur CozyCozy: {e}")
        
        return results
    
    def _parse_results(self, soup: BeautifulSoup, max_results: int) -> List[LodgingResult]:
        results = []
        cards = soup.find_all("div", class_=lambda x: x and "card" in x.lower())
        
        if not cards:
            cards = soup.find_all("a", href=lambda x: x and "/fr/" in x)
        
        for card in cards[:max_results]:
            try:
                lodging = self._extract_card(card)
                if lodging:
                    results.append(lodging)
            except Exception as e:
                self.logger.debug(f"Extraction carte échouée: {e}")
        
        return results
    
    def _extract_card(self, card) -> Optional[LodgingResult]:
        try:
            title = ""
            title_el = card.find(["h3", "h2", "h4"]) or card.find(class_=lambda x: x and "title" in x.lower())
            if title_el:
                title = title_el.get_text(strip=True)
            
            if not title:
                title = card.get_text(strip=True)[:100]
            
            price = 0.0
            currency = "EUR"
            price_el = card.find(class_=lambda x: x and "price" in x.lower())
            if price_el:
                price_text = price_el.get_text(strip=True)
                price, currency = self.normalize_price(price_text)
            
            image_url = None
            img = card.find("img")
            if img:
                image_url = img.get("src") or img.get("data-src")
            
            detail_url = ""
            link = card if card.name == "a" else card.find("a", href=True)
            if link:
                href = link.get("href", "")
                detail_url = self.base_url + href if href.startswith("/") else href
            
            if title and price > 0:
                return LodgingResult(
                    title=title[:200],
                    price_per_night=price,
                    currency=currency,
                    url=detail_url,
                    image_url=image_url,
                    source="cozycozy"
                )
            
        except Exception as e:
            self.logger.debug(f"Erreur extraction: {e}")
        
        return None