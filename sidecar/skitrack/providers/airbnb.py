"""
Provider Airbnb avec Playwright Stealth
"""
import asyncio
import random
from typing import List, Optional
from datetime import date
from urllib.parse import quote_plus

from playwright.async_api import async_playwright, Page, Browser, BrowserContext
from playwright_stealth import Stealth

from .base import BaseProvider, LodgingSearchParams, LodgingResult


class AirbnbProvider(BaseProvider):
    name = "airbnb"
    base_url = "https://www.airbnb.fr"
    
    def __init__(self, proxy_manager=None, captcha_solver=None):
        super().__init__(proxy_manager, captcha_solver)
        self.selectors = {
            "card": '[data-testid="card-container"]',
            "title": '[data-testid="listing-card-title"]',
            "price": '[data-testid="price"]',
            "rating": '[data-testid="rating"]',
            "image": 'img[data-testid="card-image"]',
        }
    
    async def scrape(
        self, 
        params: LodgingSearchParams, 
        respect_robots: bool = False
    ) -> List[LodgingResult]:
        results = []
        browser: Optional[Browser] = None
        context: Optional[BrowserContext] = None
        
        try:
            async with async_playwright() as p:
                launch_args = {
                    "headless": True,
                    "args": [
                        "--disable-blink-features=AutomationControlled",
                        "--no-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                        "--window-size=1920,1080",
                    ]
                }
                
                if self.proxy_manager:
                    proxy = self.proxy_manager.get_random_proxy()
                    if proxy:
                        launch_args["proxy"] = {"server": proxy}
                
                browser = await p.chromium.launch(**launch_args)
                
                context_args = {
                    "viewport": {"width": 1920, "height": 1080},
                    "user_agent": self._get_random_user_agent(),
                    "locale": "fr-FR",
                    "timezone_id": "Europe/Paris",
                }
                
                context = await browser.new_context(**context_args)
                
                await context.add_init_script("""
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined
                    });
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => [1, 2, 3, 4, 5]
                    });
                    window.chrome = { runtime: {} };
                """)
                
                page = await context.new_page()
                await Stealth().apply_stealth_async(page)
                
                search_url = self._build_search_url(params)
                self.logger.info(f"Navigation vers: {search_url}")
                
                for attempt in range(3):
                    try:
                        await page.goto(search_url, wait_until="networkidle", timeout=30000)
                        break
                    except Exception as e:
                        self.logger.warning(f"Tentative {attempt + 1} échouée: {e}")
                        if attempt == 2:
                            raise
                        await asyncio.sleep(2 ** attempt)
                
                await self._handle_cookie_banner(page)
                
                if await self._detect_captcha(page):
                    self.logger.warning("CAPTCHA détecté")
                    if self.captcha_solver:
                        await self._solve_captcha(page)
                    else:
                        return results
                
                await page.wait_for_selector(
                    self.selectors["card"], 
                    state="visible", 
                    timeout=15000
                )
                
                page_num = 1
                while len(results) < params.max_results and page_num <= 3:
                    self.logger.info(f"Extraction page {page_num}...")
                    await self._scroll_page(page)
                    
                    cards = await page.query_selector_all(self.selectors["card"])
                    self.logger.info(f"Trouvé {len(cards)} cartes")
                    
                    for card in cards:
                        if len(results) >= params.max_results:
                            break
                        lodging = await self._extract_card(card)
                        if lodging:
                            results.append(lodging)
                    
                    has_next = await self._goto_next_page(page)
                    if not has_next:
                        break
                    
                    page_num += 1
                    await asyncio.sleep(random.uniform(2, 4))
                
        except Exception as e:
            self.logger.error(f"Erreur scraping Airbnb: {e}")
        finally:
            if context:
                await context.close()
            if browser:
                await browser.close()
        
        self.logger.info(f"Total extrait: {len(results)} logements")
        return results
    
    def _build_search_url(self, params: LodgingSearchParams) -> str:
        location = quote_plus(params.destination)
        url = f"{self.base_url}/s/{location}/homes"
        
        params_list = []
        if params.checkin:
            params_list.append(f"checkin={params.checkin.isoformat()}")
        if params.checkout:
            params_list.append(f"checkout={params.checkout.isoformat()}")
        if params.guests:
            params_list.append(f"adults={params.guests}")
        
        if params_list:
            url += "?" + "&".join(params_list)
        
        return url
    
    async def _extract_card(self, card) -> Optional[LodgingResult]:
        try:
            title_el = await card.query_selector(self.selectors["title"])
            if not title_el:
                title_el = await card.query_selector("h3")
            title = await title_el.inner_text() if title_el else "Sans titre"
            title = title.strip()
            
            price_el = await card.query_selector(self.selectors["price"])
            price_text = await price_el.inner_text() if price_el else "0"
            price, currency = self.normalize_price(price_text)
            
            rating = None
            rating_el = await card.query_selector(self.selectors["rating"])
            if rating_el:
                rating_text = await rating_el.inner_text()
                try:
                    rating = float(rating_text.split()[0].replace(",", "."))
                except (ValueError, IndexError):
                    pass
            
            image_url = None
            img_el = await card.query_selector(self.selectors["image"])
            if img_el:
                image_url = await img_el.get_attribute("src")
            
            link_el = await card.query_selector("a")
            detail_url = ""
            if link_el:
                href = await link_el.get_attribute("href")
                if href:
                    detail_url = self.base_url + href if href.startswith("/") else href
            
            return LodgingResult(
                title=title[:200],
                price_per_night=price,
                currency=currency,
                rating=rating,
                url=detail_url,
                image_url=image_url,
                source="airbnb"
            )
            
        except Exception as e:
            self.logger.debug(f"Erreur extraction carte: {e}")
            return None
    
    async def _handle_cookie_banner(self, page: Page):
        try:
            selectors = [
                'button[data-testid="accept-btn"]',
                'button:has-text("Accepter")',
                'button:has-text("Accepter tout")',
                '[aria-label="Accepter"]',
            ]
            
            for selector in selectors:
                try:
                    btn = await page.query_selector(selector)
                    if btn:
                        await btn.click()
                        await asyncio.sleep(0.5)
                        break
                except:
                    continue
        except:
            pass
    
    async def _detect_captcha(self, page: Page) -> bool:
        captcha_indicators = [
            'iframe[src*="recaptcha"]',
            '.g-recaptcha',
            'text=Je ne suis pas un robot',
        ]
        
        for indicator in captcha_indicators:
            try:
                element = await page.query_selector(indicator)
                if element:
                    return True
            except:
                continue
        return False
    
    async def _solve_captcha(self, page: Page):
        site_key = await page.evaluate('''
            document.querySelector('.g-recaptcha')?.getAttribute('data-sitekey')
        ''')
        
        if site_key and self.captcha_solver:
            self.logger.info("Résolution CAPTCHA...")
            token = await self.captcha_solver.solve_recaptcha(
                site_key=site_key,
                page_url=page.url
            )
            
            if token:
                await page.evaluate(f'''
                    document.getElementById("g-recaptcha-response").innerHTML="{token}";
                ''')
                await asyncio.sleep(2)
    
    async def _scroll_page(self, page: Page):
        for _ in range(3):
            await page.evaluate("window.scrollBy(0, window.innerHeight)")
            await asyncio.sleep(random.uniform(0.5, 1))
    
    async def _goto_next_page(self, page: Page) -> bool:
        try:
            next_btn = await page.query_selector('[aria-label="Suivant"]')
            if next_btn:
                await next_btn.click()
                await page.wait_for_load_state("networkidle")
                return True
        except:
            pass
        return False
    
    def _get_random_user_agent(self) -> str:
        try:
            from fake_useragent import UserAgent
            ua = UserAgent()
            return ua.random
        except:
            agents = [
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            ]
            return random.choice(agents)