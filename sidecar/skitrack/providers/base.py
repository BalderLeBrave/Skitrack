"""
Base provider avec méthode de scraping générique
"""
import datetime as dt
import logging
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

logger = logging.getLogger(__name__)


@dataclass
class LodgingSearchParams:
    destination: str
    checkin: date | None = None
    checkout: date | None = None
    guests: int = 2
    latitude: float | None = None
    longitude: float | None = None
    radius_km: float | None = None
    max_results: int = 50


@dataclass
class LodgingResult:
    title: str
    price_per_night: float | None
    currency: str
    rating: float | None = None
    reviews_count: int | None = None
    url: str = ""
    image_url: str | None = None
    source: str = ""
    room_type: str | None = None
    location: str | None = None
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "price_per_night": self.price_per_night,
            "currency": self.currency,
            "rating": self.rating,
            "reviews_count": self.reviews_count,
            "url": self.url,
            "image_url": self.image_url,
            "source": self.source,
            "room_type": self.room_type,
            "location": self.location,
        }


class BaseProvider(ABC):
    """Classe de base pour tous les providers de scraping"""
    
    name: str = "base"
    base_url: str = ""
    
    def __init__(self, proxy_manager=None, captcha_solver=None):
        self.proxy_manager = proxy_manager
        self.captcha_solver = captcha_solver
        self.logger = logging.getLogger(self.__class__.__name__)
    
    @abstractmethod
    async def scrape(
        self, 
        params: LodgingSearchParams, 
        respect_robots: bool = False
    ) -> list[LodgingResult]:
        pass
    
    async def search(
        self, 
        params: LodgingSearchParams, 
        respect_robots: bool = False
    ) -> list[LodgingResult]:
        return await self.scrape(params, respect_robots)
    
    def normalize_price(self, price_text: str) -> tuple[float | None, str]:
        """Rend `(None, devise)` quand aucun nombre n'est lisible.

        Elle rendait `0.0` : un prix absent devenait « 0 € », c'est-à-dire une
        valeur inventée présentée comme une mesure. L'invariant du projet est
        l'inverse — une valeur absente reste absente, et l'interface sait
        afficher « non renseigné ».
        """
        currency = "EUR"
        if '$' in price_text or 'USD' in price_text:
            currency = "USD"
        elif '£' in price_text or 'GBP' in price_text:
            currency = "GBP"
        elif 'CHF' in price_text:
            currency = "CHF"
        
        numbers = re.findall(r'[\d\s.,]+', price_text)
        if numbers:
            num_str = numbers[0].replace(' ', '').replace(',', '.')
            try:
                if '.' in num_str:
                    parts = num_str.split('.')
                    if len(parts[-1]) == 2:
                        price = float(num_str)
                    else:
                        price = float(num_str.replace('.', ''))
                else:
                    price = float(num_str)
                return price, currency
            except ValueError:
                pass
        return None, currency


# ---------------------------------------------------------------------------
# Modèles pivots du contrat d'origine.
#
# `providers/__init__.py` exporte `ProviderInfo` et `SearchCriteria`, et
# `registry.provider_statuses()` construit l'écran « Sources » à partir de
# `ProviderInfo`. La réécriture les avait supprimés : le paquet `providers`
# entier ne s'importait plus (`cannot import name 'ProviderInfo'`), donc la
# pile de scraping non plus.
#
# Ils coexistent avec `LodgingSearchParams` / `LodgingResult` ci-dessus, qui
# décrivent le scraping. Les deux contrats ne se recouvrent pas.
# ---------------------------------------------------------------------------

ProviderKind = Literal["api", "deeplink", "manual"]


@dataclass
class ProviderInfo:
    name: str
    label: str
    kind: ProviderKind
    requires_keys: list[str] = field(default_factory=list)
    docs_url: str | None = None
    legal_note: str | None = None


@dataclass
class SearchCriteria:
    """Critères normalisés passés à tous les connecteurs."""

    domain_id: int
    check_in: dt.date
    check_out: dt.date
    guests: int
    bedrooms_min: int | None = None
    price_max_total: float | None = None
    currency: str = "EUR"
    lat: float | None = None
    lon: float | None = None
    radius_km: float = 15.0
    property_types: list[str] | None = None
    amenities: list[str] | None = None

    @property
    def nights(self) -> int:
        return (self.check_out - self.check_in).days


@dataclass
class NormalizedAccommodation:
    """Sortie pivot d'un connecteur — miroir des colonnes `Accommodation`.

    Un logement issu d'une API et un logement collé à la main aboutissent au même
    objet : c'est ce qui permet de les trier et de les comparer ensemble.
    """

    source: str
    source_id: str
    title: str
    deep_link: str | None = None
    lat: float | None = None
    lon: float | None = None
    address: str | None = None
    location_precision: str | None = None
    description_raw: str | None = None
    bedrooms: int | None = None
    beds: int | None = None
    capacity_max: int | None = None
    bathrooms: float | None = None
    surface_m2: float | None = None
    property_type: str | None = None
    amenities: list[str] = field(default_factory=list)
    rating: float | None = None
    rating_scale: float | None = None
    reviews_count: int | None = None
    photos: list[str] = field(default_factory=list)
    raw: dict[str, Any] | None = None


@dataclass
class NormalizedOffer:
    source_id: str
    check_in: dt.date
    check_out: dt.date
    guests: int
    price_total: float | None
    currency: str
    price_base: float | None = None
    fees_breakdown: dict[str, Any] = field(default_factory=dict)
    cancellation_policy: str | None = None
    availability_status: str = "available"
    raw: dict[str, Any] | None = None
