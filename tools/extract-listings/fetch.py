"""Recuperation d'une fiche, et conservation de tout ce qui a servi.

Deux idees tiennent ce module.

**On garde les preuves.** Chaque fiche laisse derriere elle son HTML, sa capture
d'ecran, ses blobs JSON et les reponses reseau interessantes. C'est ce qui rend
un echec reproductible : quand un chemin JSON disparait, on relit le dump plutot
que de relancer une session et d'esperer retomber sur le meme cas.

**On s'arrete au premier refus.** Un 403, un 429, un captcha ou une coquille
vide anti-robot terminent la fiche sur `blocked`. Aucune rotation d'identite,
aucune nouvelle tentative deguisee : ce que le site refuse une fois, il le
refuse. Les seules reprises admises visent les pannes (5xx, delai de
navigation), deux fois au plus.

Le rythme est volontairement lent — 8 a 15 secondes entre deux fiches, tire au
hasard. Une liste de cent logements prend vingt minutes ; c'est le prix d'une
collecte qui ne pese sur personne.
"""

from __future__ import annotations

import json
import random
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from playwright.sync_api import Page, TimeoutError as PwTimeout, sync_playwright

import robots

#: Fenetre d'attente entre deux fiches, en secondes.
DELAI_MIN_S = 8.0
DELAI_MAX_S = 15.0

#: Delai de navigation. Genereux : ces pages chargent lentement, et un delai
#: court produirait des `blocked` qui n'en sont pas.
NAV_TIMEOUT_MS = 45_000

#: Mots qui, dans une URL de reponse reseau, signalent une charge utile digne
#: d'etre conservee. Volontairement large en reconnaissance : c'est en relisant
#: ces reponses qu'on trouve les chemins, pas en les devinant.
MOTS_RESEAU = (
    "listing",
    "pdp",
    "niobe",
    "stays",
    "hotel",
    "property",
    "atlas",
    "capacity",
    "occupancy",
    "personcapacity",
    "graphql",
)

#: Marqueurs de challenge, cherches dans le HTML rendu, en minuscules.
#:
#: Volontairement **specifiques**. Une premiere version cherchait le mot
#: « captcha » n'importe ou : sur une fiche Airbnb servie normalement — HTTP
#: 200, 942 Ko, titre reel — le mot apparaissait une fois dans un bundle
#: JavaScript, et toute la plate-forme etait declaree bloquee. Un detecteur qui
#: crie au loup coute plus cher que pas de detecteur : il fait renoncer a une
#: page qui repondait.
SIGNES_BLOCAGE = (
    "px-captcha",
    "are you a human",
    "verifying you are human",
    "please verify you are a human",
    "unusual traffic from your computer",
    "request blocked",
    "attention required! | cloudflare",
)

#: Taille en deca de laquelle une reponse n'est pas une fiche. Une fiche reelle
#: pese des centaines de kilo-octets ; une page de challenge, quelques milliers.
TAILLE_MIN_FICHE = 20_000


@dataclass
class Artefacts:
    """Ce qu'une visite a produit, dump compris."""

    url: str
    http_status: int | None = None
    html: str = ""
    #: Blobs JSON trouves dans la page : `<script type=application/json>`,
    #: `application/ld+json`, et les gros objets assignes en JS.
    blobs: list[dict[str, Any]] = field(default_factory=list)
    #: Reponses reseau retenues, corps compris quand il est du JSON.
    reseau: list[dict[str, Any]] = field(default_factory=list)
    bloque: bool = False
    #: Rempli quand la visite a echoue : sert de `reason_code` en aval.
    echec: str | None = None
    #: Pourquoi le blocage a ete conclu. Sans lui, un faux positif est
    #: indiscernable d'un vrai mur — c'est arrive, voir `SIGNES_BLOCAGE`.
    motif_blocage: str | None = None
    dossier: Path | None = None


def _lire_blobs(page: Page) -> list[dict[str, Any]]:
    """Extrait les objets JSON de la page.

    Trois familles, dans l'ordre ou elles se sont revelees utiles :
    les `<script type="application/json">` (Airbnb y met tout son PDP), les
    `application/ld+json` (Booking y met `geo`), et les affectations JS du genre
    `window.__X = {...}` que Booking utilise encore par endroits.
    """
    brut = page.evaluate(
        """() => {
      const out = []
      for (const s of document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"], script[data-capla-store-data]')) {
        const t = (s.textContent || '').trim()
        if (t.length > 2) {
          out.push({
            id: s.id || s.getAttribute('data-capla-store-data') || s.type || 'script',
            type: s.type || 'inline',
            texte: t
          })
        }
      }
      // Affectations JS massives : on ne garde que le corps de l'objet.
      for (const s of document.querySelectorAll('script:not([src])')) {
        const t = s.textContent || ''
        if (t.length < 2000) continue
        const m = t.match(/(?:window|self)\\.(__[A-Za-z0-9_]+)\\s*=\\s*(\\{[\\s\\S]*?\\});?\\s*$/)
        if (m) out.push({ id: m[1], type: 'assignation', texte: m[2] })
      }
      return out
    }"""
    )
    blobs: list[dict[str, Any]] = []
    for b in brut:
        try:
            blobs.append({"id": b["id"], "type": b["type"], "data": json.loads(b["texte"])})
        except Exception:
            # Un blob illisible est conserve en texte : il peut contenir la
            # valeur cherchee sous une forme que `json` refuse (JS, pas JSON).
            blobs.append({"id": b["id"], "type": b["type"], "texte_brut": b["texte"][:200_000]})
    return blobs


def _accepter_bandeau(page: Page) -> None:
    """Ecarte la banniere de consentement quand elle bloque le rendu.

    Le choix est le **refus** quand un bouton de refus existe : on ne consent
    pas a un pistage au nom de l'utilisateur pour lire une page publique. Le
    bouton d'acceptation ne sert que de dernier recours, quand la page reste
    inutilisable autrement.
    """
    for selecteur in (
        '#onetrust-reject-all-handler',
        'button[aria-label*="Refuser"]',
        'button[aria-label*="Reject"]',
        '[data-testid="reject-all"]',
        '#onetrust-accept-btn-handler',
        'button[aria-label*="Accepter"]',
        '[data-testid="accept-cookies"]',
    ):
        try:
            el = page.query_selector(selecteur)
            if el and el.is_visible():
                el.click(timeout=3_000)
                page.wait_for_timeout(700)
                return
        except Exception:
            continue


def _semble_bloque(html: str, statut: int | None) -> tuple[bool, str | None]:
    """La reponse est-elle un mur plutot qu'une fiche ?

    Trois criteres, du plus sur au moins sur, et chacun rend son motif pour que
    le diagnostic dise *pourquoi* il a conclu au blocage.

    Le troisieme critere n'est evalue que sur une page **courte** : c'est ce qui
    evite de confondre une mention de « captcha » perdue dans un bundle de
    900 Ko avec une page de challenge de 3 Ko qui ne contient que cela.
    """
    if statut in (403, 429):
        return True, f"HTTP {statut}"
    if len(html) < TAILLE_MIN_FICHE:
        bas = html.lower()
        marqueur = next((s for s in SIGNES_BLOCAGE if s in bas), None)
        if marqueur:
            return True, f"page de {len(html)} octets contenant « {marqueur} »"
        return True, f"page de {len(html)} octets — trop courte pour une fiche"
    return False, None


def recuperer(
    url: str,
    dossier_diag: Path,
    *,
    headless: bool = True,
    garder_reseau: bool = True,
) -> Artefacts:
    """Ouvre une fiche et rapporte tout ce qui a servi.

    `robots.txt` n'est plus un veto interne : on enregistre le verdict pour
    le diagnostic, puis on ouvre la fiche.
    """
    art = Artefacts(url=url, dossier=dossier_diag)

    verdict = robots.autorise(url)
    dossier_diag.mkdir(parents=True, exist_ok=True)
    (dossier_diag / "robots.txt.verdict").write_text(
        f"{url}\nrobots.txt ignore comme veto interne — autorise={verdict.autorise} "
        f"regle={verdict.regle} indisponible={verdict.indisponible}\n",
        encoding="utf-8",
    )

    reponses: list[dict[str, Any]] = []

    with sync_playwright() as p:
        navigateur = p.chromium.launch(headless=headless)
        contexte = navigateur.new_context(
            locale="fr-FR",
            timezone_id="Europe/Paris",
            viewport={"width": 1440, "height": 900},
            user_agent=robots.USER_AGENT,
        )
        page = contexte.new_page()

        if garder_reseau:

            def _sur_reponse(rep):  # type: ignore[no-untyped-def]
                u = rep.url.lower()
                if not any(m in u for m in MOTS_RESEAU):
                    return
                entree: dict[str, Any] = {"url": rep.url, "status": rep.status}
                try:
                    ct = (rep.header_value("content-type") or "").lower()
                    if "json" in ct:
                        entree["json"] = rep.json()
                except Exception:
                    pass
                reponses.append(entree)

            page.on("response", _sur_reponse)

        statut: int | None = None
        try:
            rep = page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
            statut = rep.status if rep else None
            _accepter_bandeau(page)
            # L'hydratation ecrit les blobs apres le DOM initial : sans cette
            # pause, une fiche sur deux revient sans sa charge utile.
            page.wait_for_timeout(3_500)
            try:
                page.wait_for_load_state("networkidle", timeout=8_000)
            except PwTimeout:
                pass
            # La carte est souvent montee au scroll ; on descend une fois.
            page.evaluate("() => window.scrollBy(0, 2500)")
            page.wait_for_timeout(2_000)

            art.html = page.content()
            art.http_status = statut
            art.bloque, motif = _semble_bloque(art.html, statut)
            if art.bloque:
                art.echec = "BOT_CHALLENGE"
                art.motif_blocage = motif
            else:
                art.blobs = _lire_blobs(page)

            page.screenshot(path=str(dossier_diag / "screenshot.png"), full_page=False)
        except PwTimeout:
            art.echec = "NAVIGATION_FAILED"
        except Exception as e:  # noqa: BLE001 — on veut le message, quel qu'il soit
            art.echec = f"NAVIGATION_FAILED: {type(e).__name__}"
        finally:
            art.reseau = reponses
            contexte.close()
            navigateur.close()

    # Les dumps sont ecrits meme en cas d'echec : c'est precisement la qu'ils
    # servent.
    (dossier_diag / "page.html").write_text(art.html, encoding="utf-8")
    (dossier_diag / "blobs.json").write_text(
        json.dumps(art.blobs, ensure_ascii=False, indent=1)[:20_000_000], encoding="utf-8"
    )
    (dossier_diag / "network.json").write_text(
        json.dumps(art.reseau, ensure_ascii=False, indent=1)[:20_000_000], encoding="utf-8"
    )
    return art


def patienter() -> None:
    """Attente entre deux fiches, tiree au hasard dans la fenetre."""
    time.sleep(random.uniform(DELAI_MIN_S, DELAI_MAX_S))


def html_depuis_fichier(chemin: Path, url: str) -> Artefacts:
    """Mode hors ligne : le HTML vient d'un fichier fourni par l'utilisateur.

    C'est le recours quand le site refuse la visite automatisee. L'utilisateur
    ouvre la fiche dans son navigateur, enregistre la page, et l'outil en tire
    exactement ce qu'il aurait tire d'une visite — sans emettre une requete.
    """
    html = chemin.read_text(encoding="utf-8", errors="replace")
    art = Artefacts(url=url, html=html, http_status=None)
    art.blobs = blobs_depuis_html(html)
    return art


def har_depuis_fichier(chemin: Path, url: str) -> Artefacts:
    """Mode hors ligne : les charges utiles viennent d'un HAR.

    C'est le seul recours qui marche pour **Airbnb**, dont la fiche ne porte
    plus ses donnees dans le DOM : mesure du 2026-08-30, aucun
    `<script type="application/json">` exploitable, et tout arrive par
    `/api/v3/StaysPdpSections`. Un HTML enregistre a la main ne contient donc
    pas la capacite ; un HAR, si — il garde les reponses reseau.

    L'utilisateur produit le fichier depuis les outils de developpement de son
    navigateur, onglet Reseau, « Enregistrer tout dans un HAR ».
    """
    art = Artefacts(url=url)
    try:
        har = json.loads(chemin.read_text(encoding="utf-8", errors="replace"))
    except Exception as e:  # noqa: BLE001
        art.echec = f"HAR_ILLISIBLE: {type(e).__name__}"
        return art

    entrees = (har.get("log") or {}).get("entries") or []
    for e in entrees:
        req_url = ((e.get("request") or {}).get("url")) or ""
        rep = e.get("response") or {}
        contenu = rep.get("content") or {}
        texte = contenu.get("text")
        mime = (contenu.get("mimeType") or "").lower()

        # Le document principal fournit le HTML.
        if not art.html and "text/html" in mime and isinstance(texte, str) and len(texte) > 5_000:
            art.html = texte
            art.http_status = rep.get("status")

        if not isinstance(texte, str) or "json" not in mime:
            continue
        if not any(m in req_url.lower() for m in MOTS_RESEAU):
            continue
        try:
            art.reseau.append({"url": req_url, "status": rep.get("status"), "json": json.loads(texte)})
        except Exception:
            continue

    if art.html:
        art.blobs = blobs_depuis_html(art.html)
    if not art.reseau and not art.blobs:
        art.echec = "HAR_SANS_CHARGE_UTILE"
    return art


def blobs_depuis_html(html: str) -> list[dict[str, Any]]:
    """Meme lecture que `_lire_blobs`, sans navigateur.

    Le HTML fourni a la main n'est pas hydrate par un moteur : on retombe sur
    une extraction textuelle des memes balises. Les objets qui n'existent que
    dans la memoire du navigateur sont hors de portee, et c'est dit dans
    `REPORT.md` plutot que masque.
    """
    blobs: list[dict[str, Any]] = []
    motif = re.compile(
        r'<script[^>]*type="application/(?:ld\+)?json"[^>]*>(.*?)</script>',
        re.S | re.I,
    )
    for i, m in enumerate(motif.finditer(html)):
        texte = m.group(1).strip()
        try:
            blobs.append({"id": f"script[{i}]", "type": "application/json", "data": json.loads(texte)})
        except Exception:
            blobs.append({"id": f"script[{i}]", "type": "application/json", "texte_brut": texte[:200_000]})
    for m in re.finditer(r'<script[^>]*data-capla-store-data="([^"]+)"[^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            blobs.append({"id": m.group(1), "type": "capla", "data": json.loads(m.group(2))})
        except Exception:
            pass
    return blobs
