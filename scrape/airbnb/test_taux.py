"""Journal de taux partagé : créneaux réservés sous verrou. Aucun réseau."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import taux

ICI = Path(__file__).resolve().parent


def _journal() -> Path:
    chemin = Path(tempfile.mkdtemp()) / "taux.json"
    taux.TAUX_PATH = chemin
    return chemin


def test_deux_reservations_de_suite_prennent_deux_creneaux():
    _journal()
    a, ok_a = taux.reserver("airbnb", sleep_cap=10)
    b, ok_b = taux.reserver("airbnb", sleep_cap=10)
    assert ok_a and ok_b
    assert a < 0.1
    assert 1.9 < b <= 2.1, "le second part 2 s après le premier, sans l'avoir attendu"


def test_au_dela_du_plafond_de_sommeil_rien_n_est_reserve():
    _journal()
    taux.reserver("airbnb", sleep_cap=10)
    wait, ok = taux.reserver("airbnb", sleep_cap=0.5)
    assert not ok and wait > 1.5
    # Rien d'écrit : le créneau suivant est toujours à 2 s, pas à 4.
    wait2, ok2 = taux.reserver("airbnb", sleep_cap=10)
    assert ok2 and wait2 < 2.1


def test_un_blocage_n_est_jamais_raccourci():
    _journal()
    taux.noter_blocage("airbnb", 300)
    taux.noter_blocage("airbnb", 1)
    assert taux.attente_s("airbnb") > 290


def test_un_verrou_abandonne_est_repris():
    _journal()
    verrou = taux._verrou_path()
    verrou.parent.mkdir(parents=True, exist_ok=True)
    verrou.write_text("", encoding="utf-8")
    vieux = time.time() - 60
    os.utime(verrou, (vieux, vieux))
    debut = time.time()
    _, ok = taux.reserver("airbnb", sleep_cap=10)
    assert ok
    assert time.time() - debut < 0.4
    assert not verrou.exists()


def test_plusieurs_processus_ne_perdent_aucun_creneau():
    """Six processus réservent en même temps : chaque appel est compté, à 2 s d'écart.

    L'ancien « regarder, dormir, noter » perdait des appels (écriture croisée
    du journal) et laissait partir deux processus au même instant.
    """
    chemin = _journal()
    code = (
        "import sys, taux, time;"
        "from pathlib import Path;"
        f"taux.TAUX_PATH = Path(r'{chemin}');"
        "t = float(sys.argv[1]);"
        "time.sleep(max(0.0, t - time.time()));"
        "[taux.reserver('airbnb', sleep_cap=600) for _ in range(3)]"
    )
    depart = time.time() + 1.0
    procs = [
        subprocess.Popen([sys.executable, "-c", code, str(depart)], cwd=str(ICI))
        for _ in range(6)
    ]
    for p in procs:
        assert p.wait(timeout=60) == 0
    hits = sorted(taux._load()["airbnb"]["hits"])
    assert len(hits) == 18, f"{len(hits)} créneaux sur 18 : des appels perdus"
    ecarts = [b - a for a, b in zip(hits, hits[1:])]
    assert min(ecarts) >= 1.99, f"deux départs à {min(ecarts):.3f} s d'écart"


def test_apres_une_pause_courte_les_creneaux_restent_espaces():
    """Pendant un `until`, chacun recevait `until` pile, et tous partaient ensemble."""
    _journal()
    fin_pause = time.time() + 1.0
    taux.noter_blocage("airbnb", 1.0)
    for _ in range(3):
        taux.reserver("airbnb", sleep_cap=10)
    creneaux = sorted(taux._load()["airbnb"]["hits"])
    assert creneaux[0] >= fin_pause - 0.05, "personne ne part pendant la pause"
    ecarts = [b - a for a, b in zip(creneaux, creneaux[1:])]
    assert min(ecarts) >= 1.999, f"deux départs à {min(ecarts):.3f} s à la fin de la pause"


def test_un_refus_arrive_pendant_l_attente_arrete_le_creneau():
    import threading

    _journal()
    taux.reserver("airbnb", sleep_cap=10)
    threading.Timer(0.3, lambda: taux.noter_blocage("airbnb", 60)).start()
    reste = taux.pace("airbnb", sleep_cap=10)
    assert reste > 50, f"parti pendant la pause ({reste:.1f} s)"


def test_on_ne_retire_que_son_propre_verrou():
    """Un verrou repris comme périmé par un autre ne lui est pas arraché."""
    _journal()
    chemin = taux._verrou_path()
    with taux.verrou(chemin):
        # Un autre processus a repris le verrou (il l'a cru périmé).
        chemin.write_bytes(b"autre-detenteur")
    assert chemin.read_bytes() == b"autre-detenteur"
    chemin.unlink()


def test_un_verrou_perime_n_est_repris_que_par_un_seul():
    """Six processus trouvent le même verrou abandonné : jamais deux dedans à la fois."""
    dossier = Path(tempfile.mkdtemp())
    verrou = dossier / "v.lock"
    trace = dossier / "trace.txt"
    code = (
        "import sys, time, taux;"
        "from pathlib import Path;"
        "t = float(sys.argv[1]);"
        "time.sleep(max(0.0, t - time.time()));"
        f"ctx = taux.verrou(Path(r'{verrou}'));"
        "ctx.__enter__();"
        "a = time.time(); time.sleep(0.02); b = time.time();"
        f"open(r'{trace}', 'a').write(f'{{a}} {{b}}\\n');"
        "ctx.__exit__(None, None, None)"
    )
    for _ in range(3):
        verrou.write_text("mort", encoding="utf-8")
        vieux = time.time() - 60
        os.utime(verrou, (vieux, vieux))
        trace.write_text("", encoding="utf-8")
        depart = time.time() + 1.0
        procs = [subprocess.Popen([sys.executable, "-c", code, str(depart)], cwd=str(ICI)) for _ in range(6)]
        for p in procs:
            assert p.wait(timeout=60) == 0
        passages = sorted(tuple(map(float, l.split())) for l in trace.read_text(encoding="utf-8").splitlines())
        assert len(passages) == 6
        for (a1, b1), (a2, _) in zip(passages, passages[1:]):
            assert a2 >= b1, f"deux processus dans le verrou ({a2:.4f} < {b1:.4f})"


def test_pace_sans_reservation_n_ecrit_rien():
    _journal()
    taux.noter_blocage("airbnb", 30)
    assert taux.pace("airbnb", sleep_cap=1) > 29
    assert taux._load()["airbnb"]["hits"] == []


def test_un_journal_vu_vide_en_pleine_ecriture_est_relu():
    import threading

    chemin = _journal()
    chemin.write_text("", encoding="utf-8")
    threading.Timer(0.004, lambda: chemin.write_text('{"airbnb": {"hits": [], "until": 4102444800}}', encoding="utf-8")).start()
    assert taux.pause_s("airbnb") > 0, "un fichier vide un instant ne veut pas dire « aucune pause »"


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
