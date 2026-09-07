"""URLs Gîtes de France. towns= (autocomplete), jamais entity_id POI."""

from __future__ import annotations

import re
import unicodedata
from urllib.parse import urlencode

FACET_GITE = "type:36172"
WIDGET_KEY = "FNGF-00M562O4"

TOWNS = (
    ("deux alpes", "50301"),
    ("2 alpes", "50301"),
    ("karellis", "64400"),
    ("montricher", "64400"),
    ("les angles", "61540"),
    ("foret blanche", "38123"),
)


def _fold(s: str) -> str:
    n = unicodedata.normalize("NFD", s)
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    return n.lower()


def towns_id(destination: str) -> str | None:
    n = _fold(destination)
    if re.search(r"angles-sur-correze", n):
        return None
    if re.search(r"vars-sur-roseix", n):
        return None
    if re.search(r"(?:^|[^a-z0-9])2[\s-]?alpes(?:$|[^a-z0-9])", n) or "deux alpes" in n:
        return "50301"
    if "karellis" in n or "montricher" in n:
        return "64400"
    if re.search(r"\bles angles\b", n) or "les-angles" in n:
        return "61540"
    if re.search(r"\bvars\b", n) or "foret blanche" in n:
        return "38123"
    return None


def search_url(
    destination: str,
    check_in: str,
    check_out: str,
    *,
    adults: int = 8,
    children: int = 0,
    page: int = 0,
    towns: str | None = None,
) -> str:
    q: dict[str, str] = {}
    tid = towns or towns_id(destination)
    if tid:
        q["towns"] = tid
        q["travelers"] = str(adults)
    else:
        q["destination"] = destination
        q["adults"] = str(adults)
    if check_in:
        q["date-start"] = check_in
    if check_out:
        q["date-end"] = check_out
    q["f[0]"] = FACET_GITE
    if children:
        q["children"] = str(children)
    if page > 0:
        q["page"] = str(page)
    return "https://www.gites-de-france.com/fr/search?" + urlencode(q)


def widget_url(code: str) -> str:
    ident = code.upper()
    return (
        f"https://widget-fngf.itea.fr/fiche-{ident}.html?"
        + urlencode(
            {
                "WIDGET": "RESAFNGF",
                "KEY": WIDGET_KEY,
                "LANGUE": "FR",
                "NUMGITE": ident,
            }
        )
    )


def iso_to_fr(iso: str) -> str | None:
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", iso or "")
    if not m:
        return None
    return f"{m[3]}/{m[2]}/{m[1]}"
