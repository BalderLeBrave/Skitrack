"""Fiche enrichie Airbnb (`fiche_pdp`, `pdp.lire_page_avis`, `pdp.run_fiches`). Aucun réseau."""

from __future__ import annotations

import json
from pathlib import Path

import pdp
from fiche_pdp import extraits_avis, fiche_enrichie_de_pdp
from test_fiches import _demande, _isole, _occ
from test_occupancy import PDP_REELLE
from throttle import RateLimited

FIXTURES = Path(__file__).parent / "fixtures"


def _pdp() -> dict:
    return json.loads((FIXTURES / "pdp_fiche_enrichie.json").read_text(encoding="utf-8"))


def _avis() -> list:
    return json.loads((FIXTURES / "avis_page.json").read_text(encoding="utf-8"))["reviews"]


def test_la_fiche_pdp_donne_description_equipements_reglement_et_note():
    f = fiche_enrichie_de_pdp(_pdp())
    assert f is not None
    assert f["description"] == (
        "Appartement rénové au pied des pistes.\n\nDeux chambres, balcon plein sud & vue sur le glacier."
    )
    assert [(e["libelle"], e["present"], e.get("groupe")) for e in f["equipements"]] == [
        ("Sèche-cheveux", True, "Salle de bain"),
        ("TV", True, "Divertissement"),
        ("Wifi", True, "Internet et bureau"),
        ("Parking gratuit sur place", True, "Parking et installations"),
        ("Ski-in/Ski-out", True, "Parking et installations"),
        ("Lave-linge", False, None),
        ("Climatisation", False, None),
    ]
    c = f["conditions"]
    assert c["arrivee"] == "Arrivée : 16:00 - 21:00"
    assert c["depart"] == "Départ avant 10:00"
    assert c["animaux"] == "non" and c["fetes"] == "non" and c["fumeurs"] == "non"
    assert "6 voyageurs maximum" in c["reglement"]
    assert c["annulation"] == "Politique d'annulation\nAnnulation gratuite avant le 7 janv. Remboursement partiel ensuite."
    assert "caution" not in c, "Airbnb ne la publie pas ici : rien d'inventé"
    assert f["avis"] == {"noteSource": 4.86, "echelleSource": 5, "nombre": 120, "extraits": []}


def test_la_meme_reponse_garde_capacite_chambres_gps_et_type():
    occ = pdp.lire_reponse_pdp(200, {}, json.dumps(_pdp()))
    assert occ is not None
    assert (occ["capacity"], occ["bedrooms"], occ["lat"], occ["lon"], occ["room_type"]) == (
        6,
        2,
        45.0123,
        6.1234,
        "Entire home/apt",
    )
    assert occ["enrichie"]["avis"]["nombre"] == 120
    fiche = pdp.fiche_de(occ)
    assert fiche["capacity"] == 6 and fiche["enrichie"]["description"].startswith("Appartement rénové")


def test_une_reponse_inattendue_donne_des_champs_vides_sans_exception():
    for brut in (None, [], "texte", {"data": {}}, {"data": {"merlin": {"pdpSections": {"sections": "?"}}}}):
        assert fiche_enrichie_de_pdp(brut) is None
    # Une section de la bonne sorte, mais vide : rien, pas de défaut.
    assert fiche_enrichie_de_pdp({"__typename": "PdpDescriptionSection", "htmlDescription": None}) is None
    # Une note hors de l'échelle d'Airbnb n'est pas gardée.
    f = fiche_enrichie_de_pdp({"eventDataLogging": {"guestSatisfactionOverall": 9.2, "visibleReviewCount": 3}})
    assert f["avis"] == {"noteSource": None, "echelleSource": 5, "nombre": 3, "extraits": []}


def test_la_reponse_reelle_sans_ces_blocs_reste_vide():
    # La fiche réelle réduite n'a ni description, ni équipements, ni règlement,
    # ni note d'avis : rien n'est tiré du titre de partage (« ★4,75 »).
    assert fiche_enrichie_de_pdp(PDP_REELLE) is None
    occ = pdp.lire_reponse_pdp(200, {}, json.dumps(PDP_REELLE))
    assert occ is not None and "enrichie" not in occ
    assert (occ["capacity"], occ["bedrooms"], occ["lat"], occ["lon"], occ["room_type"]) == (
        4,
        2,
        46.15005540000001,
        6.757117464418014,
        "Entire home/apt",
    )
    assert "enrichie" not in pdp.fiche_de(occ)


def test_la_forme_merlin_se_lit_aussi():
    p = _pdp()
    sections = p["data"]["presentation"]["stayProductDetailPage"]["sections"]
    f = fiche_enrichie_de_pdp({"data": {"merlin": {"pdpSections": sections}}})
    assert f is not None and f["description"] and len(f["equipements"]) == 7


def test_une_page_d_avis_donne_cinq_extraits_au_plus_prenom_seul():
    xs = extraits_avis(_avis())
    assert [x.get("auteur") for x in xs] == ["Marie", "Tom", "Léa", "Hors", "Paul"]
    assert xs[0] == {
        "texte": "Très bel appartement, skis aux pieds.\nMerci !",
        "auteur": "Marie",
        "date": "2026-03-02",
        "noteSource": 5.0,
    }
    assert xs[2]["date"] == "février 2026"
    assert "noteSource" not in xs[3], "une note hors de l'échelle 5 n'est pas gardée"
    assert extraits_avis({"oops": 1}) == [] and extraits_avis(None) == []


def _avec_fiche(nombre=120, extraits=None):
    occ = _occ()
    occ["enrichie"] = {
        "description": "x",
        "equipements": [],
        "conditions": None,
        "avis": {"noteSource": 4.86, "echelleSource": 5, "nombre": nombre, "extraits": list(extraits or [])},
    }
    return occ


def test_une_seule_page_d_avis_par_fiche_qui_en_annonce():
    appels: list[str] = []
    ancien = pdp.lire_page_avis

    def page(lid, **_kw):
        appels.append(lid)
        return extraits_avis(_avis())

    pdp.lire_page_avis = page
    try:
        with _isole(lambda i, n: _avec_fiche(nombre=0 if n == 2 else 120)):
            out = pdp.run_fiches(_demande(ids=["111111", "222222", "333333"], avis=True))
    finally:
        pdp.lire_page_avis = ancien
    assert appels == ["111111", "333333"], "pas d'appel pour une fiche sans avis, un seul par fiche"
    assert len(out["fiches"]["111111"]["enrichie"]["avis"]["extraits"]) == 5
    assert out["fiches"]["222222"]["enrichie"]["avis"]["extraits"] == []
    assert out["lues"] == 5


def test_avis_indisponibles_plus_aucun_appel_d_avis_dans_la_tranche():
    appels: list[str] = []
    ancien = pdp.lire_page_avis

    def page(lid, **_kw):
        appels.append(lid)
        raise pdp.AvisIndisponibles("hash rejeté")

    pdp.lire_page_avis = page
    try:
        with _isole(lambda i, n: _avec_fiche()):
            out = pdp.run_fiches(_demande(ids=["111111", "222222"], avis=True))
    finally:
        pdp.lire_page_avis = ancien
    assert appels == ["111111"], "pas de boucle sur un hash rejeté"
    assert list(out["fiches"]) == ["111111", "222222"] and out["ok"] is True
    assert out["fiches"]["111111"]["enrichie"]["avis"]["extraits"] == []


def test_un_refus_sur_les_avis_arrete_la_tranche_et_garde_la_fiche():
    ancien = pdp.lire_page_avis

    def page(lid, **_kw):
        raise RateLimited(429, 5)

    pdp.lire_page_avis = page
    try:
        with _isole(lambda i, n: _avec_fiche()) as appels:
            out = pdp.run_fiches(_demande(ids=["111111", "222222"], avis=True))
    finally:
        pdp.lire_page_avis = ancien
    assert appels == ["111111"]
    assert out["arret"] == "refus" and out["erreurArret"] == "HTTP 429"
    assert list(out["fiches"]) == ["111111"] and out["restants"] == ["222222"]
    assert out["fiches"]["111111"]["enrichie"]["avis"]["extraits"] == []


def test_lire_page_avis_une_seule_requete_offset_zero():
    import pyairbnb.reviews as reviews

    vus: list[tuple] = []
    ancien = reviews.get_from_offset

    def faux(api_key, offset, product_id, **kw):
        vus.append((api_key, offset, product_id, kw.get("currency"), kw.get("language")))
        return _avis()

    reviews.get_from_offset = faux
    try:
        xs = pdp.lire_page_avis("111111", api_key="cle")
    finally:
        reviews.get_from_offset = ancien
    assert vus == [("cle", 0, "111111", "EUR", "fr")]
    assert len(xs) == 5
    assert "dec1c8061483e78373602047450322fd474e79ba9afa8d3dbbc27f504030f91d" in reviews.ep


def test_lire_page_avis_classe_refus_et_reponse_illisible():
    import pyairbnb.reviews as reviews

    ancien = reviews.get_from_offset

    class Rep:
        status_code = 429
        headers: dict = {}

    class Err(Exception):
        response = Rep()

    try:
        reviews.get_from_offset = lambda *a, **k: (_ for _ in ()).throw(Err("HTTP 429"))
        try:
            pdp.lire_page_avis("1", api_key="cle")
            raise AssertionError("un 429 doit lever RateLimited")
        except RateLimited as err:
            assert err.status == 429
        reviews.get_from_offset = lambda *a, **k: {}
        try:
            pdp.lire_page_avis("1", api_key="cle")
            raise AssertionError("une réponse sans liste doit lever AvisIndisponibles")
        except pdp.AvisIndisponibles:
            pass
    finally:
        reviews.get_from_offset = ancien


def test_description_en_texte_plat_ou_dans_la_fenetre_description():
    plat = {"__typename": "PdpDescriptionSection", "htmlDescription": None, "description": "Studio cosy au centre."}
    assert fiche_enrichie_de_pdp(plat)["description"] == "Studio cosy au centre."
    fenetre = {
        "sections": [
            {
                "sectionComponentType": "LOCATION_DEFAULT",
                "section": {
                    "__typename": "GeneralListContentSection",
                    "items": [{"html": {"htmlText": "Le quartier."}}],
                },
            },
            {
                "sectionComponentType": "DESCRIPTION_MODAL",
                "section": {
                    "__typename": "GeneralListContentSection",
                    "items": [
                        {"title": "Le logement", "html": {"htmlText": "Deux chambres.<br/>Balcon."}},
                        {"title": "Vide", "html": {"htmlText": ""}},
                        {"title": "Accès des voyageurs", "html": {"htmlText": "Tout le logement."}},
                    ],
                },
            },
        ]
    }
    assert fiche_enrichie_de_pdp(fenetre)["description"] == (
        "Le logement\nDeux chambres.\nBalcon.\n\nAccès des voyageurs\nTout le logement."
    )


def test_l_apercu_des_equipements_seulement_sans_la_liste_entiere():
    apercu = {
        "__typename": "AmenitiesSection",
        "previewAmenitiesGroups": [
            {"title": "", "amenities": [{"title": "Wifi", "available": True}, {"title": "Cuisine"}]}
        ],
    }
    assert [(e["libelle"], e["present"], e.get("groupe")) for e in fiche_enrichie_de_pdp(apercu)["equipements"]] == [
        ("Wifi", True, None),
        ("Cuisine", True, None),
    ]
    p = _pdp()
    amen = p["data"]["presentation"]["stayProductDetailPage"]["sections"]["sections"][1]["section"]
    amen["previewAmenitiesGroups"] = [{"title": "", "amenities": [{"title": "Jacuzzi"}]}]
    assert "Jacuzzi" not in [e["libelle"] for e in fiche_enrichie_de_pdp(p)["equipements"]]


def test_annulation_en_section_a_part_et_apercu_du_reglement():
    brut = {
        "sections": [
            {
                "__typename": "PoliciesSection",
                "houseRules": [
                    {"title": "Arrivée autonome"},
                    {"title": "Arrivée après 16:00"},
                    {"title": "Départ avant 10 h"},
                    {"title": "Animaux acceptés"},
                ],
            },
            {
                "__typename": "CancellationPolicySection",
                "title": "Annulation gratuite pendant 48 heures",
                "subtitle": "Ensuite, remboursement partiel.",
                "policyId": "FLEXIBLE",
            },
        ]
    }
    c = fiche_enrichie_de_pdp(brut)["conditions"]
    assert c["arrivee"] == "Arrivée après 16:00", "la règle qui donne une heure"
    assert c["depart"] == "Départ avant 10 h"
    assert c["animaux"] == "oui"
    assert c["annulation"] == "Annulation gratuite pendant 48 heures\nEnsuite, remboursement partiel."
    # La section imbriquée dans PoliciesSection ne se lit pas deux fois.
    assert fiche_enrichie_de_pdp(_pdp())["conditions"]["annulation"].count("Annulation gratuite") == 1


def test_note_et_avis_depuis_la_section_d_avis_sans_requete():
    brut = {
        "__typename": "StayPdpReviewsSection",
        "summary": {"accessibilityLabel": "Noté 4,92 sur 5 · 48 avis"},
        "reviews": [
            {
                "comments": "Je mets 5 sur 5 !",
                "rating": 5,
                "createdAt": "2026-03-01T08:00:00Z",
                "reviewer": {"firstName": "Inès Martin"},
            }
        ],
    }
    f = fiche_enrichie_de_pdp(brut)
    assert f["avis"] == {
        "noteSource": 4.92,
        "echelleSource": 5,
        "nombre": 48,
        "extraits": [{"texte": "Je mets 5 sur 5 !", "auteur": "Inès", "date": "2026-03-01", "noteSource": 5.0}],
    }
    # Le texte d'un avis ne fait jamais la note : seuls les libellés comptent.
    sans_libelle = {"__typename": "StayPdpReviewsSection", "reviews": [{"comments": "5 sur 5, 12 avis !"}]}
    a = fiche_enrichie_de_pdp(sans_libelle)["avis"]
    assert (a["noteSource"], a["nombre"], len(a["extraits"])) == (None, None, 1)
    # Un libellé hors section d'avis ne compte pas.
    assert fiche_enrichie_de_pdp({"__typename": "PdpTitleSection", "accessibilityLabel": "4,9 sur 5 · 3 avis"}) is None


def test_une_page_d_avis_dans_son_enveloppe_ou_traduite():
    attendu = extraits_avis(_avis())
    assert extraits_avis({"reviews": _avis()}) == attendu
    graphql = {"data": {"presentation": {"stayProductDetailPage": {"reviews": {"reviews": _avis()}}}}}
    assert extraits_avis(graphql) == attendu
    traduit = {"comments": "", "localizedReview": {"comments": "Super séjour."}, "reviewer": {"smartName": "Bob"}}
    xs = extraits_avis([traduit])
    assert xs == [{"texte": "Super séjour.", "auteur": "Bob"}]


def test_les_avis_deja_dans_la_fiche_restent_si_la_page_ne_donne_rien():
    deja = [{"texte": "Déjà là."}]
    ancien = pdp.lire_page_avis
    for page in (lambda lid, **_kw: [], lambda lid, **_kw: (_ for _ in ()).throw(pdp.AvisIndisponibles("?"))):
        pdp.lire_page_avis = page
        try:
            with _isole(lambda i, n: _avec_fiche(extraits=deja)):
                out = pdp.run_fiches(_demande(ids=["111111"], avis=True))
        finally:
            pdp.lire_page_avis = ancien
        assert out["fiches"]["111111"]["enrichie"]["avis"]["extraits"] == deja


def test_par_defaut_aucune_page_d_avis():
    # Une requête de plus par fiche, et un refus qui viderait les relevés :
    # la page d'avis ne part que sur demande expresse (`avis: true`).
    appels: list[str] = []
    ancien = pdp.lire_page_avis

    def page(lid, **_kw):
        appels.append(lid)
        return extraits_avis(_avis())

    pdp.lire_page_avis = page
    try:
        for extra in ({}, {"avis": False}, {"avis": "oui"}):
            with _isole(lambda i, n: _avec_fiche(extraits=[{"texte": "Déjà là."}])) as fiches:
                out = pdp.run_fiches(_demande(ids=["111111", "222222"], **extra))
            assert fiches == ["111111", "222222"]
            assert out["lues"] == 2, "une requête par fiche, pas deux"
            assert out["fiches"]["111111"]["enrichie"]["avis"]["extraits"] == [{"texte": "Déjà là."}]
    finally:
        pdp.lire_page_avis = ancien
    assert appels == []
