"""Limites de taux, fichier partagé Python / Node.

On ne découvre pas la limite au 429 : on se cale avant. Relancer lit le
même journal, donc ne martèle pas pendant la fenêtre.

Chaque appel **réserve son créneau** sous un verrou de fichier, puis dort
jusqu'à lui. L'ancien « regarder, dormir, noter » laissait deux processus
voir le même créneau libre, repartir ensemble, et s'effacer leurs appels
l'un l'autre : l'écart de 2 s et le plafond de 18 par minute ne tenaient
plus dès que deux relevés, ou un relevé et le complément de fiches Node,
tournaient en même temps. `src/lib/stay/taux.server.ts` suit le même
protocole, sur les mêmes fichiers.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

# Le dossier temporaire de l'utilisateur, le même pour Python et Node
# (`os.tmpdir()`). « /tmp » visait la racine du lecteur courant sous Windows.
TAUX_PATH = Path(os.environ.get("SKITRACK_TAUX") or Path(tempfile.gettempdir()) / "skitrack-taux.json")

# Airbnb : 18 appels / 60 s, 2 s entre deux. Au-delà on s'arrête, on garde le relevé.
HOSTS: dict[str, tuple[float, int]] = {
    "airbnb": (2.0, 18),
    # Le CDN statique d'Airbnb (muscache.com) : des fichiers, pas l'API.
    "airbnb-cdn": (0.3, 60),
    "gites": (2.0, 24),
    "booking": (1.2, 24),
}
WINDOW_S = 60.0
SLEEP_CAP_S = 5.0
# Un verrou plus vieux que ça a été abandonné (processus tué) : on le reprend.
VERROU_PERIME_S = 2.0
# On n'attend jamais le verrou plus longtemps : au pire, l'ancien comportement.
VERROU_ATTENTE_S = 0.5


def _verrou_path() -> Path:
    return TAUX_PATH.with_name(f"{TAUX_PATH.name}.lock")


def _reprendre_si_perime(chemin: Path) -> bool:
    """Retire un verrou abandonné, un seul prétendant à la fois. Rend vrai s'il l'a retiré.

    Deux prétendants qui jugeaient le même verrou périmé pouvaient, l'un après
    l'autre, effacer le verrou tout frais de l'autre et entrer ensemble. La
    reprise passe donc elle-même par un verrou (`.reprise`) : seul son
    détenteur relit la date et retire le verrou s'il est toujours périmé.
    """
    reprise = chemin.with_name(f"{chemin.name}.reprise")
    try:
        fd = os.open(reprise, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except (FileExistsError, PermissionError):
        try:
            # Un prétendant mort pendant sa reprise : on retire son `.reprise`.
            if time.time() - reprise.stat().st_mtime > VERROU_PERIME_S:
                reprise.unlink()
        except OSError:
            pass
        return False
    except OSError:
        return False
    os.close(fd)
    try:
        if time.time() - chemin.stat().st_mtime > VERROU_PERIME_S:
            chemin.unlink()
            return True
        return False
    except OSError:
        return False
    finally:
        try:
            reprise.unlink()
        except OSError:
            pass


@contextmanager
def verrou(chemin: Path) -> Iterator[None]:
    """Verrou de fichier inter-processus, compatible avec celui de Node (`wx`).

    Le fichier porte un jeton propre au détenteur : on ne retire que le sien.
    Un verrou repris comme périmé par un autre ne lui est donc pas arraché
    au moment où l'ancien détenteur, seulement lent, le rend.
    """
    jeton = f"{os.getpid()}-{time.time_ns()}".encode()
    tenu = False
    limite = time.time() + VERROU_ATTENTE_S
    while True:
        try:
            chemin.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(chemin, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            try:
                os.write(fd, jeton)
                tenu = True
            except OSError:
                pass
            finally:
                os.close(fd)
            if not tenu:
                # Jeton non écrit : ce verrou ne serait jamais rendu. On le retire.
                try:
                    chemin.unlink()
                except OSError:
                    pass
            break
        except (FileExistsError, PermissionError):
            try:
                if time.time() - chemin.stat().st_mtime > VERROU_PERIME_S and _reprendre_si_perime(chemin):
                    continue
            except OSError:
                pass
            if time.time() >= limite:
                break
            time.sleep(0.01)
        except OSError:
            break
    try:
        yield
    finally:
        if tenu:
            try:
                if chemin.read_bytes() == jeton:
                    chemin.unlink()
            except OSError:
                pass


def _verrou():
    return verrou(_verrou_path())


def lire_texte(chemin: Path) -> str | None:
    """Le contenu d'un fichier partagé, ou None s'il n'existe pas.

    Vide ou coupé : un écrivain le réécrit en place (repli quand Windows refuse
    le remplacement). On relit un instant plus tard, au lieu de le prendre pour
    « aucune pause » et de repartir.
    """
    texte = ""
    for _ in range(3):
        try:
            texte = chemin.read_text(encoding="utf-8")
        except FileNotFoundError:
            return None
        except OSError:
            texte = ""
        if texte.strip():
            return texte
        time.sleep(0.005)
    return texte


def _load() -> dict:
    for essai in range(3):
        texte = lire_texte(TAUX_PATH)
        if texte is None:
            return {}
        try:
            raw = json.loads(texte)
            return raw if isinstance(raw, dict) else {}
        except (ValueError, TypeError):
            # Coupé en pleine écriture en place : on relit.
            time.sleep(0.005 * (essai + 1))
    return {}


def _save(data: dict) -> None:
    # Un fichier temporaire par processus : Node et Python écrivaient le même
    # « .json.tmp », et l'un pouvait publier le journal à moitié écrit de l'autre.
    tmp = TAUX_PATH.with_name(f"{TAUX_PATH.name}.{os.getpid()}.tmp")
    try:
        TAUX_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps(data), encoding="utf-8")
        for essai in range(5):
            try:
                tmp.replace(TAUX_PATH)
                return
            except PermissionError:
                # Windows : un lecteur tient le fichier à cet instant. Court :
                # c'est sous le verrou, que les autres n'attendent que 500 ms.
                time.sleep(0.01 * (essai + 1))
    except OSError:
        pass
    finally:
        try:
            tmp.unlink()
        except OSError:
            pass


def _hits(row: dict, now: float) -> list[float]:
    # Les créneaux réservés sont dans le futur : ils comptent déjà.
    return [float(t) for t in row.get("hits") or [] if isinstance(t, (int, float)) and now - float(t) < WINDOW_S]


def attente_s(host: str, now: float | None = None) -> float:
    """Le temps jusqu'au prochain créneau libre : après la pause, l'écart et le plafond.

    La pause ne dispense pas de l'écart : pendant un `until` court, chacun
    recevait `until` pile, et tous partaient ensemble à sa fin.
    """
    now = time.time() if now is None else now
    row = _load().get(host) or {}
    depart = max(now, float(row.get("until") or 0))
    hits = _hits(row, now)
    gap, max_n = HOSTS.get(host, (2.0, 20))
    if hits:
        depart = max(depart, max(hits) + gap)
    if len(hits) >= max_n:
        depart = max(depart, min(hits) + WINDOW_S)
    return max(0.0, depart - now)


def pause_s(host: str, now: float | None = None) -> float:
    """Ce qu'il reste d'une pause posée par un refus (`until`), 0 sinon."""
    now = time.time() if now is None else now
    until = float((_load().get(host) or {}).get("until") or 0)
    return max(0.0, until - now)


def _noter_hit(host: str, at: float) -> None:
    data = _load()
    row = data.get(host) if isinstance(data.get(host), dict) else {}
    hits = _hits(row, at)
    hits.append(at)
    data[host] = {"hits": hits, "until": float(row.get("until") or 0)}
    _save(data)


def noter_hit(host: str, now: float | None = None) -> None:
    with _verrou():
        _noter_hit(host, time.time() if now is None else now)


def noter_blocage(host: str, wait_s: float, now: float | None = None) -> None:
    now = time.time() if now is None else now
    hold = max(0.2, float(wait_s))
    with _verrou():
        data = _load()
        row = data.get(host) if isinstance(data.get(host), dict) else {}
        data[host] = {
            "hits": _hits(row, now),
            "until": max(float(row.get("until") or 0), now + hold),
        }
        _save(data)


def reserver(host: str, sleep_cap: float = SLEEP_CAP_S) -> tuple[float, bool]:
    """Réserve le prochain créneau libre s'il tombe dans `sleep_cap`.

    Rend (attente, réservé). Réservé : l'appelant dort `attente` puis part, et
    le créneau compte déjà pour tous les autres. Non réservé : rien n'est
    écrit, l'appelant s'arrête.
    """
    with _verrou():
        now = time.time()
        wait = attente_s(host, now)
        if wait > sleep_cap:
            return wait, False
        _noter_hit(host, now + wait)
        return wait, True


def pace(host: str, sleep_cap: float = SLEEP_CAP_S) -> float:
    """Attend si c'est court. Sinon rend l'attente : l'appelant s'arrête.

    Après le sommeil, la pause est relue : un refus arrivé pendant l'attente
    (autre relevé, ou Node) arrête aussi ce créneau-là. Le créneau réservé
    reste compté, ce qui ne fait que ralentir.
    """
    wait, reserve = reserver(host, sleep_cap)
    if not reserve:
        return wait
    if wait > 0:
        time.sleep(wait)
        reste = pause_s(host)
        if reste > 0:
            return reste
    return 0.0
