/** Accueil – `#s-home` (maquette l. 219–258, `renderHome` l. 712–727).
 *  Ordre du DOM : contrat § 3.1. Données : `STATIONS` du dépôt. */

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { Flocons } from "@/components/Flocons";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { PhotoCredit } from "@/components/PhotoCredit";
import { StayDatesField } from "@/components/StayDatesField";
import {
  fmt,
  stationPhoto,
  stationPhotoAbsence,
  STAY_BOUNDS,
  stepStay,
  useParcours,
  useSejour,
} from "@/lib/parcours";
import { STATIONS, type Station } from "@/lib/stations";

export const Route = createFileRoute("/")({ component: Home });

/** Paliers du seuil de sommet. Zéro = pas de seuil. */
const ALT_STEPS = [0, 1800, 2000, 2200, 2500, 3000, 3500] as const;

const PRESETS: { key: "big" | "high" | "village" | "family"; label: string }[] = [
  { key: "big", label: "Grands domaines · 300 km et plus" },
  { key: "high", label: "Haute altitude · sommet 3 000 m" },
  { key: "village", label: "Villages-stations" },
  { key: "family", label: "Plus de 40 % de pistes faciles" },
];

/** l. 713 : `<n> stations · <m> massifs · <d> domaines`.
 *
 *  « domaines » est qualifié : ce compte est celui des domaines **skiables**
 *  distincts du classeur. L'écran Forfaits en annonce 173, qui sont des
 *  domaines **de forfait** — deux découpages différents du même massif, et rien
 *  ne le disait. */
function homeCount(all: Station[]): string {
  const massifs = new Set(all.map((s) => s.massif)).size;
  const domaines = new Set(all.map((s) => s.domain).filter(Boolean)).size;
  return `${all.length} stations · ${massifs} massifs · ${domaines} domaines skiables`;
}

/** Compteur compact de la barre de recherche.
 *
 *  Les bornes viennent de `STAY_BOUNDS`, donc de `PARTY_LIMITS` : un seul
 *  endroit les tient. Un bouton arrivé à la borne se désactive visiblement,
 *  plutôt que de rester actif et muet. */
function SbarStepper({
  k,
  value,
  label,
  display,
}: {
  k: "trav" | "rooms";
  value: number;
  label: string;
  display?: string;
}) {
  const b = STAY_BOUNDS[k];
  return (
    <span className="sbar__step">
      <button
        type="button"
        aria-label={`${label}, un de moins`}
        disabled={value <= b.min}
        onClick={() => stepStay(k, -1)}
      >
        <Icon name="moins" />
      </button>
      <b className="rel">{display ?? value}</b>
      <button
        type="button"
        aria-label={`${label}, un de plus`}
        disabled={value >= b.max}
        onClick={() => stepStay(k, 1)}
      >
        <Icon name="plus" />
      </button>
    </span>
  );
}

/** l. 714 : une station par domaine relié, par km de pistes décroissants, six. */
function topDomains(all: Station[]): Station[] {
  const seen = new Set<string>();
  return [...all]
    .sort((a, b) => (b.pistesKm ?? 0) - (a.pistesKm ?? 0))
    .filter((s) => s.domain && !seen.has(s.domain) && seen.add(s.domain))
    .slice(0, 6);
}

/** l. 717 : massifs par nombre de stations décroissant, sommet maximal. */
function massifCards(all: Station[]): { m: string; n: number; hi: number }[] {
  const ms = new Map<string, Station[]>();
  for (const s of all) ms.set(s.massif, [...(ms.get(s.massif) ?? []), s]);
  return [...ms.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([m, arr]) => ({ m, n: arr.length, hi: Math.max(...arr.map((s) => s.maxM ?? 0)) }));
}

function Home() {
  const go = useGo();
  const { trav, rooms } = useSejour();
  const setQ = useParcours((s) => s.setQ);
  const setMassif = useParcours((s) => s.setMassif);
  const setFilters = useParcours((s) => s.setFilters);
  const setColFilter = useParcours((s) => s.setColFilter);
  const setUnit = useParcours((s) => s.setUnit);
  const resetFilters = useParcours((s) => s.resetFilters);

  const all = STATIONS;
  const count = useMemo(() => homeCount(all), [all]);
  const top = useMemo(() => topDomains(all), [all]);
  const massifs = useMemo(() => massifCards(all), [all]);

  const [hq, setHq] = useState("");
  const [altMin, setAltMin] = useState(0);
  // l. 720–722 : 7 stations au plus, plus les massifs dont le nom contient la saisie.
  const v = hq.trim().toLowerCase();
  const hits = v ? all.filter((s) => s.name.toLowerCase().includes(v)).slice(0, 7) : [];
  const mh = v ? massifs.filter((x) => x.m.toLowerCase().includes(v)) : [];
  const suggOpen = mh.length + hits.length > 0;

  // l. 723 : la saisie devient `q` de l'écran Comparer.
  const search = () => {
    const val = hq.trim();
    setQ(val);
    // Le seuil de sommet devient le filtre `hi` de l'écran Comparer. À zéro, il
    // est levé : un filtre laissé au repos ne doit rien écarter.
    setFilters({ hi: altMin });
    go("compare");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") search();
  };
  // l. 726 : préréglages, après réinitialisation des filtres.
  const preset = (p: (typeof PRESETS)[number]["key"]) => {
    resetFilters();
    if (p === "big") setFilters({ km: 300 });
    if (p === "high") setFilters({ hi: 3000 });
    if (p === "village") setFilters({ g: "village-station" });
    if (p === "family") {
      setUnit("pct");
      setColFilter("blue", 40);
    }
    go("compare");
  };

  return (
    <Coquille>
      <section className="screen on" id="s-home" data-screen-label="Accueil">
        <div className="scroll">
          <div className="hero">
            <div className="hero__bg" />
            <ImageSlot
              id="v6-hero"
              placeholder="Photo de couverture"
              className="hero__slot"
              src="/hero.jpg"
            />
            <div className="hero__veil" />
            {/* Neige animée : `Flocons` existait et n'était posé nulle part. Il
                se coupe de lui-même si le système réduit les animations. */}
            <Flocons />
            <div className="hero__in">
              <span className="tag hero__badge">
                <span id="home-count" className="rel">
                  {count}
                </span>
              </span>
              <h1>
                Le bon domaine, à la bonne altitude, <em>au bon prix.</em>
              </h1>
              <p className="hero__lead">
                Altitudes, pistes, remontées et logements à prix ferme, tirés de sources
                vérifiables. Rien n'est estimé sans le dire.
              </p>
              <div className="sbar">
                <div className="sbar__f">
                  <small>Station ou massif</small>
                  <input
                    id="hq"
                    placeholder="Chamonix, Val Thorens, Pyrénées…"
                    autoComplete="off"
                    value={hq}
                    onChange={(e) => setHq(e.target.value)}
                    onKeyDown={onKey}
                  />
                </div>
                {/* Ces trois champs affichaient le séjour sans permettre de le
                    changer : trois `<b>` inertes au milieu d'une barre de
                    recherche, entre un champ de saisie et un bouton. C'est ici
                    que le séjour se pose, maintenant. */}
                <div className="sbar__f">
                  <small>Dates</small>
                  <StayDatesField compact />
                </div>
                <div className="sbar__f">
                  <small>Voyageurs</small>
                  <SbarStepper k="trav" value={trav} label="Voyageurs" />
                </div>
                <div className="sbar__f">
                  <small>Chambres</small>
                  <SbarStepper k="rooms" value={rooms} label="Chambres" />
                </div>
                {/* Altitude : le seuil porte sur le **sommet** du domaine, la
                    seule altitude qui dit si la neige tient. Il alimente le
                    filtre `hi` de l'écran Comparer, celui-là même que le
                    préréglage « Haute altitude » utilise. */}
                <div className="sbar__f">
                  <small>Sommet au moins</small>
                  <select
                    id="h-alt"
                    className="sbar__select"
                    value={String(altMin)}
                    onChange={(e) => setAltMin(Number(e.target.value))}
                  >
                    {ALT_STEPS.map((a) => (
                      <option key={a} value={a}>
                        {a === 0 ? "toute altitude" : `${a.toLocaleString("fr-FR")} m`}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" className="btn btn--lg" id="hgo" onClick={search}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  >
                    <circle cx="11" cy="11" r="6.5" />
                    <path d="M16 16l4.5 4.5" />
                  </svg>
                  Rechercher
                </button>
                <div className={`sugg${suggOpen ? " open" : ""}`} id="sugg">
                  {mh.map((x) => (
                    <div
                      key={"m:" + x.m}
                      data-m={x.m}
                      onClick={() => {
                        setMassif(x.m);
                        setHq("");
                        go("compare");
                      }}
                    >
                      <span>{x.m}</span>
                      <span className="muted">massif</span>
                    </div>
                  ))}
                  {hits.map((s) => (
                    <div
                      key={"s:" + s.id}
                      data-s={s.id}
                      onClick={() => {
                        setHq("");
                        go("fiche", { id: s.id });
                      }}
                    >
                      <span>{s.name}</span>
                      <span className="muted rel">
                        {s.pistesKm != null ? fmt(s.pistesKm) + " km" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {/* « studio accepté » ne tient pas dans le champ Chambres : le
                  champ porte le chiffre, la règle se lit ici. */}
              <p className="hero__note">
                Zéro chambre vaut « studio accepté » : c’est l’absence d’exigence, pas un filtre.
              </p>
              <div className="hchips" id="hchips">
                {PRESETS.map((p) => (
                  <span
                    key={p.key}
                    className="chip"
                    data-preset={p.key}
                    onClick={() => preset(p.key)}
                  >
                    {p.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="wrap home__wrap">
            <section className="home__section">
              <header className="home__head">
                <div>
                  <h2 className="h1 home__h2">Les plus grands domaines</h2>
                  <p className="muted home__sub">
                    Une station par domaine relié, classées par kilomètres de pistes du domaine,
                    mesurés par OpenSkiMap.
                  </p>
                </div>
                <a data-go="compare" onClick={() => go("compare")}>
                  Toutes les stations sur la carte <Icon name="chevron-droite" />
                </a>
              </header>
              <div className="grid3" id="home-top">
                {top.map((s) => (
                  <article
                    key={s.id}
                    className="stc"
                    data-fiche={s.id}
                    onClick={() => go("fiche", { id: s.id })}
                  >
                    <div className="stc__img">
                      {/* La légende disait « Photo <station> » là où il n'y a
                          pas de photo : cela se lit comme le titre d'une image
                          qu'on ne voit pas. Elle dit l'absence. */}
                      <ImageSlot
                        id={`v6-st-${s.id}`}
                        placeholder={stationPhotoAbsence(s)}
                        className="stc__slot"
                        src={stationPhoto(s)}
                      />
                      {stationPhoto(s) ? <PhotoCredit stationId={s.id} /> : null}
                      <span
                        className="tag tag--snow rel stc__km"
                        title="Kilomètres de pistes du domaine, mesurés par OpenSkiMap"
                      >
                        {fmt(s.pistesKm)} km
                      </span>
                    </div>
                    <div className="stc__body">
                      <div>
                        <strong className="stc__name">{s.name}</strong>
                        <span className="muted">
                          {s.massif} · {s.domain}
                        </span>
                      </div>
                      <dl className="facts stc__facts">
                        <div>
                          <dt>Altitude</dt>
                          <dd className="rel">
                            {fmt(s.minM)}–{fmt(s.maxM)} m
                          </dd>
                        </div>
                        <div>
                          <dt>Remontées (domaine)</dt>
                          <dd className="rel">{s.lifts ?? "–"}</dd>
                        </div>
                        <div>
                          <dt>Faciles</dt>
                          <dd className="rel">
                            {s.colorShare ? s.colorShare.green + s.colorShare.blue + " %" : "–"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="home__section">
              <header>
                <h2 className="h1 home__h2">Par massif</h2>
                <p className="muted home__sub">Ouvre la carte filtrée sur le massif.</p>
              </header>
              <div className="massifs" id="home-massifs">
                {massifs.map((x) => (
                  <div
                    key={x.m}
                    className="mcard"
                    data-m={x.m}
                    onClick={() => {
                      setMassif(x.m);
                      go("compare");
                    }}
                  >
                    <strong className="mcard__name">{x.m}</strong>
                    <span className="muted">
                      <span className="rel mcard__n">{x.n}</span> station{x.n > 1 ? "s" : ""} ·
                      sommet jusqu'à <span className="rel mcard__n">{fmt(x.hi)} m</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
    </Coquille>
  );
}
