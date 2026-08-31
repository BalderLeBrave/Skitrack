"""
Provider Booking.com
"""
import asyncio
import random
from typing import List, Optional
from datetime import date
from urllib.parse import quote_plus

from playwright.async_api import async_playwright
from playwright_stealth import Stealth

from .base import BaseProvider, LodgingSearchParams, LodgingResult


class BookingProvider(BaseProvider):
    name = "booking"
    base_url = "https://www.booking.com"
    
    def __init__(self, proxy_manager=None, captcha_solver=None):
        super().__init__(proxy_manager, captcha_solver)
        self.selectors = {
            "card": '[data-testid="property-card"]',
            "title": '[data-testid="title"]',
            "price": '[data-testid="price-and-discounted-price"]',
            "rating": '[data-testid="review-score"]',
        }
    
    async def scrape(
        self, 
        params: LodgingSearchParams, 
        respect_robots: bool = False
    ) -> List[LodgingResult]:
        results = []
        
        try:
            async with async_playwright() as p:
                launch_args = {
                    "headless": True,
                    "args": [
                        "--disable-blink-features=AutomationControlled",
                        "--no-sandbox",
                        "--disable-dev-shm-usage",
                    ]
                }
                
                if self.proxy_manager:
                    proxy = self.proxy_manager.get_random_proxy()
                    if proxy:
                        launch_args["proxy"] = {"server": proxy}
                
                browser = await p.chromium.launch(**launch_args)
                
                context = await browser.new_context(
                    viewport={"width": 1920, "height": 1080},
                    user_agent=self._get_random_user_agent(),
                    locale="fr-FR",
                )
                
                await context.add_init_script("""
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined
                    });
                """)
                
                page = await context.new_page()
                await Stealth().apply_stealth_async(page)
                
                search_url = self._build_search_url(params)
                self.logger.info(f"Navigation Booking: {search_url}")
                
                await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
                
                await self._handle_popups(page)
                
                try:
                    await page.wait_for_selector(
                        self.selectors["card"],
                        state="visible",
                        timeout=20000
                    )
                except:
                    self.logger.warning("Sélecteur non trouvé")
                
                await self._scroll_page(page)
                
                cards = await page.query_selector_all(self.selectors["card"])
                self.logger.info(f"Booking: {len(cards)} cartes trouvées")
                
                for card in cards[:params.max_results]:
                    lodging = await self._extract_card(card)
                    if lodging:
                        results.append(lodging)
                
        except Exception as e:
            self.logger.error(f"Erreur Booking: {e}")
        finally:
            if 'browser' in locals():
                await browser.close()
        
        return results
    
    def _build_search_url(self, params: LodgingSearchParams) -> str:
        ss = quote_plus(params.destination)
        url = f"{self.base_url}/searchresults.html?ss={ss}"
        
        if params.checkin:
            url += f"&checkin={params.checkin.isoformat()}"
        if params.checkout:
            url += f"&checkout={params.checkout.isoformat()}"
        if params.guests:
            url += f"&group_adults={params.guests}"
        
        return url
    
    async def _extract_card(self, card) -> Optional[LodgingResult]:
        try:
            title_el = await card.query_selector(self.selectors["title"])
            title = await title_el.inner_text() if title_el else "Sans titre"
            
            price_el = await card.query_selector(self.selectors["price"])
            price_text = await price_el.inner_text() if price_el else "0 €"
            price, currency = self.normalize_price(price_text)
            
            rating = None
            rating_el = await card.query_selector(self.selectors["rating"])
            if rating_el:
                score_text = await rating_el.inner_text()
                parts = score_text.split()
                for part in parts:
                    part = part.replace(',', '.')
                    try:
                        score = float(part)
                        if 0 <= score <= 10:
                            rating = score
                            break
                    except:
                        continue
            
            image_url = None
            img_el = await card.query_selector("img")
            if img_el:
                image_url = await img_el.get_attribute("src")
            
            link_el = await card.query_selector("a")
            detail_url = ""
            if link_el:
                href = await link_el.get_attribute("href")
                if href:
                    detail_url = self.base_url + href if href.startswith("/") else href
            
            return LodgingResult(
                title=title.strip()[:200],
                price_per_night=price,
                currency=currency,
                rating=rating,
                url=detail_url,
                image_url=image_url,
                source="booking"
            )
            
        except Exception as e:
            self.logger.debug(f"Extraction carte échouée: {e}")
            return None
    
    async def _handle_popups(self, page):
        try:
            cookie_selectors = [
                '#onetrust-accept-btn-handler',
                'button:has-text("Accepter")',
            ]
            
            for selector in cookie_selectors:
                try:
                    btn = await page.wait_for_selector(selector, timeout=3000)
                    if btn:
                        await btn.click()
                        await asyncio.sleep(0.5)
                        break
                except:
                    continue
        except:
            pass
    
    async def _scroll_page(self, page):
        for _ in range(3):
            await page.evaluate("window.scrollBy(0, window.innerHeight)")
            await asyncio.sleep(0.5)
    
    def _get_random_user_agent(self) -> str:
        try:
            from fake_useragent import UserAgent
            return UserAgent().random
        except:
            return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"