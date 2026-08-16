"""Inventaire des sources et de leur état.

Alimente l'écran « Sources » de l'UI. Une source non configurée est **affichée
comme telle**, jamais masquée : savoir qu'Expedia n'a pas répondu parce qu'il
manque une clé change complètement la lecture d'un résultat de recherche.
"""

from __future__ import annotations

from .base import BaseProvider, ProviderInfo
from ..schemas.common import ProviderStatus
from ..services import secrets
from ..services.routing import available_providers as routing_providers

#: Connecteurs de logement *prévus*. Aucun n'a d'implémentation en phase 1 —
#: `implemented` le dit explicitement plutôt que de laisser croire à un bug.
PLANNED_LODGING: list[tuple[ProviderInfo, bool]] = [
    (
        ProviderInfo(
            name="expedia_rapid",
            label="Expedia Rapid (Expedia, Hotels.com, Abritel/Vrbo)",
            kind="api",
            requires_keys=["expedia_rapid_key", "expedia_rapid_secret"],
            docs_url="https://developers.expediagroup.com/docs/products/rapid",
            legal_note=(
                "Compte partenaire Expedia Group requis (contrat signé). "
                "L'inventaire location saisonnière Abritel/Vrbo n'est pas garanti "
                "par Rapid, dont le cœur reste l'hôtellerie."
            ),
        ),
        False,
    ),
    (
        ProviderInfo(
            name="booking_demand",
            label="Booking.com Demand API v3",
            kind="api",
            requires_keys=["booking_demand"],
            docs_url="https://developers.booking.com/",
            legal_note="Validation partenaire Booking obligatoire ; accès non ouvert aux particuliers.",
        ),
        False,
    ),
    (
        ProviderInfo(
            name="airbnb",
            label="Airbnb",
            kind="deeplink",
            docs_url=None,
            legal_note=(
                "Aucune API publique. CGU interdisant l'accès automatisé : "
                "deep-link et import manuel uniquement."
            ),
        ),
        True,
    ),
    (
        ProviderInfo(
            name="gites_de_france",
            label="Gîtes de France",
            kind="deeplink",
            legal_note="Aucune API publique. Deep-link et import manuel uniquement.",
        ),
        True,
    ),
    (
        ProviderInfo(
            name="manual",
            label="Import manuel par URL",
            kind="manual",
            legal_note=(
                "Lecture des métadonnées publiques (Open Graph / JSON-LD) d'une page "
                "ouverte à la demande de l'utilisateur, une page à la fois."
            ),
        ),
        False,
    ),
]


def lodging_providers() -> list[BaseProvider]:
    """Connecteurs actifs. Vide en phase 1 — voir PLANNED_LODGING."""
    return []


def provider_statuses() -> list[ProviderStatus]:
    out: list[ProviderStatus] = []

    for info, implemented in PLANNED_LODGING:
        configured = all(secrets.has_secret(k) for k in info.requires_keys) if info.requires_keys else True
        if not implemented:
            reason = "Connecteur non implémenté (phase 3/4)"
        elif not configured:
            reason = f"Clés manquantes : {', '.join(info.requires_keys)}"
        else:
            reason = None
        out.append(
            ProviderStatus(
                name=info.name,
                kind="lodging",
                enabled=implemented,
                configured=configured and implemented,
                label=info.label,
                reason=reason,
                docs_url=info.docs_url,
            )
        )

    for provider in routing_providers():
        configured = provider.is_configured()
        out.append(
            ProviderStatus(
                name=provider.name,
                kind="routing",
                enabled=True,
                configured=configured,
                label={
                    "openrouteservice": "OpenRouteService (trajets + isochrones)",
                    "osrm": "OSRM (trajets, sans isochrone ni évitement de péage)",
                    "google": "Google Routes API (payant)",
                }.get(provider.name, provider.name),
                reason=None if configured else "Clé d'API absente",
                docs_url={
                    "openrouteservice": "https://openrouteservice.org/dev/#/signup",
                    "osrm": "https://github.com/Project-OSRM/osrm-backend",
                    "google": "https://developers.google.com/maps/documentation/routes",
                }.get(provider.name),
            )
        )

    out.append(
        ProviderStatus(
            name="ign_rge_alti",
            kind="elevation",
            enabled=True,
            configured=True,
            label="IGN Géoplateforme — RGE ALTI (France, précision métrique)",
            docs_url="https://data.geopf.fr/altimetrie/resources",
        )
    )
    out.append(
        ProviderStatus(
            name="opentopodata",
            kind="elevation",
            enabled=True,
            configured=True,
            label="OpenTopoData — EU-DEM 25 m / SRTM 30 m (Europe)",
            reason="Instance publique : 1 req/s, 1 000 req/jour",
            docs_url="https://www.opentopodata.org/",
        )
    )
    out.append(
        ProviderStatus(
            name="ban",
            kind="geocoding",
            enabled=True,
            configured=True,
            label="Base Adresse Nationale (France)",
            docs_url="https://adresse.data.gouv.fr/api-doc/adresse",
        )
    )
    out.append(
        ProviderStatus(
            name="nominatim",
            kind="geocoding",
            enabled=True,
            configured=True,
            label="Nominatim / OpenStreetMap (hors France)",
            reason="Politique d'usage : 1 req/s",
            docs_url="https://operations.osmfoundation.org/policies/nominatim/",
        )
    )
    return out
