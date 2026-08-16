"""Interface commune des connecteurs de logement.

**Aucune implémentation de niveau 1 n'est livrée en phase 1**, et ce n'est pas un
oubli : Booking Demand API et Expedia Rapid exigent un compte partenaire validé.
Écrire un connecteur contre une documentation qu'on n'a pas pu exécuter
produirait du code plausible et faux. L'interface, elle, est posée maintenant
pour que la phase 3 n'ait qu'à la remplir — et pour que le reste de
l'application (normalisation, cache, comparateur) soit écrit contre elle.

Voir PROVIDERS.md pour l'état légal et la procédure d'accès de chaque source.
"""

from __future__ import annotations

import datetime as dt
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal

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


class BaseProvider(ABC):
    """Contrat que doit remplir tout connecteur.

    Règles imposées à toute implémentation :

    * `search()` ne lève jamais pour cause de clé manquante — elle renvoie une
      liste vide et `is_configured()` vaut `False`. Une source non configurée ne
      doit pas casser la recherche des autres.
    * Tous les appels réseau passent par `services.http` (rate-limit, retry,
      cache TTL) — jamais `httpx` directement.
    * `normalize()` est une fonction pure, testable sur une charge utile figée
      sans réseau.
    """

    info: ProviderInfo

    @abstractmethod
    def is_configured(self) -> bool:
        """Vrai si les clés nécessaires sont présentes dans le coffre en mémoire."""

    @abstractmethod
    async def search(
        self, criteria: SearchCriteria
    ) -> tuple[list[NormalizedAccommodation], list[NormalizedOffer]]:
        """Recherche. Renvoie ([], []) si non configuré."""

    @abstractmethod
    async def get_details(self, source_id: str) -> NormalizedAccommodation | None:
        """Fiche complète d'un logement."""

    @staticmethod
    @abstractmethod
    def normalize(payload: dict[str, Any]) -> NormalizedAccommodation:
        """Charge utile brute -> objet pivot. Pure, sans I/O."""

    def unavailable_reason(self) -> str | None:
        if self.is_configured():
            return None
        missing = ", ".join(self.info.requires_keys) or "configuration"
        return f"Source non configurée ({missing})"
