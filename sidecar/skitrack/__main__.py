"""Point d'entrée du sidecar — lancé par Electron comme processus enfant.

Protocole de handshake
----------------------
1. Electron génère un token de session (32 octets aléatoires) et lance :

       python -m skitrack --host 127.0.0.1 --port 0 --token-stdin --data-dir <path>

   puis écrit le token suivi d'un saut de ligne sur **stdin** du processus.

   Le token ne transite **ni par les arguments ni par l'environnement** : sous
   Windows, `Get-CimInstance Win32_Process` expose la ligne de commande de tout
   processus de la session à n'importe quelle application, sans élévation. Un
   token en argv serait donc lisible par le premier programme venu, ce qui
   annulerait l'intérêt de l'authentification. (`--token <hex>` reste accepté
   pour le développement et les tests en ligne de commande.)

2. Le sidecar demande à l'OS un port libre (``--port 0``), puis écrit **une
   ligne JSON sur stdout** :

       {"event":"ready","host":"127.0.0.1","port":51234,"pid":8123,"version":"0.1.0"}

3. Electron lit cette ligne, arrête de scruter stdout et parle en HTTP.

Le port est obtenu *avant* de démarrer uvicorn, en réservant la socket
nous-mêmes : uvicorn ne publie son port effectif nulle part d'exploitable, et
scruter ses logs serait fragile. La socket est passée à uvicorn, donc aucune
fenêtre de course entre l'annonce du port et sa mise en écoute.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import socket
import sys
from pathlib import Path

import uvicorn

from . import __version__
from .config import Settings, set_settings


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="skitrack-sidecar")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0, help="0 = port libre choisi par l'OS")
    parser.add_argument("--token", default=os.environ.get("SKITRACK_TOKEN", ""))
    parser.add_argument(
        "--token-stdin",
        action="store_true",
        help="Lire le token de session sur la première ligne de stdin (mode Electron)",
    )
    parser.add_argument("--data-dir", default=os.environ.get("SKITRACK_DATA_DIR"))
    parser.add_argument("--log-level", default=os.environ.get("SKITRACK_LOG_LEVEL", "info"))
    return parser.parse_args(argv)


def _read_token_from_stdin() -> str:
    """Lit une seule ligne sur stdin.

    Bloquant volontairement : sans token, le sidecar servirait une API ouverte à
    tout processus local. Mieux vaut ne jamais démarrer.
    """
    line = sys.stdin.readline()
    if not line:
        raise SystemExit(
            "--token-stdin demandé mais stdin s'est fermé sans fournir de token."
        )
    return line.strip()


def _reserve_socket(host: str, port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    # Pas de SO_REUSEADDR sous Windows : il y autorise le *vol* de port par un
    # autre processus (comportement SO_REUSEADDR ≠ POSIX). On veut l'inverse.
    sock.bind((host, port))
    sock.listen(128)
    return sock


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    token = _read_token_from_stdin() if args.token_stdin else args.token

    settings_kwargs: dict = {
        "host": args.host,
        "port": args.port,
        "token": token,
        "log_level": args.log_level.upper(),
    }
    if args.data_dir:
        settings_kwargs["data_dir"] = Path(args.data_dir)
    settings = Settings(**settings_kwargs)
    settings.ensure_dirs()
    set_settings(settings)

    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s — %(message)s",
        stream=sys.stderr,  # stdout est réservé au handshake
    )

    if not token:
        logging.getLogger(__name__).warning(
            "Aucun token de session : l'API est ouverte à tout processus local. "
            "Acceptable en développement uniquement."
        )

    sock = _reserve_socket(args.host, args.port)
    bound_host, bound_port = sock.getsockname()

    handshake = {
        "event": "ready",
        "host": bound_host,
        "port": bound_port,
        "pid": os.getpid(),
        "version": __version__,
    }
    sys.stdout.write(json.dumps(handshake) + "\n")
    sys.stdout.flush()

    from .app import create_app

    config = uvicorn.Config(
        create_app(),
        log_level=args.log_level.lower(),
        access_log=False,
        # Le shell Electron gère l'arrêt : on ne veut pas qu'uvicorn intercepte
        # les signaux et laisse un processus orphelin en cas de kill brutal.
        lifespan="on",
    )
    server = uvicorn.Server(config)
    server.run(sockets=[sock])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
