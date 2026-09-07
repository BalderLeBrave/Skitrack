#!/usr/bin/env python3
"""HTTP du worker Gîtes. SOURCE=gites-web. Isolé de Booking / Airbnb."""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from search import run_search  # noqa: E402

SOURCE = os.environ.get("SOURCE", "gites-web")
PORT = int(os.environ.get("PORT", "8080"))


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("gites-worker " + (fmt % args) + "\n")

    def _send(self, status: int, body: dict) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] == "/health":
            self._send(200, {"ok": True, "source": SOURCE, "isolated": True, "engine": "botasaurus+itea"})
            return
        self._send(404, {"ok": False, "error": "inconnu"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/search":
            self._send(404, {"ok": False, "error": "inconnu"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            params = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError as err:
            self._send(400, {"ok": False, "error": f"JSON: {err}"})
            return
        if not isinstance(params, dict):
            self._send(400, {"ok": False, "error": "corps objet attendu"})
            return
        out = run_search(params)
        self._send(200 if out.get("ok") else 502, out)


def main() -> None:
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    sys.stderr.write(f"gites-worker {SOURCE} :{PORT}\n")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
