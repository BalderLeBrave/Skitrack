"""Résolution dest_id / dest_type — sans ça Booking renvoie l’accueil (`errorc_searchstring_not_found`).

Isolé d’Airbnb / Gîtes. Autocomplete Omkar + cache local (stations).
On ne tape pas l’autocomplete Booking en HTTP nu : 404 / 202.
"""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
CACHE_PATH = Path(os.environ.get("SKITRACK_BOOKING_DEST_CACHE") or HERE / "dest_cache.json")

# Stations déjà vues. Un dest_type=hotel pointe une fiche, pas le domaine.
SEED: dict[str, dict[str, str]] = {
    "les 2 alpes": {
        "dest_id": "900187201",
        "dest_type": "landmark",
        "ss": "Les 2 Alpes, Les Deux Alpes, Rhône-Alpes, France",
        "ssne": "Les 2 Alpes",
        "label": "Les 2 Alpes, Les Deux Alpes, Rhône-Alpes, France",
    },
    "les deux alpes": {
        "dest_id": "900187201",
        "dest_type": "landmark",
        "ss": "Les 2 Alpes, Les Deux Alpes, Rhône-Alpes, France",
        "ssne": "Les 2 Alpes",
        "label": "Les 2 Alpes, Les Deux Alpes, Rhône-Alpes, France",
    },
}


@dataclass(frozen=True)
class Destination:
    query: str
    dest_id: str
    dest_type: str
    ss: str
    ssne: str
    source: str = "cache"

    def as_params(self) -> dict[str, str]:
        return {
            "destination": self.ssne or self.query,
            "ss": self.ss or self.ssne or self.query,
            "ssne": self.ssne or self.query,
            "dest_id": self.dest_id,
            "dest_type": self.dest_type,
        }


def _norm(text: str) -> str:
    return " ".join((text or "").lower().replace("é", "e").replace("è", "e").split())


def _load_cache() -> dict[str, dict[str, str]]:
    data = dict(SEED)
    if CACHE_PATH.is_file():
        try:
            raw = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raw = {}
        if isinstance(raw, dict):
            for key, val in raw.items():
                if isinstance(val, dict) and val.get("dest_id"):
                    data[_norm(str(key))] = {str(k): str(v) for k, v in val.items()}
    return data


def _save_cache(data: dict[str, dict[str, str]]) -> None:
    try:
        CACHE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass


def pick_hit(hits: list[dict[str, Any]], query: str) -> dict[str, Any] | None:
    usable = [
        h
        for h in hits
        if h.get("dest_id") is not None
        and str(h.get("dest_type") or "") not in {"", "hotel"}
    ]
    if not usable:
        return None
    q = _norm(query)
    fr_city = next(
        (
            h
            for h in usable
            if h.get("dest_type") == "city" and str(h.get("country_code") or "").lower() == "fr"
        ),
        None,
    )
    if fr_city:
        return fr_city
    named = next((h for h in usable if q in _norm(str(h.get("name") or h.get("label") or ""))), None)
    landmark = next((h for h in usable if h.get("dest_type") in {"landmark", "city", "region"}), None)
    return named or landmark or usable[0]


def _ingest_env_file(path: Path) -> None:
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        if key and val and key not in os.environ:
            os.environ[key] = val


def _omkar_key() -> str:
    _ingest_env_file(HERE / ".env")
    _ingest_env_file(HERE.parent.parent / ".env")
    return (
        os.environ.get("OMKAR_BOOKING_KEY")
        or os.environ.get("OMKAR_API_KEY")
        or os.environ.get("OMKAR_AIRBNB_KEY")
        or ""
    ).strip()


def _omkar_autocomplete(query: str, timeout_s: float = 12) -> list[dict[str, Any]]:
    key = _omkar_key()
    if not key:
        return []
    url = "https://booking-scraper.omkar.cloud/booking/hotels/autocomplete?" + urllib.parse.urlencode(
        {"query": query, "locale": "fr"}
    )
    req = urllib.request.Request(
        url, headers={"API-Key": key, "Accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as res:
            data = json.loads(res.read().decode("utf-8"))
    except (OSError, json.JSONDecodeError, TimeoutError):
        return []
    hits = data.get("results") if isinstance(data, dict) else None
    return hits if isinstance(hits, list) else []


def resolve_destination(query: str, *, refresh: bool = False) -> Destination | None:
    text = (query or "").strip()
    if not text:
        return None
    cache = _load_cache()
    hit = cache.get(_norm(text))
    if hit and not refresh:
        return Destination(
            query=text,
            dest_id=hit["dest_id"],
            dest_type=hit.get("dest_type") or "landmark",
            ss=hit.get("ss") or hit.get("label") or text,
            ssne=hit.get("ssne") or hit.get("name") or text,
            source="cache",
        )
    picked = pick_hit(_omkar_autocomplete(text), text)
    if not picked:
        return None
    dest = Destination(
        query=text,
        dest_id=str(picked["dest_id"]),
        dest_type=str(picked.get("dest_type") or "landmark"),
        ss=str(picked.get("label") or picked.get("name") or text),
        ssne=str(picked.get("name") or text),
        source="omkar",
    )
    cache[_norm(text)] = dest.as_params() | {"label": dest.ss}
    _save_cache(cache)
    return dest


def attach_destination(params: dict[str, Any]) -> dict[str, Any]:
    """Enrichit params avec dest_id. Ne remplace pas un dest_id déjà fourni."""
    out = dict(params)
    if out.get("dest_id") and out.get("dest_type"):
        return out
    query = str(out.get("destination") or out.get("city") or out.get("ss") or "").strip()
    dest = resolve_destination(query)
    if dest:
        for key, val in dest.as_params().items():
            out.setdefault(key, val)
        out["dest_id"] = dest.dest_id
        out["dest_type"] = dest.dest_type
        out["_destSource"] = dest.source
    return out
