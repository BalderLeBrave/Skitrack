#!/usr/bin/env python3
"""Venv Booking + Chrome de *cette* machine (Windows / macOS / Linux)."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VENV = HERE / ".venv"


def _run(cmd: list[str], *, check: bool = True, env: dict | None = None) -> int:
    print("+", " ".join(cmd), flush=True)
    r = subprocess.run(cmd, env=env)
    if check and r.returncode != 0:
        raise SystemExit(r.returncode)
    return r.returncode


def _venv_python() -> Path:
    return VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def _ensure_venv() -> str:
    vpy = _venv_python()
    if vpy.is_file():
        probe = subprocess.run([str(vpy), "-c", "import sys; print(sys.version)"], capture_output=True)
        if probe.returncode == 0:
            return str(vpy)
        shutil.rmtree(VENV, ignore_errors=True)
    uv = shutil.which("uv")
    if uv:
        _run([uv, "venv", "--python", "3.11", str(VENV)])
        return str(_venv_python())
    for name in (("py", "-3"), ("python3.12",), ("python3.11",), ("python3",), ("python",)):
        exe = shutil.which(name[0])
        if not exe:
            continue
        cmd = [exe, *name[1:], "-m", "venv", str(VENV)]
        if _run(cmd, check=False) == 0 and _venv_python().is_file():
            return str(_venv_python())
    raise SystemExit("Python 3.11+ requis (winget install Python.Python.3.12)")


def _chrome(vpy: str) -> None:
    env = os.environ.copy()
    env["PLAYWRIGHT_BROWSERS_PATH"] = str(HERE / ".browsers" / "pw")
    _run([vpy, "-m", "playwright", "install", "chromium"], check=False, env=env)
    os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", env["PLAYWRIGHT_BROWSERS_PATH"])
    _run([vpy, "-m", "invisible_playwright", "fetch"], check=False)
    _run([vpy, "-m", "camoufox", "fetch"], check=False)


def main() -> None:
    vpy = _ensure_venv()
    uv = shutil.which("uv")
    if uv:
        _run([uv, "pip", "install", "-r", str(HERE / "requirements.txt"), "--python", vpy])
    else:
        _run([vpy, "-m", "pip", "install", "-U", "pip", "wheel"])
        _run([vpy, "-m", "pip", "install", "-r", str(HERE / "requirements.txt")])
    _chrome(vpy)
    print("venv", vpy)
    print("chrome: Playwright chromium (OS courant) dans scrape/booking/.browsers/pw")
    print("cles: copier .env.example vers .env si besoin (jamais git)")


if __name__ == "__main__":
    os.chdir(HERE)
    main()
