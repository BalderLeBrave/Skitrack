#!/usr/bin/env python3
"""Installe le venv Booking + binaires furtifs.

Les IP résidentielles ne s’installent pas : coller Bright Data / SKITRACK_PROXY
dans `.env`.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
VENV = HERE / ".venv"
CHROME_ZIP = "https://cdn.playwright.dev/builds/cft/151.0.7922.34/linux64/chrome-linux64.zip"


def _run(cmd: list[str], *, check: bool = True) -> int:
    print("+", " ".join(cmd), flush=True)
    r = subprocess.run(cmd)
    if check and r.returncode != 0:
        raise SystemExit(r.returncode)
    return r.returncode


def _ensure_venv() -> str:
    vpy = VENV / "bin" / "python"
    if vpy.is_file():
        return str(vpy)
    uv = shutil.which("uv")
    if uv:
        _run([uv, "venv", "--python", "3.11", str(VENV)])
    else:
        for name in ("python3.12", "python3.11"):
            p = shutil.which(name)
            if p:
                _run([p, "-m", "venv", str(VENV)])
                break
        else:
            raise SystemExit("Python 3.11+ ou uv requis")
    return str(VENV / "bin" / "python")


def _chrome() -> None:
    dest = HERE / ".browsers" / "chrome-linux64" / "chrome"
    if dest.is_file():
        return
    dest.parent.parent.mkdir(parents=True, exist_ok=True)
    zip_path = HERE / ".browsers" / "chrome-linux64.zip"
    print("+ download chrome for testing", flush=True)
    urllib.request.urlretrieve(CHROME_ZIP, zip_path)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(HERE / ".browsers")
    zip_path.unlink(missing_ok=True)
    bin_dir = VENV / "bin"
    if dest.is_file() and bin_dir.is_dir():
        for name in ("google-chrome", "chromium"):
            link = bin_dir / name
            try:
                if link.exists() or link.is_symlink():
                    link.unlink()
                link.symlink_to(dest)
            except OSError:
                pass


def main() -> None:
    vpy = _ensure_venv()
    uv = shutil.which("uv")
    if uv:
        _run([uv, "pip", "install", "-r", str(HERE / "requirements.txt"), "--python", vpy])
    else:
        _run([vpy, "-m", "pip", "install", "-U", "pip", "wheel"])
        _run([vpy, "-m", "pip", "install", "-r", str(HERE / "requirements.txt")])
    _run([vpy, "-m", "invisible_playwright", "fetch"], check=False)
    _run([vpy, "-m", "camoufox", "fetch"], check=False)
    _chrome()
    os.environ["PYTHONPATH"] = str(HERE)
    os.environ.setdefault("SKITRACK_CHROME", str(HERE / ".browsers" / "chrome-linux64" / "chrome"))
    _run(
        [
            vpy,
            "-c",
            "import sys; sys.path.insert(0,'.'); from engines import ordered_engines; "
            "print('engines', [(x.name, x.available()) for x in ordered_engines()])",
        ],
        check=False,
    )
    print("venv", vpy)
    print("proxys: coller BRIGHTDATA_BROWSER_WS ou SKITRACK_PROXY dans .env (jamais git)")


if __name__ == "__main__":
    os.chdir(HERE)
    main()
