"""Langue FR seulement. Pas de Cache-Control / Sec-Fetch : ça trahit un client scripté.

Les moteurs furtifs posent déjà TLS + User-Agent. Ne pas appeler ceci pour
écraser leur empreinte.
"""

from __future__ import annotations

from config import Settings

ACCEPT = (
    "text/html,application/xhtml+xml,application/xml;q=0.9,"
    "image/avif,image/webp,image/apng,*/*;q=0.8"
)


def browser_headers(settings: Settings | None = None) -> dict[str, str]:
    locale = (settings.locale if settings else "fr-FR") or "fr-FR"
    lang = locale.replace("_", "-")
    primary = lang.split("-")[0]
    return {
        "Accept": ACCEPT,
        "Accept-Language": f"{lang},{primary};q=0.9,en;q=0.5",
    }
