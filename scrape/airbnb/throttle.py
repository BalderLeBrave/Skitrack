"""429 / 503 Airbnb : Retry-After, reprise courte, coupe-circuit.

Un 429 n'est pas un refus définitif : Airbnb demande d'attendre. On lit
l'en-tête, on attend au plus `MAX_WAIT_S`, on réessaie un nombre borné de
fois. Si ça continue, on s'arrête et on rend ce qui est déjà lu — on ne
vide pas le relevé, on ne martèle pas.

Le coupe-circuit est un fichier : le process Python du sidecar et le
complément de fiches Node le partagent. Relancer pendant la pause ne
renouvelle pas les appels.
"""

from __future__ import annotations

import os
import re
import time
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Callable, TypeVar

RETRY_STATUSES = {429, 503}
DEFAULT_WAIT_S = 2.0
MAX_WAIT_S = 12.0
MAX_TRIES = 3
COOLDOWN_S = 45.0
TRIP_AFTER = 2

CIRCUIT_PATH = Path(
    os.environ.get("SKITRACK_AIRBNB_CIRCUIT") or "/tmp/skitrack-airbnb-429"
)

T = TypeVar("T")


class RateLimited(Exception):
    """HTTP 429 ou 503, avec l'attente demandée."""

    def __init__(self, status: int = 429, retry_after_s: float = DEFAULT_WAIT_S):
        super().__init__(f"HTTP {status}")
        self.status = status
        self.retry_after_s = float(retry_after_s)


def retry_after_s(
    headers: Any,
    attempt: int = 0,
    default: float = DEFAULT_WAIT_S,
    cap: float = MAX_WAIT_S,
) -> float:
    """Secondes à attendre. En-tête d'abord, sinon 2, 4, 8… plafonné."""
    raw = _header(headers, "retry-after")
    wait: float | None = None
    if raw:
        token = raw.strip()
        if token.isdigit():
            wait = float(token)
        else:
            try:
                dt = parsedate_to_datetime(token)
                wait = max(0.0, dt.timestamp() - time.time())
            except (TypeError, ValueError, OverflowError):
                wait = None
    if wait is None:
        wait = default * (2 ** max(0, attempt))
    return min(cap, max(0.2, wait))


def http_status_of(err: BaseException) -> int | None:
    """Le code HTTP porté par l'exception, s'il y en a un."""
    resp = getattr(err, "response", None)
    code = getattr(resp, "status_code", None) if resp is not None else None
    if isinstance(code, int) and code > 0:
        return code
    for arg in getattr(err, "args", ()):
        if isinstance(arg, int) and arg in RETRY_STATUSES:
            return arg
        if isinstance(arg, int) and arg >= 400:
            return arg
    m = re.search(r"\bHTTP\s+(\d{3})\b", str(err), re.I) or re.search(
        r"status code:\s*,?\s*(\d{3})", str(err), re.I
    )
    if m:
        return int(m.group(1))
    m = re.search(r"\b(429|503)\b", str(err))
    return int(m.group(1)) if m else None


def is_rate_limited(err: BaseException) -> bool:
    if isinstance(err, RateLimited):
        return True
    status = http_status_of(err)
    return status in RETRY_STATUSES


def retry_after_from_exc(err: BaseException, attempt: int = 0) -> float:
    if isinstance(err, RateLimited):
        return min(MAX_WAIT_S, max(0.2, err.retry_after_s))
    headers = getattr(getattr(err, "response", None), "headers", None)
    if headers:
        return retry_after_s(headers, attempt)
    m = re.search(r"retry-after:\s*([0-9]+(?:\.[0-9]+)?)", str(err), re.I)
    if m:
        return retry_after_s({"retry-after": m.group(1)}, attempt)
    args = getattr(err, "args", ())
    for i, arg in enumerate(args):
        if str(arg).strip().lower().rstrip(":") == "retry-after" and i + 1 < len(args):
            return retry_after_s({"retry-after": str(args[i + 1])}, attempt)
    return retry_after_s(None, attempt)


class Circuit:
    """Coupe-circuit, fichier partagé + compteur en mémoire."""

    def __init__(
        self,
        path: Path | str | None = None,
        *,
        limit: int = TRIP_AFTER,
        cooldown_s: float = COOLDOWN_S,
    ) -> None:
        self.path = Path(path) if path is not None else CIRCUIT_PATH
        self.limit = max(1, limit)
        self.cooldown_s = cooldown_s
        self.consecutive = 0

    def open(self) -> bool:
        return time.time() < self._read_until()

    def remaining_s(self) -> float:
        return max(0.0, self._read_until() - time.time())

    def hit_ok(self) -> None:
        self.consecutive = 0

    def hit_limited(self, wait_s: float) -> None:
        self.consecutive += 1
        if self.consecutive >= self.limit:
            self.trip(wait_s)

    def trip(self, wait_s: float | None = None) -> None:
        hold = max(self.cooldown_s, float(wait_s or 0.0))
        self._write_until(time.time() + hold)

    def reset(self) -> None:
        self.consecutive = 0
        try:
            self.path.unlink()
        except FileNotFoundError:
            pass

    def _read_until(self) -> float:
        try:
            return float(self.path.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            return 0.0

    def _write_until(self, until: float) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(str(until), encoding="utf-8")
        except OSError:
            pass


airbnb_circuit = Circuit()


def call_with_retry(fn: Callable[[], T], *, tries: int = MAX_TRIES, circuit: Circuit | None = None) -> T:
    """Appelle `fn`. 429/503 : attend, réessaie. Le coupe-circuit arrête net."""
    gate = circuit if circuit is not None else airbnb_circuit
    last: BaseException | None = None
    for attempt in range(max(1, tries)):
        if gate.open() and attempt == 0:
            raise RateLimited(429, gate.remaining_s() or DEFAULT_WAIT_S)
        try:
            out = fn()
            gate.hit_ok()
            return out
        except RateLimited as err:
            last = err
            gate.hit_limited(err.retry_after_s)
            if attempt + 1 >= tries:
                raise
            time.sleep(min(err.retry_after_s, MAX_WAIT_S))
        except Exception as err:
            if not is_rate_limited(err):
                raise
            wait = retry_after_from_exc(err, attempt)
            last = RateLimited(http_status_of(err) or 429, wait)
            gate.hit_limited(wait)
            if attempt + 1 >= tries:
                raise last
            time.sleep(min(wait, MAX_WAIT_S))
    raise last or RateLimited()


def _header(headers: Any, name: str) -> str | None:
    if not headers:
        return None
    cible = name.lower()
    try:
        items = headers.items()
    except Exception:
        return None
    for key, value in items:
        if str(key).lower() == cible and value is not None:
            token = str(value).strip()
            return token or None
    return None
