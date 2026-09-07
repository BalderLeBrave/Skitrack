"""Client HTTP partagé : rate-limiting, retry exponentiel, cache TTL persistant.

Tous les appels sortants passent par ici. C'est le seul endroit où l'on décide
d'attendre, de réessayer ou de servir depuis le cache — ce qui rend le respect
des quotas vérifiable en un seul point (voir PROVIDERS.md pour les limites).
"""

from __future__ import annotations

import asyncio
import datetime as dt
import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from ..config import get_settings
from ..db.base import utcnow
from ..db.session import session_scope
from ..models import HttpCacheEntry

log = logging.getLogger(__name__)


class RateLimitError(RuntimeError):
    """Quota du fournisseur épuisé. Non réessayable dans la seconde."""


class ProviderUnavailable(RuntimeError):
    """Le fournisseur a échoué après épuisement des tentatives."""


@dataclass
class RateLimiter:
    """Limiteur à jetons simple, par hôte.

    `min_interval_s` couvre les limites exprimées « N requêtes / seconde »
    (IGN : 5 req/s ; OpenTopoData public : 1 req/s). Les quotas journaliers, eux,
    sont documentés mais non appliqués ici : on les remonte via l'erreur 429 du
    fournisseur plutôt que de maintenir un compteur qui dériverait.
    """

    min_interval_s: float
    _last: float = field(default=0.0, repr=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            wait = self._last + self.min_interval_s - now
            if wait > 0:
                await asyncio.sleep(wait)
            self._last = time.monotonic()


def cache_key(method: str, url: str, body: Any = None) -> str:
    payload = json.dumps(body, sort_keys=True, ensure_ascii=False) if body is not None else ""
    raw = f"{method.upper()}\n{url}\n{payload}".encode()
    return hashlib.sha256(raw).hexdigest()


def cache_get(key: str) -> bytes | None:
    with session_scope() as session:
        entry = session.get(HttpCacheEntry, key)
        if entry is None:
            return None
        if entry.expires_at <= utcnow():
            session.delete(entry)
            return None
        return entry.body


def cache_put(key: str, namespace: str, url: str, status: int, body: bytes, ttl_s: int) -> None:
    with session_scope() as session:
        session.merge(
            HttpCacheEntry(
                key=key,
                namespace=namespace,
                url=url,
                status_code=status,
                body=body,
                fetched_at=utcnow(),
                expires_at=utcnow() + dt.timedelta(seconds=ttl_s),
            )
        )


def purge_cache(namespace: str | None = None) -> int:
    from sqlalchemy import delete

    with session_scope() as session:
        stmt = delete(HttpCacheEntry)
        if namespace:
            stmt = stmt.where(HttpCacheEntry.namespace == namespace)
        return session.execute(stmt).rowcount or 0


class HttpClient:
    """Wrapper httpx avec cache + retry.

    `use_cache=False` sur les appels qui ne doivent jamais être servis depuis le
    cache (téléchargement de dump, health-check d'une clé d'API).
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._client = httpx.AsyncClient(
            timeout=settings.http_timeout_s,
            headers={"User-Agent": settings.user_agent},
            follow_redirects=True,
        )
        self._limiters: dict[str, RateLimiter] = {}

    def limiter_for(self, host: str, min_interval_s: float) -> RateLimiter:
        if host not in self._limiters:
            self._limiters[host] = RateLimiter(min_interval_s=min_interval_s)
        return self._limiters[host]

    async def aclose(self) -> None:
        await self._client.aclose()

    async def request_json(
        self,
        method: str,
        url: str,
        *,
        namespace: str,
        ttl_s: int,
        params: dict[str, Any] | None = None,
        json_body: Any = None,
        headers: dict[str, str] | None = None,
        min_interval_s: float = 0.2,
        max_retries: int = 3,
        use_cache: bool = True,
    ) -> Any:
        full_url = str(httpx.URL(url, params=params or {}))
        key = cache_key(method, full_url, json_body)

        if use_cache:
            cached = cache_get(key)
            if cached is not None:
                return json.loads(cached)

        host = httpx.URL(url).host or "unknown"
        limiter = self.limiter_for(host, min_interval_s)

        last_exc: Exception | None = None
        for attempt in range(max_retries):
            await limiter.acquire()
            try:
                resp = await self._client.request(
                    method, url, params=params, json=json_body, headers=headers
                )
            except httpx.HTTPError as exc:  # réseau coupé, DNS, timeout
                last_exc = exc
                await asyncio.sleep(min(2**attempt, 8))
                continue

            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", 2**attempt))
                # Un 429 sur la dernière tentative est un vrai dépassement de quota,
                # pas un pic : on le remonte tel quel pour que l'UI l'affiche.
                if attempt == max_retries - 1:
                    raise RateLimitError(f"{host} : quota dépassé (HTTP 429)")
                log.warning("429 de %s, nouvelle tentative dans %.0f s", host, retry_after)
                await asyncio.sleep(min(retry_after, 30))
                continue

            if 500 <= resp.status_code < 600:
                last_exc = ProviderUnavailable(f"{host} HTTP {resp.status_code}")
                await asyncio.sleep(min(2**attempt, 8))
                continue

            if resp.status_code >= 400:
                raise ProviderUnavailable(
                    f"{host} HTTP {resp.status_code} : {resp.text[:300]}"
                )

            body = resp.content
            if use_cache:
                cache_put(key, namespace, full_url, resp.status_code, body, ttl_s)
            return json.loads(body) if body else None

        raise ProviderUnavailable(f"{host} injoignable après {max_retries} tentatives") from last_exc


_client: HttpClient | None = None


def get_http() -> HttpClient:
    global _client
    if _client is None:
        _client = HttpClient()
    return _client


async def close_http() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
