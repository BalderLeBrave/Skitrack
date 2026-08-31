"""
Provider VRBO
"""
import asyncio
from typing import List, Optional
from urllib.parse import quote_plus

from playwright.async_api import async_playwright
from playwright_stealth import Stealth

from .base import BaseProvider, LodgingSearchParams, LodgingResult


class VRBOProvider(BaseProvider):
    name = "vrbo"
    base_url = "https://www.vrbo.com"
    
    async def scrape(
        self, 
        params: LodgingSearchParams, 
        respect_robots: bool = False
    ) -> List[LodgingResult]:
        results = []
        
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=["--disable-blink-features=AutomationControlled"]
                )
                
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    viewport={"width": 1920, "height": 1080},
                )
                
                page = await context.new_page()
                await Stealth().apply_stealth_async(page)
                
                query = quote_plus(params.destination)
                url = f"{self.base_url}/search?destination={query}"
                
                if params.checkin and params.checkout:
                    url += f"&startDate={params.checkin.isoformat()}"
                    url += f"&endDate={params.checkout.isoformat()}"
                
                self.logger.info(f"VRBO URL: {url}")
                await page.goto(url, wait_until="networkidle", timeout=30000)
                
                listings = await page.query_selector_all('[data-testid="listing"]')
                
                for listing in listings[:params.max_results]:
                    lodging = await self._extract_listing(listing)
                    if lodging:
                        results.append(lodging)
                
                await context.close()
                await browser.close()
                
        except Exception as e:
            self.logger.error(f"Erreur VRBO: {e}")
        
        return results
    
    async def _extract_listing(self, listing) -> Optional[LodgingResult]:
        try:
            title_el = await listing.query_selector('[data-testid="listing-title"]')
            title = await title_el.inner_text() if title_el else "VRBO Listing"
            
            price_el = await listing.query_selector('[data-testid="price"]')
            price_text = await price_el.inner_text() if price_el else "0"
            price, currency = self.normalize_price(price_text)
            
            rating = None
            rating_el = await listing.query_selector('[data-testid="rating"]')
            if rating_el:
                rating_text = await rating_el.inner_text()
                try:
                    rating = float(rating_text.split()[0])
                except:
                    pass
            
            img_el = await listing.query_selector("img")
            image_url = await img_el.get_attribute("src") if img_el else None
            
            link_el = await listing.query_selector("a")
            detail_url = ""
            if link_el:
                href = await link_el.get_attribute("href")
                detail_url = self.base_url + href if href and href.startswith("/") else href or ""
            
            return LodgingResult(
                title=title.strip()[:200],
                price_per_night=price,
                currency=currency,
                rating=rating,
                url=detail_url,
                image_url=image_url,
                source="vrbo"
            )
            
        except Exception as e:
            self.logger.debug(f"Extraction VRBO échouée: {e}")
            return None