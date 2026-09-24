"""Session Airbnb : clé API, hash GraphQL, cookies HTTP.

Sans ça, chaque relevé relit la page d’accueil (clé, hash) et arrive
sans cookie : premier déclencheur des 429. Un process par relevé, le
cache mémoire ne survit pas à Relancer. Le fichier tient la session.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Callable

TTL_S = 180.0
# La clé API est celle du site public, pas une clé de session : elle ne change
# qu'au déploiement d'Airbnb, comme le hash. La relire toutes les 30 min
# coûtait une page d'accueil — le premier déclencheur des 429 connu. Une clé
# périmée fait échouer un relevé (erreur, ou 403), et `invalidate()` la jette
# alors (stays.run_search).
DISK_TTL_S = 12 * 60 * 60.0
# Le hash de l'opération StaysSearch change au déploiement d'Airbnb, pas
# toutes les demi-heures. Le relire coûtait deux pages d'accueil et un paquet
# JavaScript à chaque relevé ; un hash périmé fait échouer la recherche, et
# `invalidate()` (appelé sur exception) le jette alors.
HASH_DISK_TTL_S = 12 * 60 * 60.0
COOKIE_TTL_S = 12 * 60 * 60.0
# Le dossier temporaire de l'utilisateur, le même que Node (`os.tmpdir()`).
_SESSION_DEFAUT = Path(tempfile.gettempdir()) / "skitrack-airbnb-session.json"
SESSION_PATH = Path(os.environ.get("SKITRACK_AIRBNB_SESSION") or _SESSION_DEFAUT)
# L'emplacement d'avant (« /tmp », racine du lecteur sous Windows) : relu tant
# que le nouveau n'existe pas, pour ne pas repartir à froid — pages d'accueil
# et paquets JS relus. Seulement pour l'emplacement par défaut.
ANCIEN_SESSION_PATH = Path("/tmp/skitrack-airbnb-session.json")

_key = ""
_key_at = 0.0
_hash = ""
_hash_at = 0.0
_http: Any = None
_installed = False
# L'échéance du relevé en cours (`time.time()`), posée par `stays.run_search` :
# le limiteur n'attend jamais au-delà.
echeance: float | None = None


def _read_disk() -> dict:
    chemin = SESSION_PATH
    if chemin == _SESSION_DEFAUT and chemin != ANCIEN_SESSION_PATH and not chemin.exists():
        chemin = ANCIEN_SESSION_PATH
    try:
        raw = json.loads(chemin.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def _write_disk(data: dict) -> None:
    # Remplacement atomique : un relevé qui démarre pendant qu'un autre écrit
    # lisait un fichier vide, et repartait à froid, sans cookies.
    tmp = SESSION_PATH.with_name(f"{SESSION_PATH.name}.{os.getpid()}.tmp")
    try:
        SESSION_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps(data), encoding="utf-8")
        for essai in range(5):
            try:
                tmp.replace(SESSION_PATH)
                return
            except PermissionError:
                time.sleep(0.01 * (essai + 1))
    except OSError:
        pass
    finally:
        try:
            tmp.unlink()
        except OSError:
            pass


def cached(slot: str, fetch: Callable[[], str]) -> str:
    global _key, _key_at, _hash, _hash_at
    now = time.monotonic()
    wall = time.time()
    if slot == "key":
        if _key and now - _key_at < TTL_S:
            return _key
        disk = _read_disk()
        stored = disk.get("key")
        stored_at = disk.get("key_at")
        if isinstance(stored, str) and stored and isinstance(stored_at, (int, float)) and wall - stored_at < DISK_TTL_S:
            _key, _key_at = stored, now
            return _key
        _key = fetch()
        _key_at = now
        if _key:
            disk = _read_disk()
            disk["key"] = _key
            disk["key_at"] = wall
            _write_disk(disk)
        return _key
    if _hash and now - _hash_at < TTL_S:
        return _hash
    disk = _read_disk()
    stored = disk.get("hash")
    stored_at = disk.get("hash_at")
    if isinstance(stored, str) and stored and isinstance(stored_at, (int, float)) and wall - stored_at < HASH_DISK_TTL_S:
        _hash, _hash_at = stored, now
        return _hash
    _hash = fetch()
    _hash_at = now
    if _hash:
        disk = _read_disk()
        disk["hash"] = _hash
        disk["hash_at"] = wall
        _write_disk(disk)
    return _hash


def cookies_dump() -> list[dict[str, str]]:
    """Cookies encore valides, pour le sidecar et pour Node."""
    disk = _read_disk()
    at = disk.get("cookies_at")
    if isinstance(at, (int, float)) and time.time() - at > COOKIE_TTL_S:
        return []
    raw = disk.get("cookies")
    if not isinstance(raw, list):
        return []
    out: list[dict[str, str]] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        name = row.get("name")
        value = row.get("value")
        if not isinstance(name, str) or not name or not isinstance(value, str):
            continue
        out.append(
            {
                "name": name,
                "value": value,
                "domain": str(row.get("domain") or ""),
                "path": str(row.get("path") or "/"),
            }
        )
    return out


def cookies_store(rows: list[dict[str, str]]) -> None:
    disk = _read_disk()
    disk["cookies"] = rows
    disk["cookies_at"] = time.time()
    _write_disk(disk)


def _jar_rows(session: Any) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    jar = getattr(session, "cookies", None)
    if jar is None:
        return rows
    inner = getattr(jar, "jar", jar)
    try:
        cookies = list(inner)
    except TypeError:
        cookies = []
    for c in cookies:
        name = getattr(c, "name", None)
        value = getattr(c, "value", None)
        if not isinstance(name, str) or not name:
            continue
        rows.append(
            {
                "name": name,
                "value": "" if value is None else str(value),
                "domain": str(getattr(c, "domain", "") or ""),
                "path": str(getattr(c, "path", "") or "/"),
            }
        )
    if rows:
        return rows
    getter = getattr(jar, "get_dict", None)
    if callable(getter):
        for name, value in getter().items():
            rows.append({"name": str(name), "value": str(value), "domain": ".airbnb.com", "path": "/"})
    return rows


def persist_http() -> None:
    if _http is None:
        return
    rows = _jar_rows(_http)
    if rows:
        cookies_store(rows)


def http_session(proxy_url: str = "") -> Any:
    """Une Session curl_cffi, cookies rechargés. Relancer ne recommence pas à zéro."""
    global _http
    if _http is not None:
        return _http
    from curl_cffi import requests as cf

    try:
        _http = cf.Session(impersonate="chrome124")
    except TypeError:
        _http = cf.Session()
    if proxy_url:
        _http.proxies = {"http": proxy_url, "https": proxy_url}
    for row in cookies_dump():
        try:
            _http.cookies.set(row["name"], row["value"], domain=row["domain"] or None, path=row["path"] or "/")
        except TypeError:
            _http.cookies.set(row["name"], row["value"])
        except Exception:
            continue
    return _http


def _sans_connection(headers: Any) -> Any:
    if not isinstance(headers, dict):
        return headers
    return {k: v for k, v in headers.items() if str(k).lower() != "connection"}


def rythme_de(url: Any) -> str:
    """Le compteur de taux d'une requête : Airbnb lui-même, ou son CDN statique.

    Toutes les requêtes comptaient pour Airbnb, y compris les paquets
    JavaScript de muscache.com lus pour trouver le hash : 16 s de démarrage à
    froid au pas de 2 s, et le plafond de 18 appels par minute atteint avant la
    dixième page de résultats.
    """
    from urllib.parse import urlparse

    host = (urlparse(str(url)).hostname or "").lower()
    return "airbnb" if host == "airbnb.com" or ".airbnb." in f".{host}" else "airbnb-cdn"


def _wrap(method: str):
    def fn(*args: Any, **kwargs: Any) -> Any:
        from taux import SLEEP_CAP_S, pace
        from throttle import MARGE_REQUETE_S, RythmeLocal

        cap = SLEEP_CAP_S
        if echeance is not None:
            cap = max(0.0, min(SLEEP_CAP_S, echeance - time.time() - MARGE_REQUETE_S))
        hote = rythme_de(args[0] if args else kwargs.get("url"))
        wait = pace(hote, cap)
        if hote == "airbnb":
            # Un refus arrivé pendant l'attente du créneau (autre relevé, ou
            # Node) : la requête ne part pas pendant la pause qu'il a ouverte,
            # et l'arrêt se dit « coupe-circuit », pas « limiteur local ».
            from throttle import CoupeCircuit, airbnb_circuit

            if airbnb_circuit.open():
                raise CoupeCircuit(429, airbnb_circuit.remaining_s())
        if wait > 0:
            raise RythmeLocal(429, wait)
        if echeance is not None and kwargs.get("timeout") is not None:
            # Le délai était calculé avant l'attente du créneau : on le
            # recale, pour que la requête finisse avant l'échéance du relevé.
            kwargs["timeout"] = max(1.0, min(float(kwargs["timeout"]), echeance - time.time() - 0.5))
        proxies = kwargs.get("proxies") if isinstance(kwargs.get("proxies"), dict) else {}
        proxy = ""
        if isinstance(proxies, dict):
            proxy = str(proxies.get("https") or proxies.get("http") or "")
        session = http_session(proxy)
        kwargs["headers"] = _sans_connection(kwargs.get("headers"))
        kwargs.setdefault("impersonate", "chrome124")
        resp = getattr(session, method)(*args, **kwargs)
        persist_http()
        return resp

    return fn


def install_shared_http() -> None:
    """Toutes les requêtes pyairbnb / PDP passent par la même Session."""
    global _installed
    if _installed:
        return
    from curl_cffi import requests as cf

    cf.get = _wrap("get")
    cf.post = _wrap("post")
    _installed = True


def invalidate(*, cookies: bool = False) -> None:
    """Jette clé et hash. Les cookies restent, sauf demande explicite."""
    global _key, _key_at, _hash, _hash_at, _http
    _key = _hash = ""
    _key_at = _hash_at = 0.0
    disk = _read_disk()
    disk.pop("key", None)
    disk.pop("key_at", None)
    disk.pop("hash", None)
    disk.pop("hash_at", None)
    if cookies:
        disk.pop("cookies", None)
        disk.pop("cookies_at", None)
        _http = None
    if disk:
        _write_disk(disk)
    else:
        try:
            SESSION_PATH.unlink()
        except FileNotFoundError:
            pass


def next_search_cursor(pagination: dict | None, current: str) -> str | None:
    """Airbnb 2026 : pageCursors[], plus nextPageCursor."""
    if not isinstance(pagination, dict):
        return None
    nxt = pagination.get("nextPageCursor")
    if isinstance(nxt, str) and nxt.strip():
        return nxt.strip()
    pages = pagination.get("pageCursors")
    if not isinstance(pages, list) or not pages:
        return None
    cursors = [c for c in pages if isinstance(c, str) and c]
    if not cursors:
        return None
    if not current:
        return cursors[1] if len(cursors) > 1 else None
    try:
        index = cursors.index(current)
    except ValueError:
        return cursors[1] if len(cursors) > 1 else None
    if index + 1 < len(cursors):
        return cursors[index + 1]
    return None
