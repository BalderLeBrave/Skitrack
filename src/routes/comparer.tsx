/** Comparer – `#s-compare` (maquette l. 261–343 ; script l. 499–613).
 *  Ordre du DOM : contrat § 3.2. Données : `STATIONS` du dépôt, champs
 *  d'échelle domaine joints tels quels, jamais recalculés. */

import { createFileRoute } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Icon } from "@/components/Icon";
import { Bouton } from "@/components/base/Bouton";
import { Etat } from "@/components/base/Etat";
import { Tableau } from "@/components/base/Tableau";
import { Coquille } from "@/components/Coquille";
import { useGo } from "@/components/v6/go";
import {
  COLS,
  distLbl,
  fmt,
  subLbl,
  useParcours,
  type ColorUnit,
  type Filters,
  type PisteColor,
  type SortKey,
} from "@/lib/parcours";
import { SKIINFO_AT } from "@/lib/skiinfo";
import { STATIONS, stationById, type Station } from "@/lib/stations";

export const Route = createFileRoute("/comparer")({ component: Comparer });

const SORTS: { key: SortKey; label: string }[] = [
  { key: "km", label: "Tri : km de pistes" },
  { key: "v", label: "Tri : altitude village" },
  { key: "lo", label: "Tri : bas des pistes" },
  { key: "hi", label: "Tri : sommet" },
  { key: "np", label: "Tri : tronçons de pistes" },
  { key: "lifts", label: "Tri : remontées" },
  { key: "n", label: "Tri : nom" },
];

/** Clé de tri → champ du dépôt (l. 519). */
function sortVal(s: Station, k: SortKey): number {
  const v =
    k === "km"
      ? s.pistesKm
      : k === "v"
        ? s.villageM
        : k === "lo"
          ? s.minM
          : k === "hi"
            ? s.maxM
            : k === "np"
              ? s.segments
              : k === "lifts"
                ? s.lifts
                : null;
  return v ?? -1;
}

/** `colVal` (l. 500) : part, tronçons, ou km estimés (part × km du domaine). */
function colVal(s: Station, c: PisteColor, u: ColorUnit): number | null {
  if (!s.colorShare) return null;
  if (u === "pct") return s.colorShare[c];
  if (u === "n") return s.colorCounts ? s.colorCounts[c] : null;
  return s.pistesKm != null ? Math.round((s.pistesKm * s.colorShare[c]) / 100) : null;
}

/** `passes` (l. 501–507). `F.np` compare les remontées, comme la maquette. */
function passes(s: Station, F: Filters, unit: ColorUnit): boolean {
  if (F.v && (s.villageM ?? 0) < F.v) return false;
  if (F.lo && (s.minM ?? 0) < F.lo) return false;
  if (F.hi && (s.maxM ?? 0) < F.hi) return false;
  if (F.km && (s.pistesKm ?? 0) < F.km) return false;
  if (F.np && (s.lifts ?? 0) < F.np) return false;
  if (F.g && s.kind !== F.g) return false;
  if (F.pass === "__none" ? s.domain : F.pass && s.domain !== F.pass) return false;
  for (const c of COLS)
    if (F.col[c.key] && (colVal(s, c.key, unit) ?? 0) < F.col[c.key]) return false;
  return true;
}

function activeCount(F: Filters): number {
  return (
    (["v", "lo", "hi", "km", "np"] as const).filter((k) => F[k]).length +
    (F.g ? 1 : 0) +
    (F.pass ? 1 : 0) +
    Object.values(F.col).filter(Boolean).length
  );
}

const RANGE_LABELS = {
  v: (v: number) => (v ? `≥ ${fmt(v)} m` : "Toutes"),
  lo: (v: number) => (v ? `≥ ${fmt(v)} m` : "Toutes"),
  hi: (v: number) => (v ? `≥ ${fmt(v)} m` : "Toutes"),
  km: (v: number) => (v ? `≥ ${v} km` : "Toutes"),
  np: (v: number) => (v ? `≥ ${v}` : "Toutes"),
};

const RANGES: { k: keyof typeof RANGE_LABELS; label: string; max: number; step: number }[] = [
  { k: "v", label: "Village, au minimum", max: 2400, step: 100 },
  { k: "lo", label: "Bas des pistes, au minimum", max: 2200, step: 100 },
  { k: "hi", label: "Sommet, au minimum", max: 3400, step: 100 },
  { k: "km", label: "Km de pistes, au minimum", max: 600, step: 10 },
  { k: "np", label: "Remontées, au minimum", max: 150, step: 5 },
];

const UNIT_MAX: Record<ColorUnit, [number, number, string]> = {
  pct: [60, 5, "%"],
  n: [200, 5, " tronçons"],
  km: [200, 10, " km"],
};

/** `CRIT` (l. 570–582) : libellé, texte, valeur numérique pour la meilleure. */
type Critere = {
  cle: string;
  libelle: string;
  texte: (s: Station) => string | number | null;
  /** Valeur comparable, quand le critère se classe. `null` sinon. */
  nombre: ((s: Station) => number | null) | null;
};

/** Propre à la station : deux stations d'un même domaine peuvent différer.
 *  La ligne qui décide d'un séjour au ski vient en premier. */
const CRIT_STATION: Critere[] = [
  {
    cle: "altitude",
    libelle: "Altitude des pistes",
    texte: (s) => (s.minM != null ? `${fmt(s.minM)}–${fmt(s.maxM)} m` : null),
    nombre: (s) => s.maxM,
  },
  {
    cle: "proche",
    libelle: "Piste la plus proche",
    texte: (s) => distLbl(s.distToPisteKm),
    nombre: (s) => (s.distToPisteKm == null ? null : -s.distToPisteKm),
  },
  {
    cle: "village",
    libelle: "Village",
    texte: (s) => (s.villageM != null ? fmt(s.villageM) + " m" : null),
    nombre: (s) => s.villageM,
  },
  {
    cle: "type",
    libelle: "Type",
    texte: (s) => (s.kind === "village-station" ? "Village-station" : "Station"),
    nombre: null,
  },
  {
    cle: "massif",
    libelle: "Massif et département",
    texte: (s) => [s.massif, s.dept].filter(Boolean).join(" · "),
    nombre: null,
  },
];

/** Mesuré à l'échelle du domaine : toutes ses stations portent la même valeur.
 *  Répété par colonne, ce chiffre se lit comme une différence entre stations
 *  alors qu'il n'en est pas une. Il est donc dit une fois, par domaine. */
const CRIT_DOMAINE: Critere[] = [
  {
    cle: "km",
    libelle: "Km de pistes",
    texte: (s) => (s.pistesKm != null ? fmt(s.pistesKm) + " km" : null),
    nombre: (s) => s.pistesKm,
  },
  {
    cle: "remontees",
    libelle: "Remontées",
    texte: (s) => s.lifts,
    nombre: (s) => s.lifts,
  },
  {
    cle: "troncons",
    libelle: "Tronçons de pistes",
    texte: (s) => s.segments,
    nombre: (s) => s.segments,
  },
  {
    cle: "faciles",
    libelle: "Pistes faciles",
    texte: (s) => (s.colorShare ? s.colorShare.green + s.colorShare.blue + " %" : null),
    nombre: (s) => (s.colorShare ? s.colorShare.green + s.colorShare.blue : null),
  },
  {
    cle: "noires",
    libelle: "Pistes noires",
    texte: (s) => (s.colorShare ? s.colorShare.black + " %" : null),
    nombre: (s) => s.colorShare?.black ?? null,
  },
];

/** Un domaine, et les stations comparées qu'il couvre. Une station sans
 *  domaine renseigné forme son propre groupe : ses chiffres n'engagent qu'elle. */
type GroupeDomaine = { cle: string; nom: string; stations: Station[] };

function groupesDomaine(stations: readonly Station[]): GroupeDomaine[] {
  const par = new Map<string, GroupeDomaine>();
  for (const s of stations) {
    const cle = s.domain ?? `station:${s.id}`;
    const nom = s.domain ?? `${s.name} · domaine non renseigné`;
    const g = par.get(cle) ?? { cle, nom, stations: [] };
    g.stations.push(s);
    par.set(cle, g);
  }
  return [...par.values()];
}

const SIDE_KEY = "skitrack.v6.side";
const SIDE_DEF = 440;

function Comparer() {
  const go = useGo();
  const P = useParcours();
  const F = P.filters;
  const all = STATIONS;

  const massifs = useMemo(() => [...new Set(all.map((s) => s.massif))].sort(), [all]);
  const domains = useMemo(
    () =>
      [...new Set(all.map((s) => s.domain).filter((d): d is string => !!d))].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [all],
  );

  // `visible()` (l. 519)
  const q = P.q.trim().toLowerCase();
  const rows = useMemo(
    () =>
      all
        .filter(
          (s) =>
            (!P.massif || s.massif === P.massif) &&
            (!q || s.name.toLowerCase().includes(q)) &&
            passes(s, F, P.unit),
        )
        .sort((a, b) =>
          P.sortKey === "n"
            ? a.name.localeCompare(b.name, "fr")
            : sortVal(b, P.sortKey) - sortVal(a, P.sortKey),
        ),
    [all, P.massif, q, F, P.unit, P.sortKey],
  );

  const [active, setActiveId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cmpPick, setCmpPick] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // La station survolée ou choisie dans la liste. Le second argument disait
  // d'où venait le geste, pour recaler la liste sur l'épingle de la carte ;
  // la carte a quitté cet écran, il n'a plus d'objet.
  const setActive = (id: string | null) => setActiveId(id);

  // l. 723 : arrivée depuis la recherche de l'accueil.
  useEffect(() => {
    if (!P.selectFirst) return;
    P.setSelectFirst(false);
    const first = rows[0];
    if (first) setTimeout(() => setActive(first.id), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [P.selectFirst]);

  const nA = activeCount(F);
  const sortLabel =
    SORTS.find((x) => x.key === P.sortKey)?.label.replace("Tri : ", "Trié par ") ?? "";

  // `renderCmp` (l. 584–595)
  const st = P.cmp.map((id) => stationById(id)).filter((s): s is Station => !!s);
  const groupes = groupesDomaine(st);
  const pick = st.some((s) => s.id === cmpPick)
    ? cmpPick
    : P.stationId && P.cmp.includes(P.stationId)
      ? P.stationId
      : (st[0]?.id ?? null);
  const pickStation = pick ? stationById(pick) : undefined;

  // Les km par couleur sont dérivés (part × km du domaine) : notés ≈, règle 6.
  const colLabel = (c: PisteColor) =>
    F.col[c] ? `≥ ${P.unit === "km" ? "≈ " : ""}${F.col[c]}${UNIT_MAX[P.unit][2]}` : "Indifférent";

  /* ---------- Poignée (l. 599–613) ---------- */
  const split = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const el = split.current;
    if (!el) return;
    try {
      const saved = +(localStorage.getItem(SIDE_KEY) ?? 0);
      if (saved) el.style.setProperty("--side", saved + "px");
      if (localStorage.getItem(SIDE_KEY + ".collapsed") === "1") setCollapsed(true);
    } catch {
      /* stockage indisponible : largeur par défaut */
    }
  }, []);
  const clamp = (w: number) =>
    Math.min(Math.max(w, 320), (split.current?.getBoundingClientRect().width ?? 0) - 380);
  const setSide = (w: number) => split.current?.style.setProperty("--side", w + "px");
  const currentSide = () => parseInt(getComputedStyle(split.current!).getPropertyValue("--side"));
  const persist = (w: number, c: boolean) => {
    try {
      localStorage.setItem(SIDE_KEY, String(w));
      localStorage.setItem(SIDE_KEY + ".collapsed", c ? "1" : "0");
    } catch {
      /* stockage indisponible */
    }
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragging.current = true;
    handle.current?.setPointerCapture(e.pointerId);
    handle.current?.classList.add("drag");
    document.body.style.cursor = "col-resize";
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !split.current) return;
    const w = clamp(e.clientX - split.current.getBoundingClientRect().left);
    setCollapsed(false);
    setSide(w);
  };
  const onPointerEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    handle.current?.classList.remove("drag");
    document.body.style.cursor = "";
    persist(currentSide(), false);
  };
  const onDblClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setSide(SIDE_DEF);
    setCollapsed(false);
    persist(SIDE_DEF, false);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === "ArrowLeft" ? -24 : e.key === "ArrowRight" ? 24 : 0;
    if (!d) return;
    e.preventDefault();
    setCollapsed(false);
    const w = clamp(currentSide() + d);
    setSide(w);
    persist(w, false);
  };
  const toggleCollapse = () => {
    const c = !collapsed;
    setCollapsed(c);
    try {
      localStorage.setItem(SIDE_KEY + ".collapsed", c ? "1" : "0");
    } catch {
      /* stockage indisponible */
    }
  };

  const cmpcol = useRef<HTMLDivElement>(null);
  // Au large les deux colonnes sont côte à côte ; à l'étroit elles s'empilent
  // et le bouton amène le tableau sous les yeux.
  const openCmp = () => cmpcol.current?.scrollIntoView({ block: "start" });
  const cmpGo = () => {
    if (pick) P.retain(pick);
    go("lodging");
  };
  const removeFromCmp = (id: string) => {
    P.toggleCmp(id);
  };

  return (
    <Coquille>
      <section className="screen on" id="s-compare" data-screen-label="1 Comparer">
        <div className={`split${collapsed ? " collapsed" : ""}`} id="split" ref={split}>
          <aside className="side">
            <div className="side__head">
              <span className="eyebrow">Étape 1 · Station</span>
              <h1 className="h1" id="side-title">
                {P.massif ? `Stations · ${P.massif}` : "Toutes les stations"}
              </h1>
              <label className="search">
                <Icon name="loupe" />
                <input
                  id="q"
                  placeholder="Chamonix, Val Thorens, Les Angles…"
                  value={P.q}
                  onChange={(e) => P.setQ(e.target.value)}
                />
              </label>
              <div className="chips" id="massifs">
                <span
                  className={`chip${P.massif === null ? " chip--on" : ""}`}
                  onClick={() => P.setMassif(null)}
                >
                  Tous
                </span>
                {massifs.map((m) => (
                  <span
                    key={m}
                    className={`chip${P.massif === m ? " chip--on" : ""}`}
                    onClick={() => P.setMassif(P.massif === m ? null : m)}
                  >
                    {m}
                  </span>
                ))}
              </div>
              <div className="side__tools">
                <span
                  className={`chip${nA > 0 || filtersOpen ? " chip--on" : ""}`}
                  id="ftoggle"
                  onClick={() => setFiltersOpen((v) => !v)}
                >
                  <Icon name="filtres" />
                  Filtres{" "}
                  <span className="fbadge" id="fbadge" style={{ display: nA ? undefined : "none" }}>
                    {nA || ""}
                  </span>
                </span>
                <select
                  id="sort"
                  className="sort-select"
                  value={P.sortKey}
                  onChange={(e) => P.setSort(e.target.value as SortKey)}
                >
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="side__body">
              <div className={`filters${filtersOpen ? " open" : ""}`} id="filters">
                <div className="filters__in">
                  <div className="two">
                    {RANGES.map((r) => (
                      <div className="f" key={r.k}>
                        <div className="f__lab">
                          <span>{r.label}</span>
                          <span className="rel" id={`lab-${r.k}`}>
                            {RANGE_LABELS[r.k](F[r.k])}
                          </span>
                        </div>
                        <input
                          type="range"
                          id={`f-${r.k}`}
                          min={0}
                          max={r.max}
                          step={r.step}
                          value={F[r.k]}
                          onChange={(e) => P.setFilters({ [r.k]: +e.target.value })}
                        />
                      </div>
                    ))}
                    <div className="f">
                      <div className="f__lab">
                        <span>Type</span>
                      </div>
                      <span className="seg seg--start" id="gseg">
                        {(
                          [
                            ["", "Tous"],
                            ["station", "Station"],
                            ["village-station", "Village-station"],
                          ] as const
                        ).map(([g, label]) => (
                          <span
                            key={g}
                            className={F.g === g ? "on" : ""}
                            data-g={g}
                            onClick={() => P.setFilters({ g })}
                          >
                            {label}
                          </span>
                        ))}
                      </span>
                    </div>
                  </div>
                  <div className="f">
                    <div className="f__lab">
                      <span>Répartition par couleur, au minimum</span>
                      <span className="seg" id="unit">
                        {(
                          [
                            ["pct", "%"],
                            ["n", "tronçons"],
                            ["km", "km"],
                          ] as const
                        ).map(([u, label]) => (
                          <span
                            key={u}
                            className={P.unit === u ? "on" : ""}
                            data-u={u}
                            onClick={() => P.setUnit(u)}
                          >
                            {label}
                          </span>
                        ))}
                      </span>
                    </div>
                    <div className="cols" id="cols">
                      {COLS.map((c) => (
                        <div className="col" key={c.key}>
                          <span className="col__t">
                            <i style={{ background: c.token }} />
                            {c.label}
                          </span>
                          <input
                            type="range"
                            data-c={c.key}
                            min={0}
                            max={UNIT_MAX[P.unit][0]}
                            step={UNIT_MAX[P.unit][1]}
                            value={F.col[c.key]}
                            onChange={(e) => P.setColFilter(c.key, +e.target.value)}
                          />
                          <span className="col__v" id={`cv-${c.key}`}>
                            {colLabel(c.key)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="muted filters__note">
                      Tronçons par couleur : OpenSkiMap, à l'échelle du domaine skiable. Les km par
                      couleur sont estimés (part × km du domaine).
                    </p>
                  </div>
                  <div className="f">
                    <div className="f__lab">
                      <span>Domaine skiable</span>
                      <select
                        id="f-pass"
                        value={F.pass}
                        onChange={(e) => P.setFilters({ pass: e.target.value })}
                      >
                        <option value="">Tous</option>
                        <option value="__none">Non renseigné</option>
                        {domains.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <span className="muted filters__src">
                    Sources : France Montagnes (référentiel), OpenSkiMap (pistes, remontées).
                    Répartition Skiinfo du{" "}
                    <span className="rel" id="src-at">
                      {SKIINFO_AT ?? "–"}
                    </span>{" "}
                    en info-bulle quand disponible.
                  </span>
                </div>
                <div className="filters__foot">
                  <button
                    type="button"
                    className="reset"
                    id="reset"
                    onClick={() => P.resetFilters()}
                  >
                    Réinitialiser
                  </button>
                  <button
                    type="button"
                    className="btn"
                    id="fclose"
                    onClick={() => {
                      if (rows.length) setFiltersOpen(false);
                    }}
                  >
                    {rows.length
                      ? `Voir ${rows.length} station${rows.length > 1 ? "s" : ""}`
                      : "Aucune station : assouplir"}
                  </button>
                </div>
              </div>
              <div className="count">
                <span id="count">
                  {rows.length} station{rows.length > 1 ? "s" : ""} sur {all.length}
                </span>
                <span id="sortlab">{sortLabel}</span>
              </div>
              <div className="list" id="list" ref={list}>
                {rows.length ? (
                  rows.map((s) => {
                    const inCmp = P.cmp.includes(s.id);
                    const skiinfoKm = s.pistesKmScale === "fiche";
                    return (
                      <div
                        key={s.id}
                        className={`row${s.id === active ? " on" : ""}`}
                        data-id={s.id}
                        onMouseEnter={() => setActive(s.id)}
                        onClick={(e) => {
                          const t = e.target as HTMLElement;
                          if (t.closest("[data-cmp]")) return P.toggleCmp(s.id);
                          if (t.closest("[data-fiche]")) return go("fiche", { id: s.id });
                          setActive(s.id);
                        }}
                      >
                        <span className="row__name">{s.name}</span>
                        <span
                          className="row__km rel"
                          title={
                            skiinfoKm
                              ? "Géométrie OpenSkiMap incomplète ; km, altitudes et répartition : fiche Skiinfo"
                              : undefined
                          }
                        >
                          {s.pistesKm != null
                            ? fmt(s.pistesKm) + " km" + (skiinfoKm ? " (Skiinfo)" : "")
                            : "–"}
                        </span>
                        <span className="row__sub">
                          {subLbl(s)}
                          {!s.inClasseur ? " · Fiche Skiinfo, hors classeur" : ""}
                        </span>
                        <span className="row__facts">
                          <span className="rel">
                            {fmt(s.minM)}–{fmt(s.maxM)} m
                          </span>
                          <span className="row__dim">
                            village <span className="rel">{fmt(s.villageM)} m</span>
                          </span>
                          {s.lifts != null ? (
                            <span className="row__dim">
                              <span className="rel">{s.lifts}</span> remontée
                              {(s.lifts ?? 0) > 1 ? "s" : ""}
                            </span>
                          ) : null}
                          {s.distToPisteKm != null ? (
                            <span className="row__dim">
                              piste à <span className="rel">{distLbl(s.distToPisteKm)}</span>
                            </span>
                          ) : null}
                        </span>
                        {s.colorShare ? (
                          <span className="row__pistes">
                            <span className="bar">
                              {COLS.map((c) => (
                                <i
                                  key={c.key}
                                  style={{ width: `${s.colorShare![c.key]}%`, background: c.token }}
                                />
                              ))}
                            </span>
                            <span className="rel">
                              {COLS.map((c) => s.colorShare![c.key]).join(" / ")} %
                            </span>
                          </span>
                        ) : (
                          <span className="row__pistes">Répartition des pistes non relevée</span>
                        )}
                        <span className="row__act">
                          <button
                            type="button"
                            className={`mini${inCmp ? " mini--on" : ""}`}
                            data-cmp={s.id}
                          >
                            {inCmp ? <Icon name="coche" /> : <Icon name="plus" />}
                            {inCmp ? "Dans la comparaison" : "Comparer"}
                          </button>
                          <button type="button" className="mini" data-fiche={s.id}>
                            Fiche
                          </button>
                          {P.stationId === s.id ? (
                            <span className="tag tag--brand">Retenue</span>
                          ) : null}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <Etat
                    sorte="vide"
                    compact
                    titre="Aucune station ne remplit tous les critères"
                    cause={`${STATIONS.length} stations au référentiel, aucune pour ces filtres. Assouplissez-en un ou réinitialisez.`}
                  />
                )}
              </div>
              <div className={`tray${P.cmp.length > 0 ? " open" : ""}`} id="tray">
                <div className="tray__chips" id="tray-chips">
                  {P.cmp.map((id) => (
                    <span key={id} className="tag tag--brand">
                      {stationById(id)?.name}
                      <b data-rm={id} onClick={() => P.toggleCmp(id)}>
                        <Icon name="croix" />
                      </b>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn"
                  id="cmp-open"
                  disabled={P.cmp.length < 2}
                  onClick={openCmp}
                >
                  {P.cmp.length > 1
                    ? `Comparer ${P.cmp.length} stations`
                    : "Ajoutez une 2e station"}
                </button>
              </div>
            </div>
          </aside>
          <div
            className="handle"
            id="handle"
            ref={handle}
            title="Glisser pour redimensionner · double-clic pour revenir à la largeur par défaut"
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onDoubleClick={onDblClick}
            onKeyDown={onKeyDown}
          >
            <button
              type="button"
              className="handle__btn"
              id="collapse"
              title="Replier / déplier le panneau"
              onClick={toggleCollapse}
            >
              <Icon name="chevron-gauche" />
            </button>
            <span className="handle__tip">Glisser · double-clic : largeur par défaut</span>
          </div>
          <div className="cmpcol" id="cmpcol" ref={cmpcol}>
            <header className="cmpcol__head">
              <h1 className="h1 h1--xl">Comparer les stations</h1>
              <p className="muted">
                Cochez la station retenue, puis ouvrez ses logements. Dates et groupe suivent.
              </p>
            </header>

            {st.length === 0 ? (
              <Etat
                sorte="vide"
                titre="Aucune station dans la comparaison"
                cause="Ajoutez des stations depuis la liste de gauche, avec le bouton « Comparer » de chaque ligne. Deux suffisent pour que les écarts se lisent."
              />
            ) : (
              <>
                <Tableau
                  className="cmpcol__t"
                  legende="Ce qui distingue ces stations. Surligné : meilleure valeur du critère."
                  absence="non relevé"
                  colonnes={[
                    { cle: "critere", entete: "Critère", largeur: "13rem" },
                    ...st.map((x) => ({
                      cle: x.id,
                      nombre: true,
                      entete: (
                        <div className="cmp__col">
                          <label className="cmp__pick">
                            <input
                              type="radio"
                              name="pick"
                              value={x.id}
                              checked={x.id === pick}
                              onChange={() => setCmpPick(x.id)}
                              className="cmp__radio"
                            />
                            {x.name}
                          </label>
                          <span className="cmp__links">
                            <a data-fiche={x.id} onClick={() => go("fiche", { id: x.id })}>
                              Fiche
                            </a>
                            <a
                              data-rm={x.id}
                              className="cmp__rm"
                              onClick={() => removeFromCmp(x.id)}
                            >
                              Retirer
                            </a>
                          </span>
                        </div>
                      ),
                    })),
                  ]}
                  lignes={CRIT_STATION.map((c) => {
                    const vals = st.map((x) => (c.nombre ? c.nombre(x) : null));
                    const connus = vals.filter((v): v is number => v != null);
                    const meilleur = connus.length > 1 ? Math.max(...connus) : null;
                    return {
                      cle: c.cle,
                      cellules: {
                        critere: c.libelle,
                        ...Object.fromEntries(
                          st.map((x, i) => {
                            const v = c.texte(x);
                            if (v == null) return [x.id, null];
                            if (!c.nombre)
                              return [x.id, <span className="tableau__texte">{v}</span>];
                            const gagne = meilleur != null && vals[i] === meilleur;
                            return [x.id, gagne ? <b className="cmp__best">{v}</b> : v];
                          }),
                        ),
                      },
                    };
                  })}
                />

                {/* Km, remontées, tronçons et parts de couleur sont mesurés sur
                    le domaine. Répétés colonne par colonne, ils se liraient
                    comme un écart entre stations. Ils sont dits une fois. */}
                <Tableau
                  className="cmpcol__t"
                  legende={
                    groupes.length < st.length
                      ? "Mesuré sur le domaine, donc partagé par les stations d’une même ligne."
                      : "Mesuré sur le domaine, pas sur la station."
                  }
                  absence="non relevé"
                  colonnes={[
                    { cle: "domaine", entete: "Domaine", largeur: "13rem" },
                    { cle: "stations", entete: "Stations comparées" },
                    ...CRIT_DOMAINE.map((c) => ({
                      cle: c.cle,
                      entete: c.libelle,
                      nombre: true,
                    })),
                  ]}
                  lignes={groupes.map((g) => ({
                    cle: g.cle,
                    cellules: {
                      domaine: g.nom,
                      stations: (
                        <span className="tableau__texte">
                          {g.stations.map((x) => x.name).join(", ")}
                        </span>
                      ),
                      ...Object.fromEntries(
                        CRIT_DOMAINE.map((c) => [c.cle, c.texte(g.stations[0])]),
                      ),
                    },
                  }))}
                />

                <div className="cmpcol__foot">
                  <span className="muted">
                    Une valeur absente est dite absente : rien n’est estimé à sa place.
                  </span>
                  <Bouton grand id="cmp-go" onClick={cmpGo}>
                    {pickStation
                      ? `Voir les logements à ${pickStation.name}`
                      : "Voir les logements"}
                  </Bouton>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </Coquille>
  );
}
