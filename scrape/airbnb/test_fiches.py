"""Mode « fiches » (`pdp.run_fiches`) : une liste d'identifiants, arrêt au premier refus. Aucun réseau."""

from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import time
from pathlib import Path

import pdp
import session
import taux
import throttle
from throttle import RateLimited, RythmeLocal

IDS = ["32854505", "40601911", "40601929", "986024481050825680"]


def _occ(guests=4, bedrooms=1, dropped=False, room_type="Entire home/apt"):
    return {
        "guests": guests,
        "bedrooms": bedrooms,
        "rooms": None,
        "lat": 46.18,
        "lon": 6.70,
        "room_type": room_type,
        "type_logement": None,
        "hotel": False,
        "insolite": False,
        "dropped": dropped,
    }


@contextlib.contextmanager
def _isole(reponse):
    """Journal de taux, coupe-circuit et session à part ; `fetch_pdp` simulé ; aucun sommeil.

    `reponse(id, rang)` rend une occupation, None, ou une exception à lever.
    """
    anciens = (
        taux.TAUX_PATH,
        throttle.airbnb_circuit.path,
        session.SESSION_PATH,
        pdp.fetch_pdp,
        pdp._api_key,
        pdp._dormir,
        session.echeance,
    )
    dossier = Path(tempfile.mkdtemp())
    taux.TAUX_PATH = dossier / "taux.json"
    throttle.airbnb_circuit.path = dossier / "c"
    throttle.airbnb_circuit.consecutive = 0
    session.SESSION_PATH = dossier / "session.json"
    appels: list[str] = []

    def fetch(listing_id, **_kw):
        appels.append(listing_id)
        r = reponse(listing_id, len(appels))
        if isinstance(r, BaseException):
            raise r
        return r

    pdp.fetch_pdp = fetch
    pdp._api_key = lambda proxy_url="", fin=None: "cle"
    pdp._dormir = lambda s: None
    try:
        yield appels
    finally:
        (
            taux.TAUX_PATH,
            throttle.airbnb_circuit.path,
            session.SESSION_PATH,
            pdp.fetch_pdp,
            pdp._api_key,
            pdp._dormir,
            session.echeance,
        ) = anciens
        session._key = session._hash = ""


def _demande(ids=IDS, **extra):
    return {"mode": "fiches", "ids": list(ids), "checkIn": "2027-02-06", "checkOut": "2027-02-13", "adults": 2, **extra}


def test_les_fiches_lues_reviennent_par_identifiant():
    with _isole(lambda i, n: _occ(guests=n + 1)) as appels:
        out = pdp.run_fiches(_demande())
    assert appels == IDS
    assert list(out["fiches"]) == IDS
    assert out["fiches"][IDS[0]] == {
        "guests": 2,
        "bedrooms": 1,
        "rooms": None,
        "lat": 46.18,
        "lon": 6.70,
        "roomType": "Entire home/apt",
        "typeLogement": None,
        "ecartee": False,
    }
    assert out["lues"] == 4 and out["restants"] == [] and out["vides"] == []
    assert "arret" not in out and out["ok"] is True


def test_un_refus_arrete_net_sans_reprise():
    def reponse(i, n):
        return _occ() if n == 1 else RateLimited(429, 7)

    with _isole(reponse) as appels:
        out = pdp.run_fiches(_demande())
        pause = taux.pause_s("airbnb")
        ouvert = throttle.airbnb_circuit.open()
    assert appels == IDS[:2], "aucune fiche après le refus, et pas de reprise"
    assert out["arret"] == "refus" and out["erreurArret"] == "HTTP 429"
    assert list(out["fiches"]) == IDS[:1]
    assert out["restants"] == IDS[1:], "la fiche refusée reste à lire"
    assert out["lues"] == 2
    assert ouvert and pause >= 44, "pause partagée de 45 s au moins"


def test_un_403_est_un_refus_et_jette_cle_et_hash_mais_garde_les_cookies():
    with _isole(lambda i, n: RateLimited(403, 2)) as appels:
        maintenant = time.time()
        session.SESSION_PATH.write_text(
            json.dumps(
                {
                    "key": "cle",
                    "key_at": maintenant,
                    "hash": "hash",
                    "hash_at": maintenant,
                    "cookies": [{"name": "bev", "value": "1", "domain": ".airbnb.com", "path": "/"}],
                    "cookies_at": maintenant,
                }
            ),
            encoding="utf-8",
        )
        out = pdp.run_fiches(_demande())
        disque = json.loads(session.SESSION_PATH.read_text(encoding="utf-8"))
        ouvert = throttle.airbnb_circuit.open()
    assert appels == IDS[:1]
    assert out["arret"] == "refus" and out["erreurArret"] == "HTTP 403"
    assert ouvert
    assert "key" not in disque and "hash" not in disque and disque.get("cookies")


def test_le_limiteur_local_arrete_sans_ouvrir_le_coupe_circuit():
    with _isole(lambda i, n: RythmeLocal(429, 30)):
        out = pdp.run_fiches(_demande())
        ouvert = throttle.airbnb_circuit.open()
    assert out["arret"] == "rythme" and out["attenteS"] == 30
    assert out["lues"] == 0, "rien n'est parti"
    assert out["restants"] == IDS
    assert not ouvert


def test_un_coupe_circuit_deja_ouvert_ne_laisse_rien_partir():
    with _isole(lambda i, n: _occ()) as appels:
        throttle.airbnb_circuit.trip(60)
        out = pdp.run_fiches(_demande())
    assert appels == []
    assert out["arret"] == "coupe-circuit" and out["restants"] == IDS


def test_un_hash_perime_arrete_le_lot():
    with _isole(lambda i, n: pdp.HashPerime(pdp.PDP_HASH)) as appels:
        out = pdp.run_fiches(_demande())
    assert appels == IDS[:1]
    assert out["arret"] == "hash" and out["restants"] == IDS and out["lues"] == 1


def test_des_reponses_vides_de_suite_arretent_le_lot():
    ids = [str(10_000_000 + i) for i in range(6)]
    with _isole(lambda i, n: None) as appels:
        out = pdp.run_fiches(_demande(ids))
    assert len(appels) == pdp.VIDES_DE_SUITE_MAX
    assert out["arret"] == "illisible"
    assert out["vides"] == ids[: pdp.VIDES_DE_SUITE_MAX]
    assert out["restants"] == ids[pdp.VIDES_DE_SUITE_MAX :]


def test_une_annonce_ecartee_est_rendue_comme_telle():
    with _isole(lambda i, n: _occ(guests=None, bedrooms=None, dropped=True, room_type="Hotel room")):
        out = pdp.run_fiches(_demande(IDS[:1]))
    assert out["fiches"][IDS[0]]["ecartee"] is True
    assert out["fiches"][IDS[0]]["roomType"] == "Hotel room"


def test_l_echeance_trop_proche_ne_laisse_rien_partir():
    with _isole(lambda i, n: _occ()) as appels:
        out = pdp.run_fiches(_demande(deadlineMs=(time.time() + 1) * 1000))
    assert appels == []
    assert out["arret"] == "echeance" and out["restants"] == IDS


def test_les_identifiants_sont_filtres_et_bornes():
    brut = ["123", "12345", 12345, "abc", True, None, " 67890 "] + [str(10**6 + i) for i in range(100)]
    ids = pdp.ids_valides(brut)
    assert ids[:2] == ["12345", "67890"]
    assert len(ids) == pdp.MAX_IDS
    assert pdp.ids_valides("12345") == []


def test_la_pause_entre_deux_fiches_ne_descend_pas_sous_deux_secondes():
    assert pdp._pause_fiches(None) == pdp.PAUSE_FICHES_S
    assert pdp._pause_fiches(0.1) == pdp.PAUSE_FICHES_MIN_S
    assert pdp._pause_fiches(600) == pdp.PAUSE_FICHES_MAX_S
    assert pdp._pause_fiches(True) == pdp.PAUSE_FICHES_S


def _leve(fn, *args):
    try:
        fn(*args)
    except BaseException as err:  # noqa: BLE001
        return err
    return None


def test_lire_reponse_pdp_classe_refus_hash_et_echecs():
    err = _leve(pdp.lire_reponse_pdp, 429, {"Retry-After": "30"}, "")
    assert isinstance(err, RateLimited) and err.status == 429 and err.retry_after_s == 30
    err = _leve(pdp.lire_reponse_pdp, 403, {}, "{}")
    assert isinstance(err, RateLimited) and err.status == 403, "un 403 est un refus"
    err = _leve(pdp.lire_reponse_pdp, 200, {}, "<html><head><title>Access Denied</title></head></html>")
    assert isinstance(err, RateLimited), "une page de blocage est un refus"
    perime = json.dumps({"errors": [{"message": "PersistedQueryNotFound"}]})
    assert isinstance(_leve(pdp.lire_reponse_pdp, 200, {}, perime), pdp.HashPerime)
    assert isinstance(_leve(pdp.lire_reponse_pdp, 400, {}, perime), pdp.HashPerime)
    assert pdp.lire_reponse_pdp(200, {}, json.dumps({"errors": [{"message": "autre"}]})) is None
    assert pdp.lire_reponse_pdp(500, {}, "{}") is None
    assert pdp.lire_reponse_pdp(200, {}, "pas du json") is None
    fiche = {
        "data": {
            "merlin": {
                "pdpSections": {
                    "metadata": {
                        "loggingContext": {"eventDataLogging": {"personCapacity": 5, "roomType": "Entire home/apt"}}
                    }
                }
            }
        }
    }
    assert pdp.lire_reponse_pdp(200, {}, json.dumps(fiche))["guests"] == 5
    partielle = {**fiche, "errors": [{"message": "section indisponible"}]}
    assert pdp.lire_reponse_pdp(200, {}, json.dumps(partielle))["guests"] == 5, "une section en erreur n'efface pas la fiche"


def test_l_url_porte_l_operation_le_hash_et_l_identifiant():
    from urllib.parse import parse_qs, urlparse

    url = pdp.url_pdp("986024481050825680", check_in="2027-02-06", check_out="2027-02-13", adults=2)
    q = parse_qs(urlparse(url).query)
    assert urlparse(url).netloc == "www.airbnb.com", "le même hôte que la clé : les cookies partent"
    assert urlparse(url).path == "/api/v3/PdpPlatformSections"
    assert q["locale"] == ["fr"] and q["currency"] == ["EUR"]
    assert q["operationName"] == ["PdpPlatformSections"]
    assert json.loads(q["extensions"][0])["persistedQuery"]["sha256Hash"] == pdp.PDP_HASH
    demande = json.loads(q["variables"][0])["request"]
    assert demande["id"] == "986024481050825680" and demande["adults"] == "2"
    assert demande["checkIn"] == "2027-02-06"


def test_cli_aiguille_le_mode_fiches():
    import cli

    vus = []
    anciens = cli.run_fiches, cli.run_search
    cli.run_fiches = lambda p: vus.append(("fiches", p["ids"])) or {"ok": True, "mode": "fiches"}
    cli.run_search = lambda p: vus.append(("relevé", None)) or {"ok": True}
    entree, sortie = sys.stdin, sys.stdout
    brut = io.BytesIO()
    console = io.TextIOWrapper(brut, encoding="utf-8")
    try:
        sys.stdin = io.TextIOWrapper(io.BytesIO(json.dumps({"mode": "fiches", "ids": ["12345"]}).encode()), encoding="utf-8")
        sys.stdout = console
        code = cli.main()
        valeur = brut.getvalue()
    finally:
        sys.stdin, sys.stdout = entree, sortie
        cli.run_fiches, cli.run_search = anciens
    assert code == 0
    assert vus == [("fiches", ["12345"])]
    assert json.loads(valeur.decode("utf-8"))["mode"] == "fiches"


if __name__ == "__main__":
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            try:
                fn()
                print("ok", name)
            except Exception as err:
                failed += 1
                print("FAIL", name, err)
    raise SystemExit(failed)
