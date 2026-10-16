"""Repli HTTP par botasaurus-requests, quand curl_cffi n'a pas pu joindre l'hôte.

Seulement une panne de transport (exception de curl_cffi) : un refus du site
(403, 429, page de blocage) reste un refus, lu par l'appelant comme avant, et
ne passe jamais par ici. Même limiteur, même coupe-circuit : le repli est une
seconde tentative de la même requête, pas une requête de plus.

botasaurus-requests télécharge au premier import sa bibliothèque native
(`hrequests-cgo`, releases GitHub de daijro/hrequests). Si l'import échoue
(paquet absent, pas de réseau vers GitHub), le repli se coupe pour tout le
processus et le worker continue avec curl_cffi seul.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from typing import Any

_hors_service = False


@dataclass
class Reponse:
    status_code: int
    headers: Any = field(default_factory=dict)
    text: str = ""


def _module() -> Any | None:
    global _hors_service
    if _hors_service:
        return None
    try:
        import botasaurus_requests
    except Exception as e:  # ImportError, ou bibliothèque native introuvable
        _hors_service = True
        print(f"[repli] botasaurus-requests indisponible ({type(e).__name__}) : curl_cffi seul", file=sys.stderr)
        return None
    return botasaurus_requests


def get(url: str, *, headers: dict[str, str], proxy_url: str = "", timeout: float = 25) -> Reponse | None:
    """La même requête GET par botasaurus-requests, ou None (repli coupé, échec)."""
    br = _module()
    if br is None:
        return None
    proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None
    try:
        res = br.get(url, headers=headers, proxies=proxies, timeout=timeout)
    except Exception:
        return None
    try:
        text = res.text or ""
    except Exception:
        text = ""
    return Reponse(int(res.status_code), res.headers or {}, text)
