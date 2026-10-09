"""Emprises et compteur publié du relevé Airbnb. Aucun réseau."""

from __future__ import annotations

import io

from cli import emit
from stays import PLAFOND_EMPRISE, bounds_from_point, emprises, quadrants, result_count


def test_le_compteur_publie_est_lu_dans_le_panneau_de_filtres():
    raw = {"data": {"presentation": {"staysSearch": {"results": {"filters": {"filterPanel": {"resultCount": 273}}}}}}}
    assert result_count(raw) == 273
    assert result_count({"data": {}}) is None
    assert result_count({"data": {"presentation": {"staysSearch": {"results": {"filters": {"filterPanel": {"resultCount": True}}}}}}}) is None


def test_avec_coordonnees_l_emprise_proche_passe_avant_la_large():
    zones = emprises({"lat": 45.2979, "lon": 6.5799, "city": "Val Thorens"})
    assert [nom for nom, _ in zones] == ["proche", "large"]
    proche, large = zones[0][1]["bounds"], zones[1][1]["bounds"]
    assert proche["north"] - proche["south"] < large["north"] - large["south"]
    assert abs((proche["north"] + proche["south"]) / 2 - 45.2979) < 1e-9


def test_sur_un_grand_domaine_chaque_station_reliee_a_son_emprise_sans_la_large():
    relies = [{"lat": 45.4560, "lon": 6.6931}, {"lat": 45.5601, "lon": 6.7352}, {"lat": "x", "lon": 6}]
    zones = emprises({"lat": 45.5075, "lon": 6.6769, "city": "La Plagne", "relies": relies})
    assert [nom for nom, _ in zones] == ["proche", "reliee1", "reliee2"]
    champagny = zones[1][1]["bounds"]
    assert abs((champagny["north"] + champagny["south"]) / 2 - 45.4560) < 1e-9
    assert champagny["north"] - champagny["south"] < zones[0][1]["bounds"]["north"] - zones[0][1]["bounds"]["south"]


def test_la_proche_garde_la_moitie_du_budget_et_les_reliees_se_partagent_le_reste():
    from stays import pages_de_zone

    file = [("reliee1", {}), ("reliee2", {}), ("reliee3", {}), ("reliee4", {})]
    assert pages_de_zone("proche", file, 12, 24) == 6
    assert pages_de_zone("reliee1", file[1:], 6, 24) == 1
    assert pages_de_zone("reliee3", file[3:], 4, 24) == 2
    assert pages_de_zone("reliee4", [], 1, 24) == 1
    # Hors grand domaine, rien ne change.
    assert pages_de_zone("proche", [("large", {})], 12, 24) == 24
    assert pages_de_zone("quart1", [], 5, 24) == 24


def test_sans_coordonnees_une_seule_recherche_comme_avant():
    assert [nom for nom, _ in emprises({"city": "Val Thorens"})] == ["unique"]
    assert [nom for nom, _ in emprises({"url": "https://www.airbnb.fr/s/x/homes", "lat": 45, "lon": 6})] == ["unique"]


def test_les_quarts_couvrent_l_emprise_sans_la_deborder():
    b = bounds_from_point(45.0, 6.0, 6.0)
    qs = quadrants(b)
    assert len(qs) == 4
    assert min(q["south"] for q in qs) == b["south"] and max(q["north"] for q in qs) == b["north"]
    assert min(q["west"] for q in qs) == b["west"] and max(q["east"] for q in qs) == b["east"]
    assert PLAFOND_EMPRISE == 280


class _Console(io.TextIOWrapper):
    pass


def test_la_sortie_reste_du_json_utf8_sur_une_console_cp1252():
    brut = io.BytesIO()
    console = _Console(brut, encoding="cp1252")
    emit({"ok": True, "titre": "Studio 4\u202fpers. · Val Thorens"}, console)
    import json

    assert json.loads(brut.getvalue().decode("utf-8"))["titre"] == "Studio 4\u202fpers. · Val Thorens"


def test_une_reprise_qui_finirait_apres_l_echeance_n_est_pas_tentee():
    import time

    from throttle import Circuit, RateLimited, call_with_retry
    import tempfile
    from pathlib import Path

    gate = Circuit(Path(tempfile.mkdtemp()) / "circuit")
    appels = {"n": 0}

    def refus():
        appels["n"] += 1
        raise RateLimited(429, 10)

    # Le refus est noté dans le journal de taux : un journal à part, pour ne
    # pas bloquer les vrais relevés de la machine.
    import taux

    ancien = taux.TAUX_PATH
    taux.TAUX_PATH = Path(tempfile.mkdtemp()) / "taux.json"
    debut = time.time()
    try:
        call_with_retry(refus, circuit=gate, fin=time.time() + 5)
        raise AssertionError("le refus doit remonter")
    except RateLimited:
        pass
    finally:
        taux.TAUX_PATH = ancien
    assert appels["n"] == 1
    assert time.time() - debut < 1.0


def test_le_limiteur_local_n_ouvre_pas_le_coupe_circuit():
    import tempfile
    from pathlib import Path

    from throttle import Circuit, RythmeLocal, call_with_retry

    gate = Circuit(Path(tempfile.mkdtemp()) / "circuit")

    def trop_tot():
        raise RythmeLocal(429, 30)

    for _ in range(5):
        try:
            call_with_retry(trop_tot, circuit=gate, tries=1)
        except RythmeLocal:
            pass
    assert not gate.open()
    assert gate.consecutive == 0


def test_un_refus_dit_son_code_et_un_403_est_un_refus():
    import tempfile
    from pathlib import Path

    import taux
    import throttle
    from stays import classer_echec, erreur_arret

    assert erreur_arret("refus", 503) == "HTTP 503"
    assert erreur_arret("rythme").startswith("limiteur local")
    taux.TAUX_PATH = Path(tempfile.mkdtemp()) / "taux.json"
    throttle.airbnb_circuit.path = Path(tempfile.mkdtemp()) / "c"
    assert classer_echec(Exception("Not corret status code: ", 403, " response body: ", "{}"), "StaysSearch") == (
        "refus",
        403,
    )
    assert throttle.airbnb_circuit.open(), "un 403 ouvre la pause partagée"
    assert classer_echec(Exception("json illisible"), "StaysSearch") is None


def test_un_403_sur_la_premiere_emprise_jette_cle_et_hash_mais_garde_les_cookies():
    import json
    import tempfile
    import time
    from pathlib import Path

    import session
    import stays
    import taux
    import throttle

    taux.TAUX_PATH = Path(tempfile.mkdtemp()) / "taux.json"
    throttle.airbnb_circuit.path = Path(tempfile.mkdtemp()) / "c"
    ancien = session.SESSION_PATH
    session.SESSION_PATH = Path(tempfile.mkdtemp()) / "session.json"
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
    session._key = session._hash = ""
    anciens = stays.airbnb_search.get, stays.airbnb_search.url_to_raw_params

    def refuse(**kw):
        raise Exception("Not corret status code: ", 403, " response body: ", "{}")

    stays.airbnb_search.get = refuse
    stays.airbnb_search.url_to_raw_params = lambda url: []
    try:
        out = stays.run_search({"city": "Avoriaz", "lat": 46.19, "lon": 6.77, "skipEnrich": True})
    finally:
        stays.airbnb_search.get, stays.airbnb_search.url_to_raw_params = anciens
        disque = json.loads(session.SESSION_PATH.read_text(encoding="utf-8"))
        session.SESSION_PATH = ancien
        session._key = session._hash = ""
    assert out["error"] == "HTTP 403" and out["arret"] == "refus"
    assert "key" not in disque and "hash" not in disque, "clé et hash périmés jetés"
    assert disque.get("cookies"), "les cookies restent"


# --- Erreurs StaysSearch après la première page, hash périmé, clé et hash à froid ---


def _page(debut: int, n: int = 40, suivante: bool = True) -> dict:
    """Une page StaysSearch de `n` annonces (identifiants `debut`…), avec un curseur suivant."""
    import base64

    stays = [
        {
            "__typename": "StaySearchResult",
            "title": f"Appartement {i}",
            "subtitle": "4 voyageurs · 2 chambres",
            "demandStayListing": {
                "id": base64.b64encode(f"StayListing:{900000 + i}".encode()).decode(),
                "location": {"coordinate": {"latitude": 46.19, "longitude": 6.77}},
            },
            "structuredDisplayPrice": {"primaryLine": {"accessibilityLabel": f"{1000 + i} € au total"}},
        }
        for i in range(debut, debut + n)
    ]
    curseurs = {"nextPageCursor": f"c{debut + n}"} if suivante else {}
    resultats = {"searchResults": stays, "paginationInfo": curseurs}
    return {"data": {"presentation": {"staysSearch": {"results": resultats}}}}


def _relever(reponses: list, params: dict | None = None, age_hash: float = 0.0) -> tuple[dict, dict, int, bool]:
    """Un relevé hors réseau : clé et hash sur disque, réponses StaysSearch jouées
    dans l'ordre (une exception est levée). Rend la sortie, le disque, le nombre
    d'appels et l'état du coupe-circuit."""
    import json
    import tempfile
    import time
    from pathlib import Path

    import session
    import stays
    import taux
    import throttle

    taux.TAUX_PATH = Path(tempfile.mkdtemp()) / "taux.json"
    throttle.airbnb_circuit.path = Path(tempfile.mkdtemp()) / "c"
    ancien = session.SESSION_PATH
    session.SESSION_PATH = Path(tempfile.mkdtemp()) / "session.json"
    maintenant = time.time()
    session.SESSION_PATH.write_text(
        json.dumps({"key": "cle", "key_at": maintenant, "hash": "hash", "hash_at": maintenant - age_hash}),
        encoding="utf-8",
    )
    session._key = session._hash = ""
    file = list(reponses)
    appels = {"n": 0}

    def jouer(**kw):
        appels["n"] += 1
        r = file.pop(0)
        if isinstance(r, BaseException):
            raise r
        return r

    anciens = stays.airbnb_search.get, stays.airbnb_search.url_to_raw_params, stays.PAGE_PAUSE_S
    stays.airbnb_search.get = jouer
    stays.airbnb_search.url_to_raw_params = lambda url: []
    stays.PAGE_PAUSE_S = 0.0
    try:
        out = stays.run_search({"city": "Avoriaz", "lat": 46.19, "lon": 6.77, "skipEnrich": True, **(params or {})})
        ouvert = throttle.airbnb_circuit.open()
    finally:
        stays.airbnb_search.get, stays.airbnb_search.url_to_raw_params, stays.PAGE_PAUSE_S = anciens
        disque = json.loads(session.SESSION_PATH.read_text(encoding="utf-8")) if session.SESSION_PATH.exists() else {}
        session.SESSION_PATH = ancien
        session._key = session._hash = ""
    return out, disque, appels["n"], ouvert


def test_un_delai_a_la_page_4_garde_les_trois_pages_la_cle_et_le_hash():
    delai = Exception("Failed to perform, curl: (28) Operation timed out after 20001 milliseconds")
    out, disque, appels, ouvert = _relever([_page(0), _page(40), _page(80), delai])
    assert out["ok"] is True and out["count"] == 120, "avant : 0 annonce, puis repli HTML"
    assert "interrompue" in out["partiel"]
    assert appels == 4, "pas d'emprise suivante sur une panne qui dure"
    assert disque.get("key") == "cle" and disque.get("hash") == "hash", "clé et hash venaient de servir"
    assert not ouvert, "un délai n'est pas un refus"


def test_un_500_a_la_page_2_garde_la_page_1_et_jette_cle_et_hash():
    erreur = Exception("Not corret status code: ", 500, " response body: ", "{}")
    out, disque, appels, ouvert = _relever([_page(0), erreur])
    assert out["ok"] is True and out["count"] == 40
    assert "key" not in disque and "hash" not in disque
    assert appels == 2 and not ouvert


def test_un_403_a_la_page_2_garde_la_page_1_ouvre_la_pause_et_jette_cle_et_hash():
    refuse = Exception("Not corret status code: ", 403, " response body: ", "{}")
    out, disque, appels, ouvert = _relever([_page(0), refuse])
    assert out["ok"] is True and out["count"] == 40
    assert out["arret"] == "refus" and out.get("rateLimited") is True
    assert ouvert, "un 403 ouvre la pause partagée"
    assert "key" not in disque and "hash" not in disque
    assert appels == 2


def test_un_echec_a_la_premiere_page_remonte_comme_avant():
    delai = Exception("Failed to perform, curl: (28) Operation timed out")
    out, disque, appels, _ = _relever([delai])
    assert out["ok"] is False and appels == 1
    assert "key" not in disque, "comme avant : rien n'a prouvé la clé ni le hash"


def test_un_hash_perime_servi_en_200_est_jete_mais_pas_la_cle():
    perime = {"errors": [{"message": "PersistedQueryNotFound", "extensions": {"code": "PERSISTED_QUERY_NOT_FOUND"}}]}
    out, disque, appels, ouvert = _relever([perime, perime], age_hash=2 * 3600)
    assert out["ok"] is False and appels == 2 and not ouvert, "les deux emprises, comme avant"
    assert "hash" not in disque, "gardé, il servait 12 h de relevés vides"
    assert disque.get("key") == "cle", "la clé vient de servir : réponse 200"


def test_un_hash_relu_il_y_a_moins_d_une_heure_et_deja_perime_reste():
    # Le jeter à chaque relevé referait page d'accueil et paquets JS sans fin.
    perime = {"errors": [{"message": "PersistedQueryNotFound"}]}
    out, disque, _, _ = _relever([perime, perime], age_hash=600)
    assert out["ok"] is False
    assert disque.get("hash") == "hash" and disque.get("key") == "cle"


def test_une_page_avec_annonces_et_une_erreur_partielle_n_est_pas_un_hash_perime():
    page = _page(0, suivante=False)
    page["errors"] = [{"message": "PersistedQuery section en erreur"}]
    out, disque, _, _ = _relever([page], age_hash=2 * 3600)
    assert out["ok"] is True and out["count"] == 40
    assert disque.get("hash") == "hash"


def test_un_hash_perime_a_la_premiere_emprise_n_empeche_pas_les_suivantes():
    # Comme avant : les emprises suivantes partent avec le même hash ; s'il
    # rend des annonces, rien n'est jeté.
    perime = {"errors": [{"message": "PersistedQueryNotFound"}]}
    out, disque, appels, _ = _relever([perime, _page(0, suivante=False)], age_hash=2 * 3600)
    assert out["ok"] is True and out["count"] == 40 and appels == 2
    assert disque.get("hash") == "hash"


def test_une_erreur_sans_message_est_une_interruption():
    class Coupe(Exception):
        pass

    out, _, appels, _ = _relever([_page(0), Coupe()])
    assert out["ok"] is True and out["count"] == 40
    assert "Coupe" in out["partiel"] and appels == 2


def test_une_coupure_apres_les_en_tetes_garde_cle_et_hash():
    import types

    class Coupure(Exception):
        pass

    err = Coupure("Failed to perform, curl: (28) Operation timed out with 52341 out of 180000 bytes received")
    err.response = types.SimpleNamespace(status_code=200, headers={})
    out, disque, _, ouvert = _relever([_page(0), err])
    assert out["ok"] is True and out["count"] == 40
    assert disque.get("key") == "cle" and disque.get("hash") == "hash", "un 200 partiel n'est pas un échec HTTP"
    assert not ouvert


def test_a_froid_une_seule_page_d_accueil_pour_la_cle_et_le_hash():
    import pyairbnb.search as recherche

    paquet = "https://a0.muscache.com/airbnb/static/packages/web/fr/frontend/airmetro/browser/asyncRequire.abc.js"
    module = "fr/frontend/stays-search/routes/StaysSearchRoute/StaysSearchRoute.prepare.def.js"
    h = "a" * 64

    class Rep:
        def __init__(self, text):
            self.text = text

        def raise_for_status(self):
            pass

    vus: list[str] = []

    def faux_get(url, **kw):
        vus.append(url)
        if url == "https://www.airbnb.com/":
            return Rep(f'<script src="{paquet}"></script>')
        if url == paquet:
            return Rep(f'"{module}"')
        return Rep(f'name:"StaysSearch",operationId:"{h}"')

    ancien = recherche.requests.get
    recherche.requests.get = faux_get
    try:
        # La page d'accueil déjà lue pour la clé : pas redemandée.
        assert recherche.fetch_stays_search_hash(homepage_text=f'<script src="{paquet}"></script>') == h
        assert "https://www.airbnb.com/" not in vus and vus[0] == paquet
        # Sans paquet dedans (page de bascule, autre forme) : redemandée, comme avant.
        vus.clear()
        assert recherche.fetch_stays_search_hash(homepage_text="<html>bascule</html>") == h
        assert vus[0] == "https://www.airbnb.com/"
        vus.clear()
        assert recherche.fetch_stays_search_hash() == h
        assert vus[0] == "https://www.airbnb.com/"
    finally:
        recherche.requests.get = ancien


def test_get_with_body_rend_la_cle_et_la_page_d_accueil_meme_apres_une_bascule():
    import pyairbnb.api as api

    accueil = '<script>{"api_config":{"key":"d306zoyjsyarp7ifhu67rjxn52tv0t20"}}</script>'

    class Rep:
        def __init__(self, text):
            self.text = text

        def raise_for_status(self):
            pass

    anciens = api.requests.get, api.requests.post
    try:
        api.requests.get = lambda *a, **k: Rep(accueil)
        assert api.get_with_body("") == ("d306zoyjsyarp7ifhu67rjxn52tv0t20", accueil)
        assert api.get("") == "d306zoyjsyarp7ifhu67rjxn52tv0t20"
        bascule = '<form action="https://www.airbnb.fr/x"><input name="payload" value="p"></form>'
        api.requests.get = lambda *a, **k: Rep(bascule)
        api.requests.post = lambda *a, **k: Rep(accueil)
        assert api.get_with_body("") == ("d306zoyjsyarp7ifhu67rjxn52tv0t20", accueil)
    finally:
        api.requests.get, api.requests.post = anciens


def test_la_page_d_accueil_de_la_cle_passe_au_hash_une_fois_et_seulement_a_froid():
    import tempfile
    from pathlib import Path

    import session
    import stays
    import taux
    import throttle

    taux.TAUX_PATH = Path(tempfile.mkdtemp()) / "taux.json"
    throttle.airbnb_circuit.path = Path(tempfile.mkdtemp()) / "c"
    ancien = session.SESSION_PATH
    session.SESSION_PATH = Path(tempfile.mkdtemp()) / "session.json"
    session._key = session._hash = ""
    textes: list = []
    anciens = stays.airbnb_api.get_with_body, stays.airbnb_search.fetch_stays_search_hash
    stays.airbnb_api.get_with_body = lambda proxy_url, timeout=None: ("cle", "<accueil>")
    stays.airbnb_search.fetch_stays_search_hash = lambda proxy_url, timeout=None, homepage_text=None: (
        textes.append(homepage_text) or "h" * 64
    )
    try:
        fin = __import__("time").time() + 30
        assert stays._api_key("", fin) == "cle"
        assert stays._hash("", fin) == "h" * 64
        assert textes == ["<accueil>"]
        # Clé en cache, hash à relire : rien de partagé, la page se redemande.
        session._hash = ""
        session.invalidate()
        session._key = "cle"
        session._key_at = __import__("time").monotonic()
        assert stays._api_key("", fin) == "cle"
        stays._hash("", fin)
        assert textes == ["<accueil>", None]
    finally:
        stays.airbnb_api.get_with_body, stays.airbnb_search.fetch_stays_search_hash = anciens
        session.SESSION_PATH = ancien
        session._key = session._hash = ""


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
