"""Configuration du sidecar.

Deux niveaux :

* `Settings` — paramètres de *processus* (chemins, token, port). Fournis par Electron
  au lancement via variables d'environnement / arguments CLI. Jamais persistés.
* `UserSettings` — préférences utilisateur (fournisseur de routage, TTL de cache,
  langue, devise…). Persistées dans la table `app_setting` de SQLite.

Les **clés d'API ne transitent jamais par ce fichier** : elles sont chiffrées côté
Electron (`safeStorage` → DPAPI Windows) et poussées au sidecar en mémoire via
`POST /api/settings/secrets` après le handshake. Voir `docs/ARCHITECTURE.md`.
"""

from __future__ import annotations

import os
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def default_data_dir() -> Path:
    """Répertoire de données par défaut.

    Sous Windows : %APPDATA%\\SKITRACK. Ailleurs (dev/CI) : ~/.skitrack.
    Electron passe normalement `SKITRACK_DATA_DIR` explicitement (app.getPath('userData')).
    """
    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / "SKITRACK"
    return Path.home() / ".skitrack"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SKITRACK_", extra="ignore")

    # --- Processus -----------------------------------------------------------
    host: str = "127.0.0.1"
    port: int = 0  # 0 => port éphémère choisi par l'OS, renvoyé dans le handshake
    token: str = ""  # token de session ; vide == mode dev sans auth (CLI, tests)
    data_dir: Path = Field(default_factory=default_data_dir)
    log_level: str = "INFO"

    # --- Réseau --------------------------------------------------------------
    http_timeout_s: float = 30.0
    user_agent: str = "SKITRACK/0.1 (application personnelle ; contact via l'utilisateur)"

    # --- TTL de cache (secondes) --------------------------------------------
    # Le référentiel (domaines, pistes, altitudes) est quasi immuable : TTL très long.
    ttl_elevation_s: int = 365 * 24 * 3600
    ttl_route_s: int = 30 * 24 * 3600
    ttl_geocode_s: int = 180 * 24 * 3600
    ttl_weather_s: int = 3 * 3600
    ttl_offer_s: int = 6 * 3600  # offres logement (phase 3+)

    @property
    def db_path(self) -> Path:
        return self.data_dir / "skitrack.sqlite3"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def downloads_dir(self) -> Path:
        """Dumps OpenSkiMap téléchargés (volumineux, purgeables)."""
        return self.cache_dir / "downloads"

    @property
    def photos_dir(self) -> Path:
        return self.cache_dir / "photos"

    def ensure_dirs(self) -> None:
        for p in (self.data_dir, self.cache_dir, self.downloads_dir, self.photos_dir):
            p.mkdir(parents=True, exist_ok=True)


_INSTANCE: Settings | None = None


def get_settings() -> Settings:
    """Instance courante (créée depuis l'environnement au premier appel)."""
    global _INSTANCE
    if _INSTANCE is None:
        _INSTANCE = Settings()
    return _INSTANCE


def set_settings(settings: Settings) -> None:
    """Injecte une instance — utilisé par `__main__` après parsing des arguments CLI."""
    global _INSTANCE
    _INSTANCE = settings

PACKAGE_DIR = Path(__file__).resolve().parent
REFERENCE_DIR = PACKAGE_DIR / "data" / "reference"
CURATED_DIR = PACKAGE_DIR / "data" / "curated"
