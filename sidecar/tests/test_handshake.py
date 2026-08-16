"""Le handshake, testé sur un vrai processus.

C'est le seul point de contact entre Electron et Python : s'il casse, l'app ne
démarre pas du tout, et un test en mémoire ne le verrait pas.
"""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.error
import urllib.request

import pytest


@pytest.fixture()
def sidecar_process(tmp_path):
    token = "token-de-test-handshake"
    proc = subprocess.Popen(
        [
            sys.executable, "-m", "skitrack",
            "--host", "127.0.0.1",
            "--port", "0",
            "--token-stdin",
            "--data-dir", str(tmp_path),
            "--log-level", "warning",
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    assert proc.stdin is not None and proc.stdout is not None
    proc.stdin.write(token + "\n")
    proc.stdin.flush()
    proc.stdin.close()

    line = proc.stdout.readline()
    try:
        yield proc, json.loads(line), token
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


def _get(url: str, token: str | None) -> tuple[int, dict]:
    req = urllib.request.Request(url)
    if token:
        req.add_header("X-Skitrack-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or b"{}")


def test_handshake_announces_a_bound_port(sidecar_process):
    _proc, handshake, _token = sidecar_process
    assert handshake["event"] == "ready"
    assert handshake["host"] == "127.0.0.1"
    assert handshake["port"] > 0
    assert handshake["pid"] > 0


def test_token_read_from_stdin_is_enforced(sidecar_process):
    """Le token fourni sur stdin protège bien l'API — sans jamais apparaître
    dans la ligne de commande du processus."""
    _proc, handshake, token = sidecar_process
    base = f"http://{handshake['host']}:{handshake['port']}"

    assert _get(f"{base}/api/health", None)[0] == 200  # sonde publique
    assert _get(f"{base}/api/status", None)[0] == 401
    assert _get(f"{base}/api/status", "mauvais-token")[0] == 401

    status, body = _get(f"{base}/api/status", token)
    assert status == 200
    assert body["referential_ready"] is False


def test_token_is_absent_from_the_command_line(sidecar_process):
    _proc, _handshake, token = sidecar_process
    cmdline = " ".join(_proc.args)  # type: ignore[arg-type]
    assert token not in cmdline
    assert "--token-stdin" in cmdline
