"""
Provider CozyCozy - HTTP direct
"""
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

from .base import BaseProvider, LodgingResult, LodgingSearchParams


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
    ) -> list[LodgingResult]:
        results = []

        try:
            location = quote_plus(params.destination)
            url = f"{self.base_url}/fr/search?location={location}"

            if params.checkin and params.checkout:
                url += f"&checkin={params.checkin.isoformat()}"
                url += f"&checkout={params.checkout.isoformat()}"

            if params.guests:
                url += f"&adults={params.guests}"

            self.logger.info(f"CozyCozy: {url}")

            # `client.proxies = ...` après construction ne fait rien : httpx a
            # retiré l'attribut en 0.28, l'affectation posait un attribut mort
            # et toutes les requêtes partaient en direct. Le proxy se passe au
            # constructeur, sous le nom `proxy` (singulier).
            proxy = (
                self.proxy_manager.get_random_proxy() if self.proxy_manager else None
            )

            async with httpx.AsyncClient(
                headers=self.headers,
                follow_redirects=True,
                timeout=30.0,
                proxy=proxy,
            ) as client:
                response = await client.get(url)
                response.raise_for_status()

                # `lxml` n'est pas dans `requirements.txt` : il n'y figure pas
                # parce qu'aucun `import lxml` n'apparaît, et le nom de parseur
                # passé ici n'en est pas un. Sur une installation propre,
                # BeautifulSoup lèverait `FeatureNotFound`. `html.parser` est
                # dans la bibliothèque standard : aucune dépendance de plus.
                soup = BeautifulSoup(response.text, 'html.parser')
                results = self._parse_results(soup, params.max_results)

        except Exception:
            # Invariant du projet : une source en panne produit une erreur
            # motivée, jamais un résultat vide. Sans le moindre relevé, on
            # relève — c'est ce qui rend atteignable le 502 de la route.
            self.logger.exception("Erreur CozyCozy")
            if not results:
                raise

        return results

    def _parse_results(self, soup: BeautifulSoup, max_results: int) -> list[LodgingResult]:
        results = []
        cards = soup.find_all("div", class_=lambda x: x and "card" in x.lower())

        if not cards:
            cards = soup.find_all("a", href=lambda x: x and "/fr/" in x)

        for card in cards[:max_results]:
            try:
                lodging = self._extract_card(card)
                if lodging:
                    results.append(lodging)
            except Exception as e:  # noqa: BLE001 — une carte illisible n'emporte pas le relevé
                self.logger.debug(f"Extraction carte échouée: {e}")

        return results

    def _extract_card(self, card) -> LodgingResult | None:
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

            if title and price is not None:
                return LodgingResult(
                    title=title[:200],
                    price_per_night=price,
                    currency=currency,
                    url=detail_url,
                    image_url=image_url,
                    source="cozycozy"
                )

        except Exception as e:  # noqa: BLE001 — une carte illisible n'emporte pas le relevé
            self.logger.debug(f"Erreur extraction: {e}")

        return None
