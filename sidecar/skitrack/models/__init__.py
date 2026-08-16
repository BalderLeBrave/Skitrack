"""Modèles SQLAlchemy. Importer ce module suffit à peupler `Base.metadata`."""

from .accommodation import Accommodation, AccessMetrics, AccommodationPhoto  # noqa: F401
from .domain import DomainLift, DomainSlope, SkiDomain, SnowReport  # noqa: F401
from .kv import AppSetting, HttpCacheEntry, ProviderState  # noqa: F401
from .offer import Offer, PricePoint  # noqa: F401
from .origin import DomainAccess, Origin  # noqa: F401
from .search import SavedSearch, SearchRun, ScoringProfile  # noqa: F401

__all__ = [
    "AccessMetrics",
    "Accommodation",
    "AccommodationPhoto",
    "AppSetting",
    "DomainAccess",
    "DomainLift",
    "DomainSlope",
    "HttpCacheEntry",
    "Offer",
    "Origin",
    "PricePoint",
    "ProviderState",
    "SavedSearch",
    "ScoringProfile",
    "SearchRun",
    "SkiDomain",
    "SnowReport",
]
