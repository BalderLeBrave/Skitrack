"""Le classement d'une réponse Booking. Aucun réseau."""

from search import classer_reponse


def test_un_refus_ne_se_reclasse_pas_en_defi():
    assert classer_reponse(429, "x" * 20_000) == "refus"
    assert classer_reponse(403, "x" * 20_000) == "refus"


def test_un_202_ou_une_coquille_est_un_defi():
    assert classer_reponse(202, "x" * 20_000) == "defi"
    assert classer_reponse(200, "court") == "defi"


def test_une_page_longue_en_200_se_lit():
    assert classer_reponse(200, "x" * 8_000) is None


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
