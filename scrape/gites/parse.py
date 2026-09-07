"""Tuiles SERP Drupal + typologie ITEA. Pas le tarif /semaine."""

from __future__ import annotations

import re
import html as htmlmod
from typing import Any
from urllib.parse import urljoin

CODE_RE = re.compile(r"(\d{2}g\d{3,})", re.I)
TILE_RE = re.compile(
    r'<div class="[^"]*js-search-tile[^"]*"[\s\S]*?(?=<div class="[^"]*js-search-tile|$)',
    re.I,
)


def _fold(s: str) -> str:
    import unicodedata

    n = unicodedata.normalize("NFD", s)
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", n).strip().lower()


def _strip(html: str) -> str:
    t = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = t.replace("&nbsp;", " ").replace("&#160;", " ")
    return re.sub(r"\s+", " ", t).strip()


def code_from_url(url: str) -> str | None:
    m = CODE_RE.search(url or "")
    return m.group(1).upper() if m else None


def classify(ident: str = "", url: str = "", type_label: str = "") -> str:
    if ident:
        m = re.search(r"\.([A-Za-z]+)$", ident.strip())
        if m:
            s = m.group(1).upper()
            if s == "G":
                return "gite"
            if s == "H":
                return "chambre_hotes"
            if s in ("GS", "GG"):
                return "groupe"
    path = _fold((url or "").replace("\\", "/"))
    if re.search(r"chambre[-_ ]?d[-_ ]?hotes|bed-and-breakfast", path):
        return "chambre_hotes"
    if re.search(r"gites?[-_ ]de[-_ ]groupe|gites?[-_ ]de[-_ ]sejour", path):
        return "groupe"
    label = _fold(type_label)
    if label:
        if "chambre" in label and "hote" in label:
            return "chambre_hotes"
        if re.search(r"gite(?:s)?\s+de\s+(?:groupe|sejour)|\bgroupe\b", label):
            return "groupe"
        if re.search(r"camping|\baire\b", label):
            return "bad_type"
        if re.search(r"\bgites?\b", label):
            return "gite"
    if re.search(r"/gite[-_]|gite-", path):
        return "gite"
    return "missing"


def keep_gite(ident: str = "", url: str = "", type_label: str = "") -> bool:
    return classify(ident=ident, url=url, type_label=type_label) == "gite"


def parse_stay_total(html: str) -> float | None:
    m = re.search(r'sp_montantPrixTotal[^>]*data-prix="([\d.]+)"', html, re.I)
    if m:
        n = float(m.group(1))
        return round(n, 2) if n > 0 else None
    m = re.search(r'data-prixtotal="([\d\s.,]+)\s*(?:€|&euro;)?"', html, re.I)
    if m:
        n = float(m.group(1).replace(" ", "").replace(",", "."))
        return round(n, 2) if n > 0 else None
    return None


def quote_blocked(body: str) -> bool:
    if parse_stay_total(body) is not None:
        return False
    return "contactSiNonVendable" in body or bool(
        re.search(r"nous ne pouvons pas calculer le prix de ce s[ée]jour", body, re.I)
    )


def widget_context(html: str) -> dict[str, str] | None:
    ident = re.search(r'data-ident="([^"]+)"', html)
    instance = re.search(r'data-instance="([^"]+)"', html)
    exercice = re.search(r'data-exercice="([^"]+)"', html)
    if not (ident and instance and exercice):
        return None
    return {"ident": ident.group(1), "instance": instance.group(1), "exercice": exercice.group(1)}


def widget_photo(html: str) -> str | None:
    og = re.search(r'property=["\']og:image["\'][^>]*content=["\'](https?://[^"\']+)["\']', html, re.I)
    if og:
        return og.group(1)
    itea = re.search(r"https?://widget-fngf\.itea\.fr/photos/[^\"'\s>]+\.(?:jpe?g|png|webp)", html, re.I)
    return itea.group(0) if itea else None


def last_page_index(html: str) -> int:
    """Drupal `page=` 0-based. 0 si un seul écran."""
    nums = [int(n) for n in re.findall(r"[?&]page=(\d+)", html or "")]
    return max(nums) if nums else 0


def advertised_count(html: str) -> int | None:
    m = re.search(r"(\d+)\s*R[ée]sultats?", html or "", re.I)
    if not m:
        return None
    n = int(m.group(1))
    return n if 0 < n < 50_000 else None


def tiles_from_html(html: str) -> list[dict[str, Any]]:
    blocks = TILE_RE.findall(html or "")
    if not blocks and "js-search-tile" in (html or ""):
        blocks = [html]
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for chunk in blocks:
        href = re.search(r'href="(/fr/[^"]*\d{2}g\d{3,}[^"]*)"', chunk, re.I)
        if not href:
            href = re.search(
                r'href="(https?://www\.gites-de-france\.com/fr/[^"]*\d{2}g\d{3,}[^"]*)"',
                chunk,
                re.I,
            )
        if not href:
            continue
        raw = htmlmod.unescape(href.group(1))
        url = raw if raw.startswith("http") else urljoin("https://www.gites-de-france.com", raw)
        code = code_from_url(url)
        if not code or code in seen:
            continue
        seen.add(code)
        kind = re.search(r"g2f-accommodationTile-text-type[^>]*>([\s\S]*?)</", chunk, re.I)
        type_label = _strip(kind.group(1)) if kind else ""
        if not keep_gite(url=url, type_label=type_label):
            continue
        title_m = re.search(r"g2f-accommodationTile-link[^>]*>([\s\S]*?)</", chunk, re.I)
        title = htmlmod.unescape(_strip(title_m.group(1))) if title_m else code
        cap = _strip(chunk)
        gm = re.search(r"(\d+)\s*(?:personnes?|voyageurs?)", cap, re.I)
        bm = re.search(r"(\d+)\s*chambres?", cap, re.I)
        price_h = re.search(r"g2f-accommodationTile-text-price[\s\S]{0,500}", chunk, re.I)
        row: dict[str, Any] = {
            "source": "gites-web",
            "sourceId": code,
            "title": title,
            "url": url,
            "propertyType": type_label or "Gîte",
        }
        if gm:
            row["guests"] = int(gm.group(1))
        if bm:
            row["bedrooms"] = int(bm.group(1))
        if price_h:
            row["weeklyFromText"] = _strip(price_h.group(0))
        img = re.search(
            r"/sites/default/files/[^\"'\s>]+\.(?:jpe?g|png|webp)(?:\?[^\"'\s>]*)?",
            chunk,
            re.I,
        )
        if img:
            row["images"] = [urljoin("https://www.gites-de-france.com", img.group(0))]
        out.append(row)
    return out
