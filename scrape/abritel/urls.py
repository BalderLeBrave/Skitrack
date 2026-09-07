"""Porte CozyCozy → fiche abritel.fr. Jamais vrbo.com SERP (429)."""

from __future__ import annotations

import re
import urllib.parse
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

TRACKING = ("mpd", "mpe", "mpb", "mpa", "mpq", "label", "camref", "clickedRef")


def cozy_place(destination: str) -> str:
    n = destination.lower()
    if "2 alpes" in n or "deux alpes" in n:
        return "Les Deux Alpes station de ski, France"
    if re.search(r",\s*france\s*$", destination, re.I):
        return destination.strip()
    return f"{destination.strip()}, France"


def cozy_search_url(
    destination: str,
    check_in: str,
    check_out: str,
    *,
    adults: int = 8,
    children: int = 0,
    bedrooms: int = 0,
) -> str:
    place = urllib.parse.quote(cozy_place(destination))
    return (
        f"https://www.cozycozy.com/fr/search/{place}/{check_in}/{check_out}/"
        f"{bedrooms}-{adults}-{children}/results"
    )


def is_abritel_family(code: str = "", name: str = "", url: str = "") -> bool:
    blob = f"{code} {name} {url}".lower()
    return bool(re.search(r"\b(abritel|vrbo|homeaway)\b", blob))


def canonical_abritel_url(
    raw: str,
    *,
    check_in: str | None = None,
    check_out: str | None = None,
    adults: int | None = None,
    children: int = 0,
) -> str | None:
    if not raw:
        return None
    m = re.search(r"destination:(https?://[^&\s]+)", raw, re.I)
    candidate = urllib.parse.unquote(m.group(1)) if m else raw.strip()
    try:
        u = urlparse(candidate)
    except ValueError:
        return None
    host = (u.hostname or "").replace("www.", "").lower()
    if host not in ("abritel.fr", "vrbo.com"):
        m2 = re.search(r"https?://(?:www\.)?(?:abritel\.fr|vrbo\.com)/[^\s\"'<>]+", candidate, re.I)
        if not m2:
            return None
        u = urlparse(m2.group(0))
        host = (u.hostname or "").replace("www.", "").lower()
    q = parse_qs(u.query, keep_blank_values=True)
    for key in TRACKING:
        q.pop(key, None)
    if check_in:
        q["startDate"] = [check_in]
        q["chkin"] = [check_in]
    if check_out:
        q["endDate"] = [check_out]
        q["chkout"] = [check_out]
    if adults:
        q["adults"] = [str(int(adults))]
        q["children"] = [str(int(children or 0))]
    return urlunparse(("https", "www.abritel.fr", u.path or "/", "", urlencode({k: v[0] for k, v in q.items() if v}), ""))
