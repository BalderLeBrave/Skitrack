"""Devis séjour ITEA — HTTP, hors Cloudflare Drupal."""

from __future__ import annotations

import urllib.parse
import urllib.request
from typing import Any

from parse import parse_stay_total, quote_blocked, widget_context, widget_photo
from urls import iso_to_fr, widget_url

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
AJAX = "https://widget-fngf.itea.fr/lib_2/ajax/gereResa.php"


def _read(url: str, data: bytes | None = None) -> str:
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9",
    }
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        headers["Referer"] = url if "itea.fr" in url else "https://widget-fngf.itea.fr/"
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as res:
        raw = res.read()
    for enc in ("cp1252", "utf-8", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def quote(code: str, check_in: str, check_out: str, adults: int) -> dict[str, Any]:
    deb, fin = iso_to_fr(check_in), iso_to_fr(check_out)
    if not deb or not fin:
        return {"available": False, "price_firm": False}
    page = _read(widget_url(code))
    ctx = widget_context(page)
    if not ctx:
        return {"available": False, "price_firm": False}
    photo = widget_photo(page)
    form = urllib.parse.urlencode(
        {
            "nbAdultes": str(adults),
            "dateDeb": deb,
            "dateFin": fin,
            "instance": ctx["instance"],
            "ident": ctx["ident"],
            "exercice": ctx["exercice"],
            "estpresentsurfiche": "true",
            "type": "getHTMLTabPrixFormulesSejour",
        }
    ).encode()
    body = _read(AJAX, data=form)
    stay = parse_stay_total(body)
    if stay is None or quote_blocked(body):
        return {
            "available": False,
            "price_firm": False,
            "ident": ctx["ident"],
            "photo": photo,
        }
    return {
        "available": True,
        "price_firm": True,
        "totalPrice": stay,
        "currency": "EUR",
        "ident": ctx["ident"],
        "photo": photo,
        "checkIn": check_in,
        "checkOut": check_out,
    }
