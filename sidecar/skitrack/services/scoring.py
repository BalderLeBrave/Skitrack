"""Score de pertinence — et surtout son explication.

Principe : chaque critère est normalisé en [0, 1] *relativement au jeu de
résultats courant*, puis pondéré. La normalisation relative est un choix
délibéré : « 1 800 m de bas de pistes » n'a pas la même valeur dans une liste de
domaines pyrénéens que dans une liste savoyarde, et un score absolu écraserait
tout le classement pyrénéen vers zéro.

Le détail (`score_breakdown`) est renvoyé avec chaque résultat pour que l'UI
puisse répondre à « pourquoi celui-là est premier ? » sans recalcul.

En phase 1, seuls les critères disponibles au niveau du domaine sont utilisés
(altitude, taille, temps de trajet). Le prix par personne et la proximité des
pistes entrent en jeu en phase 2, sur le même mécanisme.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

DEFAULT_DOMAIN_WEIGHTS: dict[str, float] = {
    "altitude_min": 0.40,
    "altitude_max": 0.15,
    "slopes_km": 0.20,
    "travel_time": 0.25,
}


@dataclass
class Criterion:
    key: str
    value: float | None
    higher_is_better: bool


def _normalize(values: Sequence[float], higher_is_better: bool) -> list[float]:
    lo, hi = min(values), max(values)
    if hi - lo < 1e-9:
        # Tous égaux : aucun n'apporte d'information, on neutralise plutôt que de
        # renvoyer 1.0 partout, ce qui gonflerait artificiellement tous les scores.
        return [0.5] * len(values)
    span = hi - lo
    if higher_is_better:
        return [(v - lo) / span for v in values]
    return [(hi - v) / span for v in values]


def score_rows(
    rows: list[dict[str, float | None]],
    weights: dict[str, float] | None = None,
) -> list[tuple[float, dict[str, float]]]:
    """Score chaque ligne. `rows` = liste de dicts {critère: valeur|None}.

    Une valeur absente ne pénalise pas : son poids est retiré du dénominateur de
    cette ligne. Sinon, un domaine sans temps de trajet calculé (parce que hors
    du pré-filtre à vol d'oiseau) tomberait systématiquement en queue de liste
    pour une raison qui n'est pas la sienne.
    """
    weights = {k: v for k, v in (weights or DEFAULT_DOMAIN_WEIGHTS).items() if v > 0}
    if not rows or not weights:
        return [(0.0, {}) for _ in rows]

    higher_is_better = {
        "altitude_min": True,
        "altitude_max": True,
        "slopes_km": True,
        "travel_time": False,
        "price_per_person": False,
        "slope_proximity": False,
        "rating": True,
        "snowmaking": True,
    }

    normalized: dict[str, list[float | None]] = {}
    for key in weights:
        present = [(i, r.get(key)) for i, r in enumerate(rows) if r.get(key) is not None]
        column: list[float | None] = [None] * len(rows)
        if present:
            values = _normalize([v for _, v in present], higher_is_better.get(key, True))
            for (i, _), norm in zip(present, values, strict=True):
                column[i] = norm
        normalized[key] = column

    out: list[tuple[float, dict[str, float]]] = []
    for i in range(len(rows)):
        total = 0.0
        weight_sum = 0.0
        breakdown: dict[str, float] = {}
        for key, weight in weights.items():
            norm = normalized[key][i]
            if norm is None:
                continue
            contribution = norm * weight
            breakdown[key] = round(contribution, 4)
            total += contribution
            weight_sum += weight
        score = total / weight_sum if weight_sum else 0.0
        breakdown["_total"] = round(score, 4)
        breakdown["_weight_covered"] = round(weight_sum, 4)
        out.append((round(score, 4), breakdown))
    return out
