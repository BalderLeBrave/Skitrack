"""Fiches Airbnb via PdpPlatformSections (stl-scraper). Isolé de Playwright.

ExploreSearch de STL est mort (400). La fiche PDP sert encore : capacité,
chambres, GPS, type de logement. Deux entrées :

- `enrich_listings`, au bout d'un relevé (`stays.run_search`), quand
  `skipEnrich` ne l'interdit pas. L'app le lui interdit : la part n'a que
  40 s, et il ne resterait de place que pour environ six fiches ;
- `run_fiches`, le mode « fiches » de `cli.py` : une liste d'identifiants,
  lue par tranches depuis la complétion de l'écran Prix
  (`lireFichesAirbnb`, src/lib/scrape/airbnb.server.ts).

Les appels partent l'un après l'autre, par le limiteur partagé avec Node
(`session._wrap` puis `taux.pace` : 18 par minute, 2 s d'écart). Un vrai
refus (429, 503, 403 ou page de blocage) passe par `throttle.refus` : la
ligne au journal, le coupe-circuit ouvert pour tout le Retry-After (45 s au
moins), et le lot s'arrête sans reprise, en gardant ce qui est lu. Une
attente de notre propre limiteur (`RythmeLocal`) ou le coupe-circuit déjà
ouvert (`CoupeCircuit`) arrêtent aussi le lot, sans rien ouvrir : rien n'est
parti. Un hash périmé arrête le lot : toutes les fiches suivantes
échoueraient de même.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from typing import Any, Callable
from urllib.parse import urlencode

from occupancy import merge_occupancy, occupancy_from_pdp
from throttle import (
    MARGE_REQUETE_S,
    PAUSE_MAX_S,
    CoupeCircuit,
    RateLimited,
    RythmeLocal,
    airbnb_circuit,
    http_status_of,
    is_rate_limited,
    refus,
    retry_after_from_exc,
    retry_after_s,
)

# Hash relevé dans stl-scraper (stl/endpoint/pdp.py). Toujours valide le
# 2026-09-25 (sonde : capacité, type, GPS et « 2 chambres » dans le titre de
# partage).
PDP_HASH = "625a4ba56ba72f8e8585d60078eb95ea0030428cac8772fde09de073da1bcdd0"
ORIGINE_PDP = "https://www.airbnb.com"
MAX_ENRICH = 40
PAUSE_S = 0.8
BUDGET_S = 22.0

# Mode « fiches ». Au plus tant d'identifiants par appel : une tranche.
MAX_IDS = 60
# L'échéance quand l'appelant n'en donne pas (`deadlineMs`).
ECHEANCE_FICHES_S = 45.0
# Entre deux fiches, avant l'écart de 2 s du limiteur : une douzaine de fiches
# par minute au plus, ce qui laisse, dans les 18 appels de la minute, de la
# place aux relevés StaysSearch des stations suivantes. Réglable, jamais
# sous 2 s.
PAUSE_FICHES_S = 4.0
PAUSE_FICHES_MIN_S = 2.0
PAUSE_FICHES_MAX_S = 30.0
# Tant de réponses de suite sans capacité : le format a changé, ou la clé ne
# sert plus. On arrête au lieu de dépenser la tranche.
VIDES_DE_SUITE_MAX = 4
ID_RE = re.compile(r"^\d{5,20}$")
# Une page de blocage en guise de JSON : même motif que `htmlEstBloque`
# (src/lib/stay/http429.ts).
BLOCAGE_RE = re.compile(r"<title>[^<]{0,120}(?:503|429|blocked|unavailable|captcha|access denied)", re.I)
HASH_PERIME_RE = re.compile(r"persisted\s*query|PERSISTED_QUERY", re.I)

# Le sommeil entre deux fiches. Les tests le remplacent.
_dormir: Callable[[float], None] = time.sleep


class HashPerime(Exception):
    """Airbnb ne connaît plus la requête persistée `PDP_HASH` : aucune fiche ne passera."""


def _api_key(proxy_url: str = "", fin: float | None = None) -> str:
    import pyairbnb.api as airbnb_api
    from session import cached
    from throttle import call_with_retry

    return cached(
        "key", lambda: call_with_retry(lambda: airbnb_api.get(proxy_url, timeout=20), fin=fin, etape="clé")
    )


def _jeter_cle() -> None:
    """Un 403 peut venir d'une clé périmée, gardée 12 h : clé et hash jetés,
    cookies gardés, comme `stays.run_search`. La page d'accueil ne sera relue
    qu'après la pause que ce refus vient d'ouvrir."""
    from session import invalidate

    invalidate()


def _incomplete(row: dict[str, Any]) -> bool:
    if row.get("guests") is None:
        return True
    if row.get("bedrooms") is None:
        return True
    if row.get("lat") is None or row.get("lon") is None:
        return True
    return False


def lire_reponse_pdp(status: int, headers: Any, text: str) -> dict[str, Any] | None:
    """Ce qu'une réponse PdpPlatformSections dit. Aucune requête.

    429, 503, 403 et une page de blocage lèvent `RateLimited` : c'est un
    refus, que l'appelant passe par `throttle.refus`. Un 403 en était exclu
    (la fiche restait vide et le lot continuait), contre le protocole. Une
    requête persistée inconnue lève `HashPerime`. Tout autre échec rend None.
    """
    if status in (429, 503, 403):
        raise RateLimited(status, retry_after_s(headers, cap=PAUSE_MAX_S))
    corps = (text or "").lstrip()
    if not corps.startswith("{") and BLOCAGE_RE.search(corps[:4000]):
        raise RateLimited(429, retry_after_s(headers, cap=PAUSE_MAX_S))
    try:
        raw: Any = json.loads(corps) if corps else None
    except ValueError:
        return None
    if isinstance(raw, dict) and raw.get("errors"):
        if HASH_PERIME_RE.search(json.dumps(raw.get("errors"))[:2000]):
            raise HashPerime(PDP_HASH)
        # Une section en erreur n'efface pas les autres : sans `data`, rien à lire.
        if not isinstance(raw.get("data"), dict):
            return None
    if status != 200 or not isinstance(raw, dict):
        return None
    return occupancy_from_pdp(raw)


def url_pdp(listing_id: str, *, check_in: str | None, check_out: str | None, adults: int | None) -> str:
    """L'URL de la fiche PDP d'une annonce. Aucune requête (la sonde la réutilise)."""
    variables = {
        "request": {
            "id": str(listing_id),
            "layouts": ["SIDEBAR", "SINGLE_COLUMN"],
            "adults": str(int(adults)) if adults else "1",
            "checkIn": check_in,
            "checkOut": check_out,
            "preview": False,
            "bypassTargetings": False,
            "privateBooking": False,
        }
    }
    query = {
        "operationName": "PdpPlatformSections",
        "locale": "fr",
        "currency": "EUR",
        "variables": json.dumps(variables, separators=(",", ":")),
        "extensions": json.dumps(
            {"persistedQuery": {"version": 1, "sha256Hash": PDP_HASH}},
            separators=(",", ":"),
        ),
    }
    # Le même hôte que la clé et StaysSearch (www.airbnb.com) : les cookies de
    # la session partagée, posés pour « .airbnb.com », partent avec la fiche.
    # Sur www.airbnb.fr, elle partait sans eux. La langue et la devise sont
    # dans la requête.
    return f"{ORIGINE_PDP}/api/v3/PdpPlatformSections?" + urlencode(query)


def entetes_pdp(api_key: str) -> dict[str, str]:
    return {
        "Accept": "application/json",
        "x-airbnb-api-key": api_key,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }


def fetch_pdp(
    listing_id: str,
    *,
    check_in: str | None,
    check_out: str | None,
    adults: int | None,
    api_key: str,
    proxy_url: str = "",
) -> dict[str, Any] | None:
    from curl_cffi import requests

    url = url_pdp(listing_id, check_in=check_in, check_out=check_out, adults=adults)
    proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None
    try:
        res = requests.get(
            url,
            headers=entetes_pdp(api_key),
            proxies=proxies,
            timeout=20,
            impersonate="chrome124",
        )
    except RateLimited:
        raise
    except Exception:
        return None
    try:
        text = res.text
    except Exception:
        text = ""
    return lire_reponse_pdp(res.status_code, res.headers, text)


def _fetch_pdp_polite(
    listing_id: str,
    *,
    check_in: str | None,
    check_out: str | None,
    adults: int | None,
    api_key: str,
    proxy_url: str,
    deadline: float,
) -> dict[str, Any] | None:
    """Une fiche. Un refus ouvre le coupe-circuit et n'est pas repris.

    `RythmeLocal` (notre file d'attente) et `CoupeCircuit` (pause d'un refus
    antérieur) remontent tels quels : rien n'est parti, l'appelant arrête le
    lot sans rien ouvrir de plus. `RythmeLocal` ouvrait le coupe-circuit, et le
    relevé suivant rendait « HTTP 429 » sans qu'Airbnb ait rien refusé.
    `HashPerime` remonte aussi : l'appelant arrête le lot.
    """
    del deadline  # Plus de reprise : l'échéance ne borne plus d'attente ici.
    try:
        occ = fetch_pdp(
            listing_id,
            check_in=check_in,
            check_out=check_out,
            adults=adults,
            api_key=api_key,
            proxy_url=proxy_url,
        )
        airbnb_circuit.hit_ok()
        return occ
    except (RythmeLocal, CoupeCircuit):
        raise
    except RateLimited as err:
        refus(err.status, min(PAUSE_MAX_S, max(0.2, err.retry_after_s)), "PDP")
        if err.status == 403:
            _jeter_cle()
        return None


def enrich_listings(
    listings: list[dict[str, Any]],
    *,
    check_in: str | None,
    check_out: str | None,
    adults: int | None,
    proxy_url: str = "",
    min_guests: int | None = None,
    max_n: int | None = None,
    budget_s: float = BUDGET_S,
    pause_s: float = PAUSE_S,
) -> tuple[list[dict[str, Any]], int]:
    """Complète guests / chambres / GPS. Rend (annonces, nb de fiches lues)."""
    if airbnb_circuit.open():
        return listings, 0
    cap = max_n if max_n is not None else MAX_ENRICH
    missing = [row for row in listings if _incomplete(row)][: max(0, cap)]
    if not missing:
        return listings, 0
    try:
        key = _api_key(proxy_url)
    except Exception:
        return listings, 0

    occ_by_id: dict[str, dict[str, Any]] = {}
    deadline = time.perf_counter() + max(1.0, budget_s)
    for i, row in enumerate(missing):
        if time.perf_counter() >= deadline:
            break
        if airbnb_circuit.open():
            break
        if i:
            rest = deadline - time.perf_counter()
            if rest <= pause_s:
                break
            time.sleep(pause_s)
        try:
            occ = _fetch_pdp_polite(
                row["id"],
                check_in=check_in,
                check_out=check_out,
                adults=adults,
                api_key=key,
                proxy_url=proxy_url,
                deadline=deadline,
            )
        except (RythmeLocal, CoupeCircuit):
            break
        except HashPerime:
            print("[airbnb] PdpPlatformSections : hash périmé — fiches arrêtées", file=sys.stderr)
            break
        if occ:
            occ_by_id[row["id"]] = occ

    out: list[dict[str, Any]] = []
    for row in listings:
        occ = occ_by_id.get(row["id"])
        merged = merge_occupancy(row, occ) if occ else dict(row)
        if merged is None:
            continue
        guests = merged.get("guests")
        if min_guests and isinstance(guests, int) and guests < min_guests:
            continue
        out.append(merged)
    return out, len(occ_by_id)


# --- Mode « fiches » -------------------------------------------------------


def ids_valides(brut: Any) -> list[str]:
    """Les identifiants demandés : des chiffres seulement, sans doublon, `MAX_IDS` au plus."""
    out: list[str] = []
    if not isinstance(brut, list):
        return out
    for x in brut:
        if isinstance(x, bool) or not isinstance(x, (str, int)):
            continue
        s = str(x).strip()
        if ID_RE.match(s) and s not in out:
            out.append(s)
        if len(out) >= MAX_IDS:
            break
    return out


def _pause_fiches(brut: Any) -> float:
    if isinstance(brut, bool) or not isinstance(brut, (int, float)):
        return PAUSE_FICHES_S
    return min(PAUSE_FICHES_MAX_S, max(PAUSE_FICHES_MIN_S, float(brut)))


def fiche_de(occ: dict[str, Any] | None) -> dict[str, Any] | None:
    """La fiche rendue à Node, ou None quand la réponse ne dit rien."""
    if not occ:
        return None
    fiche = {
        "guests": occ.get("guests"),
        "bedrooms": occ.get("bedrooms"),
        "rooms": occ.get("rooms"),
        "lat": occ.get("lat"),
        "lon": occ.get("lon"),
        "roomType": occ.get("room_type"),
        "typeLogement": occ.get("type_logement"),
        "ecartee": bool(occ.get("dropped")),
    }
    if fiche["ecartee"] or any(fiche[k] is not None for k in ("guests", "bedrooms", "rooms", "lat")):
        return fiche
    return None


def texte_arret(arret: str, statut: int = 429, attente: float = 0.0, detail: str = "") -> str:
    """Ce que Node rapporte. Seul un vrai refus dit « HTTP … », avec son code."""
    if arret == "refus":
        return f"HTTP {statut}"
    if arret == "coupe-circuit":
        return f"coupe-circuit Airbnb : pause après un refus (encore {airbnb_circuit.remaining_s():.0f} s)"
    if arret == "rythme":
        return f"limiteur local : {attente:.0f} s à attendre"
    if arret == "echeance":
        return "échéance de la tranche"
    if arret == "hash":
        return "requête PdpPlatformSections inconnue d'Airbnb (hash périmé)"
    if arret == "illisible":
        return f"{VIDES_DE_SUITE_MAX} fiches de suite sans capacité lue"
    return f"clé API illisible ({detail})" if detail else "clé API illisible"


def run_fiches(params: dict[str, Any]) -> dict[str, Any]:
    """Mode « fiches » : capacité, chambres, GPS et type pour une liste d'annonces.

    Entrée : `ids`, `checkIn`, `checkOut`, `adults`, `deadlineMs` (instant
    absolu), `pauseS`. Sortie : `fiches` ({id: {guests, bedrooms, rooms, lat,
    lon, roomType, typeLogement, ecartee}}), `vides` (lues sans rien d'utile),
    `restants` (non lues : à redemander), `lues` (requêtes parties), et, si le
    lot s'est arrêté, `arret` (refus, coupe-circuit, rythme, echeance, hash,
    illisible, cle) et `erreurArret`. Une fiche après l'autre ; au premier
    refus, plus rien, sans reprise.
    """
    import session
    from session import install_shared_http

    install_shared_http()
    debut = time.perf_counter()
    ids = ids_valides(params.get("ids"))
    check_in = params.get("checkIn") or params.get("checkin")
    check_out = params.get("checkOut") or params.get("checkout")
    brut_adultes = params.get("adults") or params.get("guests")
    adults = int(brut_adultes) if isinstance(brut_adultes, (int, float)) and not isinstance(brut_adultes, bool) else None
    brut_fin = params.get("deadlineMs")
    fin = (
        float(brut_fin) / 1000.0
        if isinstance(brut_fin, (int, float)) and not isinstance(brut_fin, bool) and brut_fin > 0
        else time.time() + ECHEANCE_FICHES_S
    )
    session.echeance = fin
    pause = _pause_fiches(params.get("pauseS"))
    proxy_url = str(
        params.get("proxy_url") or os.environ.get("SKITRACK_PROXY") or os.environ.get("HTTPS_PROXY") or ""
    ).strip()

    fiches: dict[str, dict[str, Any]] = {}
    vides: list[str] = []
    etat: dict[str, Any] = {"i": 0, "lues": 0, "arret": None, "statut": 429, "attente": 0.0, "detail": ""}

    def sortie() -> dict[str, Any]:
        arret = etat["arret"]
        out: dict[str, Any] = {
            "ok": arret is None,
            "mode": "fiches",
            "fiches": fiches,
            "vides": vides,
            "restants": ids[etat["i"] :],
            "lues": etat["lues"],
            "ms": int((time.perf_counter() - debut) * 1000),
        }
        if arret:
            out["arret"] = arret
            out["erreurArret"] = texte_arret(arret, etat["statut"], etat["attente"], etat["detail"])
            if arret == "rythme":
                out["attenteS"] = round(float(etat["attente"]), 1)
        fin_ligne = f" · arrêt : {out['erreurArret']}" if arret else ""
        print(f"[airbnb] fiches {len(fiches)}/{len(ids)} · {etat['lues']} lues{fin_ligne}", file=sys.stderr)
        return out

    if not ids:
        return sortie()
    if airbnb_circuit.open():
        etat["arret"] = "coupe-circuit"
        return sortie()
    try:
        key = _api_key(proxy_url, fin)
    except RythmeLocal as err:
        etat.update(arret="rythme", attente=err.retry_after_s)
        return sortie()
    except CoupeCircuit:
        etat["arret"] = "coupe-circuit"
        return sortie()
    except RateLimited as err:
        # `call_with_retry` a déjà écrit le refus et ouvert la pause.
        etat.update(arret="refus", statut=err.status)
        return sortie()
    except Exception as err:
        code = http_status_of(err)
        if code == 403 or is_rate_limited(err):
            refus(code or 429, retry_after_from_exc(err, cap=PAUSE_MAX_S), "clé")
            etat.update(arret="refus", statut=code or 429)
        else:
            etat.update(arret="cle", detail=str(err)[:200])
        return sortie()
    if not key:
        etat.update(arret="cle", detail="vide")
        return sortie()

    vides_de_suite = 0
    while etat["i"] < len(ids):
        if etat["i"] and fin - time.time() - pause < MARGE_REQUETE_S:
            etat["arret"] = "echeance"
            break
        if etat["i"]:
            _dormir(pause)
        if fin - time.time() < MARGE_REQUETE_S:
            etat["arret"] = "echeance"
            break
        if airbnb_circuit.open():
            etat["arret"] = "coupe-circuit"
            break
        lid = ids[etat["i"]]
        try:
            occ = fetch_pdp(
                lid, check_in=check_in, check_out=check_out, adults=adults, api_key=key, proxy_url=proxy_url
            )
        except RythmeLocal as err:
            etat.update(arret="rythme", attente=err.retry_after_s)
            break
        except CoupeCircuit:
            etat["arret"] = "coupe-circuit"
            break
        except HashPerime:
            etat["lues"] += 1
            etat["arret"] = "hash"
            break
        except RateLimited as err:
            etat["lues"] += 1
            refus(err.status, min(PAUSE_MAX_S, max(0.2, err.retry_after_s)), "fiche PDP")
            if err.status == 403:
                _jeter_cle()
            etat.update(arret="refus", statut=err.status)
            break
        etat["lues"] += 1
        etat["i"] += 1
        airbnb_circuit.hit_ok()
        fiche = fiche_de(occ)
        if fiche:
            fiches[lid] = fiche
        else:
            vides.append(lid)
        if fiche and (fiche["guests"] is not None or fiche["ecartee"]):
            vides_de_suite = 0
        else:
            vides_de_suite += 1
            if vides_de_suite >= VIDES_DE_SUITE_MAX:
                etat["arret"] = "illisible"
                break
    return sortie()
