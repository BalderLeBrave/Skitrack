"""Pile de scraping (« v2 ») : les garde-fous qui manquaient.

Aucun réseau. Le seul connecteur exercé ici est CozyCozy, parce qu'il passe par
`httpx` et non par Playwright : on remplace sa méthode de transport et tout se
joue en mémoire. Les trois autres partagent la même forme de gestion d'échec,
vérifiée ici par lecture du code plutôt que par un navigateur qu'on ne lancera
pas dans une suite hermétique.

Ce que ces tests retiennent, et pourquoi :

- **Une source en panne relève.** Elle rendait une liste vide ; la route
  répondait alors `{"success": true, "count": 0}` et une panne devenait
  indiscernable d'un domaine sans logement. C'est l'invariant du projet.
- **Un prix illisible reste absent.** `normalize_price` rendait `0.0` — une
  valeur inventée présentée comme une mesure.
- **Aucune route n'est enregistrée deux fois.** Le routeur de scraping portait
  `prefix="/api"` et exposait `GET /providers`, chemin déjà servi par
  `settings.providers` pour l'écran « Sources ». Starlette retient le premier
  inscrit : celui-ci était masqué, et une inversion de l'ordre d'inclusion
  aurait servi la mauvaise forme de réponse à cet écran.
"""

from __future__ import annotations

import asyncio
from collections import Counter
from pathlib import Path

import httpx
import pytest

import skitrack
from skitrack.app import create_app
from skitrack.providers.base import BaseProvider, LodgingSearchParams
from skitrack.providers.registry import create_provider, list_providers

# Ancré sur le paquet, et non sur le répertoire courant : `pytest` peut être
# lancé depuis la racine comme depuis `sidecar/`.
PROVIDERS = Path(skitrack.__file__).parent / "providers"


class Sonde(BaseProvider):
    """Connecteur minimal : seul `normalize_price` nous intéresse."""

    async def scrape(self, params, respect_robots: bool = False):
        return []


def _routes_à_plat(app):
    """Aplatit les routeurs inclus.

    La version de FastAPI en place résout les inclusions paresseusement : les
    entrées de `app.routes` sont des `_IncludedRouter` sans `.path`. On passe
    par `original_router` et le préfixe d'inclusion pour retrouver les chemins
    réellement servis — `app.openapi()` ne suffirait pas, il fusionne les
    doublons et masquerait précisément ce qu'on cherche.
    """
    plat: list[tuple[str, list[str]]] = []
    for entrée in app.routes:
        if type(entrée).__name__ == "_IncludedRouter":
            préfixe = getattr(entrée.include_context, "prefix", "") or ""
            for route in entrée.original_router.routes:
                plat.append(
                    (préfixe + getattr(route, "path", ""), sorted(getattr(route, "methods", []) or []))
                )
        else:
            plat.append(
                (getattr(entrée, "path", ""), sorted(getattr(entrée, "methods", []) or []))
            )
    return plat


def test_aucune_route_enregistrée_deux_fois():
    app = create_app()
    app.openapi()

    compte: Counter = Counter()
    for chemin, méthodes in _routes_à_plat(app):
        for méthode in méthodes:
            compte[(méthode, chemin)] += 1

    doublons = [clé for clé, n in compte.items() if n > 1]
    assert not doublons, f"routes enregistrées plusieurs fois : {doublons}"


def test_les_deux_chemins_providers_coexistent():
    app = create_app()
    app.openapi()
    chemins = {chemin for chemin, _ in _routes_à_plat(app)}

    # L'écran « Sources » garde le sien…
    assert "/api/providers" in chemins
    # …et la pile de scraping a le sien, sous son propre préfixe.
    assert "/api/scrape/providers" in chemins
    assert "/api/scrape/{provider_name}" in chemins


def test_les_quatre_connecteurs_s_enregistrent():
    assert sorted(list_providers()) == ["airbnb", "booking", "cozycozy", "vrbo"]


@pytest.mark.parametrize(
    ("texte", "attendu"),
    [
        ("1 234,50 €", 1234.5),
        ("$99", 99.0),
        ("CHF 1200", 1200.0),
        ("à partir de", None),
        ("", None),
    ],
)
def test_prix_illisible_reste_absent(texte, attendu):
    assert Sonde().normalize_price(texte)[0] == attendu


def test_source_en_panne_relève_au_lieu_de_rendre_une_liste_vide(monkeypatch):
    """`asyncio.run` plutôt qu'un test `async` : la suite n'a pas de mode
    asynchrone configuré, et un marqueur non reconnu ferait passer le test en
    l'ignorant — le pire des résultats pour un garde-fou."""

    async def refuser(*args, **kwargs):
        raise httpx.ConnectError("port fermé (simulé)")

    monkeypatch.setattr(httpx.AsyncClient, "get", refuser)

    connecteur = create_provider("cozycozy")
    with pytest.raises(httpx.ConnectError):
        asyncio.run(connecteur.scrape(LodgingSearchParams(destination="Tignes")))


@pytest.mark.parametrize(
    "module",
    ["airbnb", "booking", "vrbo", "cozycozy"],
)
def test_chaque_connecteur_relève_quand_il_n_a_rien_relevé(module):
    """Les trois connecteurs Playwright ne sont pas lancés ici — on constate la
    forme du traitement d'échec, seule chose qu'un test hermétique peut voir."""
    source = (PROVIDERS / f"{module}.py").read_text(encoding="utf-8")

    assert "if not results:\n                raise" in source, (
        f"{module}: la panne totale ne relève pas"
    )


def test_cozycozy_n_utilise_ni_lxml_ni_l_attribut_proxies_mort():
    source = (PROVIDERS / "cozycozy.py").read_text(encoding="utf-8")
    code = "\n".join(
        ligne for ligne in source.split("\n") if not ligne.lstrip().startswith("#")
    )

    # `lxml` n'est pas déclaré dans requirements.txt : le réclamer comme parseur
    # ferait lever `FeatureNotFound` sur une installation propre.
    assert "'lxml'" not in code
    # httpx a retiré l'attribut `proxies` en 0.28 : l'affecter après
    # construction posait un attribut mort et toutes les requêtes partaient en
    # direct. Le proxy se passe au constructeur, au singulier.
    assert "client.proxies =" not in code
    assert "proxy=proxy," in code
