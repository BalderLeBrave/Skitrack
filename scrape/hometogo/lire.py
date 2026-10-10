#!/usr/bin/env python3
"""Un GET HomeToGo.

Le `fetch` de Node reçoit un défi Cloudflare (HTTP 403, « Just a moment »).
`urllib` reçoit la page. On ne retente pas : un seul appel, le statut réel.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

# Le même en-tête que `UA_NAVIGATEUR` (`src/lib/scrape/navigateur.ts`).
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
ACCEPT_HTML = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
TAILLE_MAX = 20_000_000


def hote_ok(url: str) -> bool:
    from urllib.parse import urlparse

    u = urlparse(url)
    host = (u.hostname or "").lower()
    return u.scheme == "https" and (host == "www.hometogo.fr" or host.endswith(".hometogo.fr"))


class RedirectionHometogo(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        if not hote_ok(newurl):
            return None
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def rendre(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))


def main() -> None:
    try:
        dem = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as err:
        rendre({"ok": False, "error": f"JSON: {err}"})
        return
    if not isinstance(dem, dict):
        rendre({"ok": False, "error": "corps objet attendu"})
        return
    url = dem.get("url")
    if not isinstance(url, str) or not hote_ok(url):
        rendre({"ok": False, "error": "url hors HomeToGo"})
        return
    try:
        timeout = float(dem.get("timeout") or 15)
    except (TypeError, ValueError):
        timeout = 15
    timeout = max(1.0, min(timeout, 30.0))
    accept = dem.get("accept")
    if not isinstance(accept, str) or not accept.strip():
        accept = ACCEPT_HTML
    req = urllib.request.Request(
        url,
        headers={
            "accept": accept,
            "accept-language": "fr-FR,fr;q=0.9",
            "user-agent": UA,
            "cookie": "c=EUR; meas=metric",
        },
    )
    opener = urllib.request.build_opener(RedirectionHometogo)
    try:
        with opener.open(req, timeout=timeout) as res:
            status = int(res.status)
            headers = res.headers
            body = res.read(TAILLE_MAX + 1)
    except urllib.error.HTTPError as err:
        status = int(err.code)
        headers = err.headers
        body = err.read(TAILLE_MAX + 1)
    except Exception as err:  # noqa: BLE001 — le statut remonte, on n'invente pas une page
        rendre({"ok": False, "error": str(err)[:200]})
        return
    if len(body) > TAILLE_MAX:
        rendre({"ok": False, "error": "réponse trop grande"})
        return
    rendre(
        {
            "ok": True,
            "status": status,
            "cfMitigated": headers.get("cf-mitigated") if headers else None,
            "retryAfter": headers.get("retry-after") if headers else None,
            "texte": body.decode("utf-8", "replace"),
        }
    )


if __name__ == "__main__":
    main()
