/** Accueil – maquette v7 (`SKITRACK v7 - App.dc.html`, bloc ACCUEIL).
 *
 *  Une couverture, une barre de recherche en cinq segments dont chacun ouvre
 *  son panneau (destination, altitude, arrivée, départ, voyageurs), quatre
 *  raccourcis, puis « Les plus grands domaines » et « Par massif ».
 *  Données : `STATIONS` du dépôt et le catalogue de forfaits. */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { Flocons } from "@/components/Flocons";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { Calendrier, usePlage } from "@/components/v7/Calendrier";
import { CarteStation } from "@/components/v7/CarteStation";
import { Compteur } from "@/components/v7/Compteur";
import {
  arrivalLbl,
  datesLbl,
  departLbl,
  dm,
  fmt,
  guestsLbl,
  useParcours,
  useSejour,
  type ChipKey,
} from "@/lib/parcours";
import { STATIONS, stationById, type Station } from "@/lib/stations";
import { maxM } from "@/lib/v7";

export const Route = createFileRoute("/")({ component: Home });

/**
 * La séquence d'entrée ne se joue qu'une fois par session.
 *
 * Elle dure une seconde et demie ; revue à chaque retour sur l'accueil, elle
 * deviendrait un péage. `sessionStorage` retient le passage pour l'onglet, et
 * son échec — navigation privée, stockage refusé — est sans conséquence : la
 * séquence se rejoue, ce qui est le pire qui puisse arriver.
 */
const CLE_ENTREE = "skitrack.v7.entree";

function dejaVue(): boolean {
  try {
    return sessionStorage.getItem(CLE_ENTREE) === "1";
  } catch {
    return false;
  }
}

function noterVue(): void {
  try {
    sessionStorage.setItem(CLE_ENTREE, "1");
  } catch {
    /* stockage indisponible : la séquence se rejouera */
  }
}

type Panneau = null | "q" | "alt" | "dates" | "guests";

/** Les trois repères d'altitude du panneau « Altitude, au minimum ». */
const ALT_RANGES: { k: "v" | "lo" | "hi"; label: string; max: number; court: string }[] = [
  { k: "v", label: "Altitude du village", max: 2400, court: "village" },
  { k: "lo", label: "Bas des pistes", max: 2200, court: "bas" },
  { k: "hi", label: "Sommet", max: 3500, court: "sommet" },
];

const ALT_PRESETS: { label: string; p: Partial<Record<"v" | "lo" | "hi", number>> }[] = [
  { label: "Village 1 800 m", p: { v: 1800 } },
  { label: "Sommet 3 000 m", p: { hi: 3000 } },
  { label: "Bas des pistes 1 500 m", p: { lo: 1500 } },
];

const SHORTCUTS: { k: ChipKey; label: string }[] = [
  { k: "big", label: "Grands domaines · 300 km et plus" },
  { k: "high", label: "Haute altitude · sommet 3 000 m" },
  { k: "glacier", label: "Glacier" },
  { k: "family", label: "Plus de 60 % de pistes faciles" },
];

/** Une station par domaine relié, par km de pistes décroissants, six. */
function popular(all: Station[]): Station[] {
  const seen = new Set<string>();
  return [...all]
    .sort((a, b) => (b.pistesKm ?? 0) - (a.pistesKm ?? 0))
    .filter((s) => s.domain && !seen.has(s.domain) && seen.add(s.domain))
    .slice(0, 6);
}

function massifCards(all: Station[]): { m: string; n: number; hi: number }[] {
  const ms = new Map<string, Station[]>();
  for (const s of all) ms.set(s.massif, [...(ms.get(s.massif) ?? []), s]);
  return [...ms.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "fr"))
    .map(([m, arr]) => ({ m, n: arr.length, hi: Math.max(...arr.map((s) => maxM(s) ?? 0)) }));
}

function Home() {
  const go = useGo();
  const P = useParcours();
  const F = P.filters;
  const { checkIn, checkOut, trav, rooms, nights, valid } = useSejour();
  const plage = usePlage();
  // La station retenue, s'il y en a une : c'est elle qui décide de ce que
  // « Rechercher » va ouvrir.
  const retenue = P.stationId ? stationById(P.stationId) : undefined;

  const all = STATIONS;
  const top = useMemo(() => popular(all), [all]);
  const massifs = useMemo(() => massifCards(all), [all]);

  const [q, setQ] = useState("");
  const [hp, setHp] = useState<Panneau>(null);
  // « anime » ne dure que le temps de la séquence. Rien n'est caché : tout est
  // dans le document dès le premier rendu, seule l'opacité bouge, et la barre
  // de recherche répond au clavier pendant son propre fondu.
  const [entree, setEntree] = useState<"anime" | "faite">(() => (dejaVue() ? "faite" : "anime"));

  useEffect(() => {
    if (entree === "faite") return;
    noterVue();
    // Un geste de l'utilisateur termine la séquence sur-le-champ : personne ne
    // doit attendre une animation pour se servir de l'écran.
    const finir = () => setEntree("faite");
    const fin = setTimeout(finir, 1600);
    window.addEventListener("keydown", finir, { once: true });
    window.addEventListener("pointerdown", finir, { once: true });
    return () => {
      clearTimeout(fin);
      window.removeEventListener("keydown", finir);
      window.removeEventListener("pointerdown", finir);
    };
    // Une seule fois, au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ouvrir = (p: Panneau) => {
    if (p === "dates") plage.ouvrirArrivee();
    setHp(p);
  };
  const ouvrirDepart = () => {
    plage.ouvrirDepart();
    setHp("dates");
  };
  const fermer = () => {
    setHp(null);
    plage.reset();
  };

  const ql = q.trim().toLowerCase();
  const sugg =
    ql && hp === "q"
      ? [
          ...massifs
            .filter((x) => x.m.toLowerCase().includes(ql))
            .map((x) => ({
              key: "m:" + x.m,
              label: x.m,
              kind: "massif",
              pick: () => {
                P.setMassif(x.m);
                P.setQ("");
                void go("compare");
              },
            })),
          ...all
            .filter((s) => s.name.toLowerCase().includes(ql))
            .slice(0, 6)
            .map((s) => ({
              key: "s:" + s.id,
              label: s.name,
              kind: s.domain ?? s.massif,
              pick: () => {
                setQ("");
                void go("fiche", { id: s.id });
              },
            })),
        ]
      : [];

  // Ce que « Rechercher » va faire, dit avant de le faire. Le bouton est le
  // seul passage vers l'étape suivante : cliquer une vignette sélectionne, il
  // ne navigue pas.
  const manque = !valid ? "Le départ précède l'arrivée : corrigez les dates du séjour." : null;
  const dira = manque
    ? manque
    : retenue
      ? `Rechercher ouvrira les logements à ${retenue.name}, pour ${nights} nuit${nights > 1 ? "s" : ""}.`
      : q.trim()
        ? `Rechercher ouvrira les stations qui portent «\u00a0${q.trim()}\u00a0».`
        : "Rechercher ouvrira la liste des stations. Retenez-en une ci-dessous pour aller droit à ses logements.";

  const search = () => {
    if (manque) return;
    setHp(null);
    // Une station retenue, c'est l'étape 1 faite : le pas suivant est le sien.
    if (retenue) {
      void go("lodging");
      return;
    }
    P.setQ(q.trim());
    P.setMassif(null);
    void go("compare");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") search();
  };
  const shortcut = (k: ChipKey) => {
    P.resetFilters();
    P.setChip(k, true);
    void go("compare");
  };

  const altActive = ALT_RANGES.filter((r) => F[r.k]);
  const altSegLbl = altActive.length
    ? altActive.map((r) => `${r.court} ≥ ${fmt(F[r.k])}`).join(" · ") + " m"
    : "Indifférent";

  const seg = (on: boolean) => `sbar7__seg${on ? " sbar7__seg--on" : ""}`;

  return (
    <Coquille>
      <main className="v7main v7main--pleine" id="s-home" data-screen-label="Accueil">
        <div className={`hero7${entree === "anime" ? " hero7--entree" : ""}`}>
          <ImageSlot shape="rect"
            id="v7app-cover"
            placeholder="Photo de couverture : un domaine en février, au petit matin. Crédit obligatoire."
            className="hero7__slot"
            src="/hero.jpg"
          />
          <div className="hero7__voile" />
          {/* Entre le voile et le texte : la neige passe devant la photo, jamais
              devant ce qui se lit. Densité et opacité sobres, chute lente. */}
          <Flocons
            count={130}
            speedMin={0.14}
            speedMax={0.5}
            sizeMin={0.8}
            sizeMax={2.6}
            opacityMin={18}
            opacityMax={52}
          />
          <div className="hero7__in">
            <h1>
              <span className="hero7__t1">Le bon domaine,</span>{" "}
              <span className="hero7__t2">à la bonne altitude.</span>
            </h1>
            <p className="hero7__lead">
              Altitudes réelles, mix de pistes, forfaits relevés et logements au total du séjour. Ce
              qui n'est pas relevé est dit absent.
            </p>
            {hp ? <div className="hero7__fond" onClick={fermer} /> : null}
            <div className="sbar7__hote hero7__barre">
              <div className={`sbar7${hp ? " sbar7--ouverte" : ""}`}>
                <label className={seg(hp === "q")} onClick={() => setHp("q")}>
                  <span className="sbar7__k">Destination</span>
                  <input
                    id="hq"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setHp("q");
                    }}
                    onKeyDown={onKey}
                    onFocus={() => setHp("q")}
                    placeholder="Station, massif, domaine"
                    autoComplete="off"
                  />
                </label>
                <button type="button" className={seg(hp === "alt")} onClick={() => ouvrir("alt")}>
                  <span className="sbar7__k">Altitude</span>
                  <span className="sbar7__v">{altSegLbl}</span>
                </button>
                <button
                  type="button"
                  className={seg(hp === "dates" && plage.phase === "from")}
                  onClick={() => ouvrir("dates")}
                >
                  <span className="sbar7__k">Arrivée</span>
                  <span className="sbar7__v">{dm(checkIn)}</span>
                </button>
                <button
                  type="button"
                  className={seg(hp === "dates" && plage.phase === "to")}
                  onClick={ouvrirDepart}
                >
                  <span className="sbar7__k">Départ</span>
                  <span className="sbar7__v">{dm(checkOut)}</span>
                </button>
                <div className={`sbar7__fin ${seg(hp === "guests")}`}>
                  <button type="button" className="sbar7__seg sbar7__seg--nu" onClick={() => ouvrir("guests")}>
                    <span className="sbar7__k">Voyageurs</span>
                    <span className="sbar7__v">{guestsLbl(trav, rooms)}</span>
                  </button>
                  <button
                    type="button"
                    className="sbar7__go"
                    title={dira}
                    aria-label={dira}
                    disabled={!!manque}
                    onClick={search}
                  >
                    <Icon name="loupe" taille={18} />
                  </button>
                </div>
              </div>

              {sugg.length ? (
                <div className="pop7 pop7--sugg">
                  <span className="pop7__label">Suggestions</span>
                  {sugg.map((sg) => (
                    <button key={sg.key} type="button" className="pop7__sugg" onClick={sg.pick}>
                      <span>{sg.label}</span>
                      <span className="pop7__kind">{sg.kind}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {hp === "dates" ? (
                <div className="pop7 pop7--dates">
                  <Calendrier plage={plage} onPose={() => setHp("guests")} />
                  <div className="pop7__pied">
                    <span />
                    <span className="pop7__recap">
                      {nights} nuit{nights > 1 ? "s" : ""} · {arrivalLbl(checkIn)} → {departLbl(checkOut)}
                    </span>
                  </div>
                </div>
              ) : null}

              {hp === "alt" ? (
                <div className="pop7 pop7--alt">
                  <div className="pop7__tete">
                    <strong>Altitude, au minimum</strong>
                    <span>
                      Trois repères indépendants ; laissez sur « Indifférent » ce qui ne compte pas.
                    </span>
                  </div>
                  {ALT_RANGES.map((r) => (
                    <label key={r.k} className="curseur">
                      <span className="curseur__lab">
                        <span>{r.label}</span>
                        <span className="curseur__val">
                          {F[r.k] ? `≥ ${fmt(F[r.k])} m` : "Indifférent"}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={r.max}
                        step={100}
                        value={F[r.k]}
                        onChange={(e) => P.setFilters({ [r.k]: +e.target.value })}
                      />
                    </label>
                  ))}
                  <div className="pop7__presets">
                    {ALT_PRESETS.map((ap) => {
                      const on = Object.entries(ap.p).every(([k, v]) => F[k as "v" | "lo" | "hi"] === v);
                      return (
                        <button
                          key={ap.label}
                          type="button"
                          className={`puce${on ? " puce--on" : ""}`}
                          onClick={() =>
                            P.setFilters(
                              Object.fromEntries(
                                Object.entries(ap.p).map(([k, v]) => [k, on ? 0 : v]),
                              ) as Partial<typeof F>,
                            )
                          }
                        >
                          {ap.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="pop7__pied pop7__pied--trait">
                    <a
                      href="#"
                      className="lien-doux"
                      onClick={(e) => {
                        e.preventDefault();
                        P.setFilters({ v: 0, lo: 0, hi: 0 });
                      }}
                    >
                      Indifférent
                    </a>
                    <button type="button" className="btn7 btn7--encre" onClick={() => ouvrir("dates")}>
                      Suivant : dates
                    </button>
                  </div>
                </div>
              ) : null}

              {hp === "guests" ? (
                <div className="pop7 pop7--guests">
                  <Compteur k="trav" titre="Voyageurs" regle="1 à 20 personnes" />
                  <Compteur k="rooms" titre="Chambres" regle="0 = studio accepté" />
                </div>
              ) : null}
            </div>
            <p className={`hero7__dira${manque ? " hero7__dira--manque" : ""}`} aria-live="polite">
              {dira}
            </p>
            <div className="hero7__raccourcis">
              {SHORTCUTS.map((sc) => (
                <button key={sc.k} type="button" className="raccourci" onClick={() => shortcut(sc.k)}>
                  {sc.label}
                </button>
              ))}
            </div>
          </div>
          <span className="hero7__suite" aria-hidden>
            <span>La suite plus bas</span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v13M6 13l6 6 6-6" />
            </svg>
          </span>
          <span className="hero7__credit">Crédit photo à relever</span>
        </div>

        <div className="v7wrap home7">
          <section className="home7__section">
            <header className="home7__tete">
              <div>
                <h2>Les plus grands domaines</h2>
                <p>
                  Une station par forfait relié, classées par kilomètres de pistes. Km et remontées
                  sont des valeurs de domaine.
                </p>
              </div>
              <a
                href="/comparer"
                onClick={(e) => {
                  e.preventDefault();
                  P.resetFilters();
                  void go("compare");
                }}
              >
                Toutes les stations, sur la carte →
              </a>
            </header>
            <div className="home7__grille3">
              {top.map((s) => (
                <CarteStation key={s.id} s={s} variante="accueil" />
              ))}
            </div>
          </section>
          <section className="home7__section">
            <header className="home7__tete">
              <div>
                <h2>Par massif</h2>
                <p>Ouvre la carte filtrée sur le massif.</p>
              </div>
            </header>
            <div className="home7__massifs">
              {massifs.map((x) => (
                <button
                  key={x.m}
                  type="button"
                  className="mcard7"
                  onClick={() => {
                    P.setMassif(x.m);
                    P.setQ("");
                    void go("compare");
                  }}
                >
                  <strong>{x.m}</strong>
                  <span>
                    {x.n} station{x.n > 1 ? "s" : ""} · sommet jusqu'à {fmt(x.hi)} m
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
        <span className="sr-only">{datesLbl(checkIn, checkOut, nights)}</span>
      </main>
    </Coquille>
  );
}
