"""
Provider VRBO
"""
from urllib.parse import quote_plus

from playwright.async_api import async_playwright
from playwright_stealth import Stealth

from .base import BaseProvider, LodgingResult, LodgingSearchParams


class VRBOProvider(BaseProvider):
    name = "vrbo"
    base_url = "https://www.vrbo.com"

    async def scrape(
        self,
        params: LodgingSearchParams,
        respect_robots: bool = False
    ) -> list[LodgingResult]:
        results = []

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=["--disable-blink-features=AutomationControlled"]
                )
                # Fermeture dans le `async with`, et non après : au-delà,
                # le pilote est arrêté et `close()` porte sur une
                # connexion morte.
                try:
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
                finally:
                    await browser.close()

        except Exception:
            # Invariant du projet : une source en panne produit une erreur
            # motivée, jamais un résultat vide. Sans le moindre relevé, on
            # relève — c'est ce qui rend atteignable le 502 de la route.
            self.logger.exception("Erreur VRBO")
            if not results:
                raise

        return results

    async def _extract_listing(self, listing) -> LodgingResult | None:
        try:
            title_el = await listing.query_selector('[data-testid="listing-title"]')
            if not title_el:
                # Annonce sans titre : écartée, plutôt que nommée
                # « VRBO Listing » — un nom que personne n'a relevé.
                return None
            title = await title_el.inner_text()

            price_el = await listing.query_selector('[data-testid="price"]')
            price, currency = (
                self.normalize_price(await price_el.inner_text())
                if price_el
                else (None, "EUR")
            )

            rating = None
            rating_el = await listing.query_selector('[data-testid="rating"]')
            if rating_el:
                rating_text = await rating_el.inner_text()
                try:
                    rating = float(rating_text.split()[0])
                except (ValueError, IndexError):
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

        except Exception as e:  # noqa: BLE001 — une annonce illisible n'emporte pas le relevé
            self.logger.debug(f"Extraction VRBO échouée: {e}")
            return None
