#!/usr/bin/env python3
"""Relevé manuel daté des fiches Skiinfo France. Hors production."""
from __future__ import annotations

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path("/tmp/skiinfo")
UNION = ROOT / "union.txt"
OUT = ROOT / "snapshot.json"
FR_MASSIFS = {
    "alpes-du-nord": "Alpes du Nord",
    "alpes-du-sud": "Alpes du Sud",
    "pyrenees": "Pyrénées",
    "jura": "Jura",
    "vosges": "Vosges",
    "massif-central": "Massif Central",
    "corse": "Corse",
}
CH_SLUGS = {
    "la-robella",
    "le-brassus",
    "st-cergue-la-dole",
    "ste-croix-les-rasses",
}

UA = "Mozilla/5.0 (compatible; SKITRACK-audit/1.0)"


def get(url: str) -> str:
    req = Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "replace")


def after_label(html: str, label: str) -> str | None:
    m = re.search(
        re.escape(label) + r"</span></div><span[^>]*>([^<]+)",
        html,
        re.I,
    )
    return m.group(1).strip() if m else None


def pct(html: str, label: str) -> int | None:
    raw = after_label(html, label)
    if not raw:
        return None
    m = re.search(r"(\d+)", raw.replace("\xa0", " "))
    return int(m.group(1)) if m else None


def number(raw: str | None) -> float | None:
    if not raw:
        return None
    t = raw.replace("\xa0", " ").replace(" ", "").replace(",", ".")
    m = re.search(r"(\d+(?:\.\d+)?)", t)
    return float(m.group(1)) if m else None


def ft_to_m(v: float | None) -> int | None:
    if v is None:
        return None
    return round(v * 0.3048)


def parse(url: str, html: str) -> dict:
    parts = url.split("/")
    massif_slug, slug = parts[-3], parts[-2]
    name = slug.replace("-", " ").title()
    lat = lon = None
    max_m = min_m = lifts = None
    country = None
    for blob in re.findall(
        r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
        html,
        re.S,
    ):
        try:
            data = json.loads(blob)
        except json.JSONDecodeError:
            continue
        nodes = data if isinstance(data, list) else [data]
        for node in nodes:
            if not isinstance(node, dict):
                continue
            if node.get("@type") == "SkiResort" and node.get("name"):
                name = node["name"]
            addr = node.get("address") or {}
            if isinstance(addr, dict):
                country = addr.get("addressCountry") or country
            geo = node.get("geo") or {}
            if isinstance(geo, dict):
                if geo.get("latitude") is not None:
                    lat = float(geo["latitude"])
                if geo.get("longitude") is not None:
                    lon = float(geo["longitude"])
            for prop in node.get("additionalProperty") or []:
                if not isinstance(prop, dict):
                    continue
                n = (prop.get("name") or "").lower()
                val = prop.get("value")
                unit = (prop.get("unitText") or "").lower()
                try:
                    num = float(val)
                except (TypeError, ValueError):
                    continue
                if "summit" in n:
                    max_m = ft_to_m(num) if unit in {"ft", "feet"} else round(num)
                elif "base" in n:
                    min_m = ft_to_m(num) if unit in {"ft", "feet"} else round(num)
                elif "lifts" in n:
                    lifts = int(num)

    n = number(after_label(html, "Nombre total de pistes"))
    km = number(after_label(html, "Domaine skiable"))
    longest = number(after_label(html, "Piste la plus longue"))
    green = pct(html, "Pistes vertes")
    blue = pct(html, "Pistes bleues")
    red = pct(html, "Pistes rouges")
    black = pct(html, "Pistes noires")
    cc = (country or "").upper()
    is_fr = cc in {"", "FR", "FR-FR", "FRANCE"}
    return {
        "id": slug,
        "name": name,
        "massif": FR_MASSIFS.get(massif_slug, massif_slug),
        "massifSlug": massif_slug,
        "url": url,
        "n": int(n) if n is not None else None,
        "km": km,
        "longestKm": longest,
        "pct": {"green": green, "blue": blue, "red": red, "black": black},
        "lat": lat,
        "lon": lon,
        "minM": min_m,
        "maxM": max_m,
        "villageM": min_m,
        "lifts": lifts,
        "country": country,
        "fr": is_fr and slug not in CH_SLUGS,
        "at": "2026-09-09",
    }


def main() -> None:
    urls = []
    for loc in (ROOT / "union.txt").read_text().splitlines():
        loc = loc.strip()
        if not loc:
            continue
        urls.append(loc.replace("/plans-des-pistes", "/station-de-ski"))
    rows: list[dict] = []
    errors: list[str] = []

    def one(url: str) -> dict | None:
        try:
            html = get(url)
            return parse(url, html)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{url} :: {exc}")
            return None

    with ThreadPoolExecutor(max_workers=12) as pool:
        futs = {pool.submit(one, u): u for u in urls}
        for i, fut in enumerate(as_completed(futs), 1):
            row = fut.result()
            if row:
                rows.append(row)
            if i % 25 == 0:
                print(f"{i}/{len(urls)} ok={len(rows)} err={len(errors)}", flush=True)
            time.sleep(0.02)

    rows.sort(key=lambda r: (r["massif"], r["name"]))
    payload = {
        "at": "2026-09-09",
        "source": "skiinfo.fr station-de-ski",
        "n": len(rows),
        "errors": errors,
        "rows": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    fr = [r for r in rows if r["fr"] and r["n"] and r["km"] and all(r["pct"].values())]
    print("wrote", OUT, "rows", len(rows), "complete FR mix", len(fr), "errors", len(errors))


if __name__ == "__main__":
    main()
