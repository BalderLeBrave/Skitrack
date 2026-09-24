"""429 / 503 Airbnb : Retry-After, coupe-circuit, et aucune reprise.

Un 429 n'est pas un refus définitif : Airbnb demande d'attendre. On
l'écoute jusqu'au bout. Au premier refus, on écrit la ligne dans le journal
serveur, on ouvre le coupe-circuit pour toute la pause demandée (45 s au
moins), et on s'arrête en rendant ce qui est déjà lu. Réessayer 2 s plus
tard, c'était envoyer la requête la plus susceptible de prendre le second
429, sans une ligne dans le journal.

Seule notre propre file d'attente (`RythmeLocal`) se reprend : rien n'est
parti, Airbnb n'a rien refusé.

Le coupe-circuit est un fichier : le process Python du sidecar et le
complément de fiches Node le partagent. Relancer pendant la pause ne
renouvelle pas les appels.
"""

from __future__ import annotations

import os
import re
import sys
import tempfile
import time
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Callable, TypeVar

RETRY_STATUSES = {429, 503}
DEFAULT_WAIT_S = 2.0
# Plafond d'un sommeil sur place (reprise du limiteur local), pas d'une pause.
MAX_WAIT_S = 12.0
MAX_TRIES = 3
COOLDOWN_S = 45.0
TRIP_AFTER = 2
# Plafond d'une pause demandée par Airbnb (Retry-After) : le coupe-circuit et
# le journal la tiennent en entier. Elle était coupée à 12 s dans le journal.
PAUSE_MAX_S = 3600.0

# Le dossier temporaire de l'utilisateur, le même pour Python et Node
# (`os.tmpdir()`). « /tmp » visait la racine du lecteur courant sous Windows :
# deux processus lancés depuis deux lecteurs n'avaient pas le même.
CIRCUIT_PATH = Path(
    os.environ.get("SKITRACK_AIRBNB_CIRCUIT") or Path(tempfile.gettempdir()) / "skitrack-airbnb-429"
)

T = TypeVar("T")


class RateLimited(Exception):
    """HTTP 429 ou 503, avec l'attente demandée."""

    def __init__(self, status: int = 429, retry_after_s: float = DEFAULT_WAIT_S):
        super().__init__(f"HTTP {status}")
        self.status = status
        self.retry_after_s = float(retry_after_s)


class RythmeLocal(RateLimited):
    """Notre propre limiteur (`taux.py`) a dit « trop tôt » : Airbnb n'a rien refusé.

    Il se traite comme une attente, jamais comme un refus : il ne compte pas
    pour le coupe-circuit partagé, que deux relevés simultanés ouvraient sinon
    sans qu'Airbnb ait répondu 429 une seule fois.
    """


class CoupeCircuit(RateLimited):
    """Le coupe-circuit partagé est ouvert : rien n'est parti.

    C'est la suite d'un refus antérieur, pas un refus nouveau : on le dit
    ainsi, au lieu d'un « HTTP 429 » qu'Airbnb n'a pas envoyé cette fois.
    """


# La marge d'une requête : une attente qui ne laisse pas au moins ce temps
# avant l'échéance ne sert plus à rien, personne ne lira la réponse.
MARGE_REQUETE_S = 3.0


def _trop_tard(fin: float | None, attente: float) -> bool:
    return fin is not None and time.time() + attente + MARGE_REQUETE_S >= fin


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
    # Un 429 ou un 503 nu ne suffit pas : « timed out after 503 ms » n'est pas
    # un refus d'Airbnb, et ouvrait le coupe-circuit. Il faut un mot de statut
    # à côté, ou le libellé du statut.
    texte = str(err)
    m = re.search(r"\b(?:status(?:\s+code)?|code|error|erreur)\s*[:=]?\s*(429|503)\b", texte, re.I)
    if m:
        return int(m.group(1))
    if re.search(r"too many requests", texte, re.I):
        return 429
    if re.search(r"service unavailable", texte, re.I):
        return 503
    return None


def is_rate_limited(err: BaseException) -> bool:
    if isinstance(err, RateLimited):
        return True
    status = http_status_of(err)
    return status in RETRY_STATUSES


def retry_after_from_exc(err: BaseException, attempt: int = 0, cap: float = MAX_WAIT_S) -> float:
    if isinstance(err, RateLimited):
        return min(cap, max(0.2, err.retry_after_s))
    headers = getattr(getattr(err, "response", None), "headers", None)
    if headers:
        return retry_after_s(headers, attempt, cap=cap)
    m = re.search(r"retry-after:\s*([0-9]+(?:\.[0-9]+)?)", str(err), re.I)
    if m:
        return retry_after_s({"retry-after": m.group(1)}, attempt, cap=cap)
    args = getattr(err, "args", ())
    for i, arg in enumerate(args):
        if str(arg).strip().lower().rstrip(":") == "retry-after" and i + 1 < len(args):
            return retry_after_s({"retry-after": str(args[i + 1])}, attempt, cap=cap)
    return retry_after_s(None, attempt, cap=cap)


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
        try:
            from taux import noter_blocage

            noter_blocage("airbnb", wait_s)
        except Exception:
            pass
        if self.consecutive >= self.limit:
            self.trip(wait_s)

    def trip(self, wait_s: float | None = None) -> float:
        """Ouvre pour `max(cooldown, wait_s)` ; une pause plus longue déjà posée reste. Rend la pause.

        Lecture et écriture sous le même verrou que Node : deux refus
        simultanés ne peuvent plus raccourcir la pause l'un de l'autre.
        """
        from taux import verrou

        hold = max(self.cooldown_s, float(wait_s or 0.0))
        with verrou(self.path.with_name(f"{self.path.name}.lock")):
            self._write_until(max(self._read_until(), time.time() + hold))
        return hold

    def reset(self) -> None:
        self.consecutive = 0
        try:
            self.path.unlink()
        except FileNotFoundError:
            pass

    def _read_until(self) -> float:
        from taux import lire_texte

        texte = lire_texte(self.path)
        try:
            return float(texte.strip()) if texte else 0.0
        except ValueError:
            return 0.0

    def _write_until(self, until: float) -> None:
        # Fichier temporaire propre au processus, puis remplacement : un
        # lecteur ne voit jamais un fichier à moitié écrit, lu comme « fermé ».
        tmp = self.path.with_name(f"{self.path.name}.{os.getpid()}.tmp")
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp.write_text(str(until), encoding="utf-8")
            for essai in range(5):
                try:
                    tmp.replace(self.path)
                    return
                except PermissionError:
                    # Windows : un autre processus lit le fichier à cet instant.
                    # Court : c'est sous le verrou, que Node n'attend que 500 ms.
                    time.sleep(0.01 * (essai + 1))
            self.path.write_text(str(until), encoding="utf-8")
        except OSError:
            pass
        finally:
            try:
                tmp.unlink()
            except OSError:
                pass


airbnb_circuit = Circuit()


def refus(status: int, attente_s: float, etape: str, circuit: Circuit | None = None) -> float:
    """Un vrai refus d'Airbnb : la ligne au journal, puis la pause, partagée.

    Le coupe-circuit s'ouvre dès ce refus-là, pour la pause demandée entière
    (45 s au moins), et le journal de taux la reçoit aussi : Node et les autres
    relevés ne repartent qu'après. La ligne commence par « [airbnb] » : c'est
    ce préfixe que Node relaie au journal serveur.
    """
    gate = circuit if circuit is not None else airbnb_circuit
    gate.consecutive += 1
    hold = gate.trip(attente_s)
    try:
        from taux import noter_blocage

        noter_blocage("airbnb", hold)
    except Exception:
        pass
    print(
        f"[airbnb] HTTP {status} ({etape}) — Airbnb demande {attente_s:.0f} s, pause partagée {hold:.0f} s",
        file=sys.stderr,
    )
    return hold


def call_with_retry(
    fn: Callable[[], T],
    *,
    tries: int = MAX_TRIES,
    circuit: Circuit | None = None,
    fin: float | None = None,
    etape: str = "appel",
) -> T:
    """Appelle `fn`. Un vrai 429/503 arrête net : pas de reprise.

    Le coupe-circuit est relu avant chaque essai : un autre relevé, ou Node,
    peut l'avoir ouvert entre deux. Seul `RythmeLocal` — notre file d'attente,
    rien n'est parti — se reprend, `tries` fois au plus.

    `fin` (instant absolu, `time.time()`) borne les attentes : une reprise qui
    finirait après l'échéance n'est pas tentée, le refus remonte tout de suite
    et l'appelant garde ce qu'il a déjà lu. Sans cette borne, le worker dormait
    au-delà de l'échéance et Node le tuait avant qu'il écrive quoi que ce soit.
    """
    gate = circuit if circuit is not None else airbnb_circuit
    last: BaseException | None = None
    for attempt in range(max(1, tries)):
        if gate.open():
            raise CoupeCircuit(429, gate.remaining_s() or DEFAULT_WAIT_S)
        try:
            out = fn()
            gate.hit_ok()
            return out
        except RythmeLocal as err:
            last = err
            wait = min(err.retry_after_s, MAX_WAIT_S)
            if attempt + 1 >= tries or _trop_tard(fin, wait):
                raise
            time.sleep(wait)
        except CoupeCircuit:
            raise
        except RateLimited as err:
            refus(err.status, min(PAUSE_MAX_S, max(0.2, err.retry_after_s)), etape, gate)
            raise
        except Exception as err:
            if not is_rate_limited(err):
                raise
            attente = retry_after_from_exc(err, attempt, cap=PAUSE_MAX_S)
            status = http_status_of(err) or 429
            refus(status, attente, etape, gate)
            raise RateLimited(status, attente) from err
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
