"""Coffre de secrets *en mémoire*.

Le sidecar ne lit ni n'écrit jamais les clés d'API sur disque. Electron les
déchiffre (safeStorage → DPAPI Windows) et les pousse ici après le handshake,
via `POST /api/settings/secrets`. Si le sidecar est tué, les clés disparaissent
avec lui — c'est voulu.
"""

from __future__ import annotations

_VAULT: dict[str, str] = {}

KNOWN_KEYS = {
    "openrouteservice": "Clé OpenRouteService (routage, isochrones)",
    "google_maps": "Clé Google Distance Matrix (alternative au routage)",
    "expedia_rapid_key": "Expedia Rapid — API key",
    "expedia_rapid_secret": "Expedia Rapid — shared secret",
    "booking_demand": "Booking.com Demand API — jeton",
    "meteofrance": "Météo-France — clé du portail API",
}


def set_secrets(values: dict[str, str]) -> list[str]:
    """Remplace le contenu du coffre. Renvoie les noms de clés inconnues (ignorées)."""
    unknown = [k for k in values if k not in KNOWN_KEYS]
    _VAULT.clear()
    _VAULT.update({k: v for k, v in values.items() if k in KNOWN_KEYS and v})
    return unknown


def get_secret(name: str) -> str | None:
    return _VAULT.get(name)


def has_secret(name: str) -> bool:
    return bool(_VAULT.get(name))


def configured_keys() -> list[str]:
    """Noms des clés présentes — jamais les valeurs."""
    return sorted(_VAULT)
