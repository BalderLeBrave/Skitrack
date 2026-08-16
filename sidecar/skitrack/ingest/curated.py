"""Application de la couche curatée par-dessus les données importées.

Réappliquée après chaque import : c'est la garantie qu'un `npm run referential`
ne fait jamais reculer la qualité des données.
"""

from __future__ import annotations

import datetime as dt
import logging
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..config import CURATED_DIR
from ..models import SkiDomain

log = logging.getLogger(__name__)

#: Champs acceptés dans le YAML. Une clé inconnue est signalée, pas silencieusement
#: ignorée — une faute de frappe dans `altitude_vilage_m` doit se voir.
ALLOWED_FIELDS = {
    "name",
    "massif",
    "region",
    "altitude_min_m",
    "altitude_max_m",
    "altitude_village_m",
    "slopes_km_total",
    "lifts_count",
    "glacier",
    "snowmaking_pct",
    "north_facing_pct",
    "linked_pass_name",
    "season_open_typical",
    "season_close_typical",
    "official_website_url",
    "official_booking_url",
    "notes",
}


def _coerce(field: str, value: Any) -> Any:
    if field in ("season_open_typical", "season_close_typical") and isinstance(value, str):
        return dt.date.fromisoformat(value)
    return value


def _find_domain(session: Session, match: dict[str, Any]) -> SkiDomain | None:
    if not match:
        return None
    clauses = []
    if "source_id" in match:
        clauses.append(SkiDomain.source_id == str(match["source_id"]))
    if "slug" in match:
        clauses.append(SkiDomain.slug == str(match["slug"]))
    if "name" in match:
        clauses.append(SkiDomain.name == str(match["name"]))
    if not clauses:
        return None
    return session.execute(select(SkiDomain).where(or_(*clauses)).limit(1)).scalar_one_or_none()


def apply_curated(session: Session, *, directory: Path | None = None) -> dict[str, Any]:
    """Applique tous les fichiers `domains_*.yaml` du répertoire curated."""
    directory = directory or CURATED_DIR
    applied = 0
    unmatched: list[str] = []
    warnings: list[str] = []

    if not directory.exists():
        return {"applied": 0, "unmatched": [], "warnings": [f"Répertoire absent : {directory}"]}

    for path in sorted(directory.glob("domains_*.yaml")):
        with path.open(encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        for entry in data.get("domains") or []:
            match = entry.get("match") or {}
            domain = _find_domain(session, match)
            if domain is None:
                unmatched.append(f"{path.name}: {match}")
                continue
            touched = False
            for key, value in entry.items():
                if key == "match":
                    continue
                if key not in ALLOWED_FIELDS:
                    warnings.append(f"{path.name}: champ inconnu « {key} » ignoré")
                    continue
                setattr(domain, key, _coerce(key, value))
                touched = True
                if key == "altitude_village_m":
                    domain.altitude_village_source = "curated"
                if key == "snowmaking_pct":
                    domain.snowmaking_source = "curated"
                if key in ("altitude_min_m", "altitude_max_m"):
                    domain.altitude_source = "curated"
            if touched:
                domain.curated = True
                applied += 1

    session.commit()
    if unmatched:
        log.info("Curated : %d entrées sans domaine correspondant", len(unmatched))
    return {"applied": applied, "unmatched": unmatched, "warnings": warnings}
