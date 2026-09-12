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
import { Coquille } from "@/components/Coquille";
import { useGo } from "@/components/v6/go";
import { StationMap, type FlyRequest } from "@/components/v6/StationMap";
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
const CRIT: [
  string,
  (s: Station) => string | number | null,
  ((s: Station) => number | null) | null,
][] = [
  [
    "Altitude des pistes",
    (s) => (s.minM != null ? `${fmt(s.minM)}–${fmt(s.maxM)} m` : null),
    (s) => s.maxM,
  ],
  ["Village", (s) => (s.villageM != null ? fmt(s.villageM) + " m" : null), (s) => s.villageM],
  [
    "Km de pistes (domaine)",
    (s) => (s.pistesKm != null ? fmt(s.pistesKm) + " km" : null),
    (s) => s.pistesKm,
  ],
  ["Tronçons de pistes", (s) => s.segments, (s) => s.segments],
  ["Remontées", (s) => s.lifts, (s) => s.lifts],
  [
    "Pistes faciles (vertes + bleues)",
    (s) => (s.colorShare ? s.colorShare.green + s.colorShare.blue + " %" : null),
    (s) => (s.colorShare ? s.colorShare.green + s.colorShare.blue : null),
  ],
  [
    "Pistes noires",
    (s) => (s.colorShare ? s.colorShare.black + " %" : null),
    (s) => s.colorShare?.black ?? null,
  ],
  [
    "Piste la plus proche",
    (s) => distLbl(s.distToPisteKm),
    (s) => (s.distToPisteKm == null ? null : -s.distToPisteKm),
  ],
  ["Domaine skiable", (s) => s.domain, null],
  ["Type", (s) => (s.kind === "village-station" ? "Village-station" : "Station"), null],
  ["Massif · département", (s) => `${s.massif} · ${s.dept ?? "–"}`, null],
];

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
  const visibleIds = useMemo(() => new Set(rows.map((s) => s.id)), [rows]);

  const [active, setActiveId] = useState<string | null>(null);
  const [fly, setFly] = useState<FlyRequest | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cmppOpen, setCmppOpen] = useState(false);
  const [cmpPick, setCmpPick] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // `setActive(id, how)` (l. 512–524)
  const setActive = (id: string | null, how: "hover" | "map" | "fromRow") => {
    setActiveId(id);
    if (!id) return;
    const s = stationById(id);
    if (how === "map" && list.current) {
      const row = list.current.querySelector<HTMLElement>(`.row[data-id="${id}"]`);
      if (row) {
        const L = list.current;
        const top = row.offsetTop - L.offsetTop;
        if (top < L.scrollTop || top + row.offsetHeight > L.scrollTop + L.clientHeight)
          L.scrollTop = top - 120;
      }
    }
    if (s && how === "fromRow") setFly({ lat: s.lat, lon: s.lon, nonce: Date.now() });
  };

  // l. 723 : arrivée depuis la recherche de l'accueil.
  useEffect(() => {
    if (!P.selectFirst) return;
    P.setSelectFirst(false);
    const first = rows[0];
    if (first) setTimeout(() => setActive(first.id, "fromRow"), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [P.selectFirst]);

  const activeStation = active ? stationById(active) : undefined;
  const activeLabel = activeStation
    ? `${activeStation.name} · <span class="rel">${fmt(activeStation.villageM)} m</span>`
    : null;

  const nA = activeCount(F);
  const sortLabel =
    SORTS.find((x) => x.key === P.sortKey)?.label.replace("Tri : ", "Trié par ") ?? "";

  // `renderCmp` (l. 584–595)
  const st = P.cmp.map((id) => stationById(id)).filter((s): s is Station => !!s);
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

  const openCmp = () => setCmppOpen(true);
  const cmpGo = () => {
    if (pick) P.retain(pick);
    setCmppOpen(false);
    go("lodging");
  };
  const removeFromCmp = (id: string) => {
    P.toggleCmp(id);
    if (P.cmp.length - 1 < 2) setCmppOpen(false);
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
                        onMouseEnter={() => setActive(s.id, "hover")}
                        onClick={(e) => {
                          const t = e.target as HTMLElement;
                          if (t.closest("[data-cmp]")) return P.toggleCmp(s.id);
                          if (t.closest("[data-fiche]")) return go("fiche", { id: s.id });
                          setActive(s.id, "fromRow");
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
                  <p className="muted list__empty">
                    Aucune station ne remplit tous les critères. Assouplissez un filtre ou
                    réinitialisez.
                  </p>
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
          <div className="mapcol">
            <StationMap
              stations={all}
              visible={visibleIds}
              cmp={P.cmp}
              active={active}
              activeLabel={activeLabel}
              fly={fly}
              onHover={(id) => setActive(id, "map")}
              onClick={(id) => setActive(id, "fromRow")}
              onDblClick={(id) => go("fiche", { id })}
            />
            <div className="maptools">
              <span className="chip chip--on">
                <Icon name="coche" />
                Carte
              </span>
              <span className="chip">Fond IGN</span>
            </div>
            <div className="legend">
              <b>Épingles</b>
              <span>
                <i className="legend__pin--base" />
                Station ou village-station
              </span>
              <span>
                <i className="legend__pin--cmp" />
                Dans la comparaison
              </span>
              <span>
                <i className="legend__pin--on" />
                Station survolée ou sélectionnée
              </span>
              <span className="legend__note">
                Coordonnées et altitudes : France Montagnes / OpenSkiMap.
              </span>
            </div>
            <div className={`cmpp${cmppOpen ? " open" : ""}`} id="cmpp">
              <div className="cmpp__in">
                <header className="cmpp__head">
                  <div>
                    <span className="eyebrow">Étape 1 · Station</span>
                    <h1 className="h1 h1--xl cmpp__title">Comparer les stations</h1>
                    <p className="muted cmpp__lead">
                      Données du référentiel. Choisissez la station retenue, puis ouvrez ses
                      logements – dates et groupe suivent.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="chip"
                    id="cmp-close"
                    onClick={() => setCmppOpen(false)}
                  >
                    Retour à la carte
                  </button>
                </header>
                <div className="card card--clip">
                  <table className="cmp" id="cmp-table">
                    <thead>
                      <tr>
                        <th className="cmp__crit">Critère</th>
                        {st.map((s) => (
                          <th key={s.id} className={s.id === pick ? "sel" : ""}>
                            <label className="cmp__pick">
                              <input
                                type="radio"
                                name="pick"
                                value={s.id}
                                checked={s.id === pick}
                                onChange={() => setCmpPick(s.id)}
                                className="cmp__radio"
                              />
                              {s.name}
                            </label>
                            <div className="cmp__links">
                              <a data-fiche={s.id} onClick={() => go("fiche", { id: s.id })}>
                                Fiche
                              </a>
                              <a
                                data-rm={s.id}
                                className="cmp__rm"
                                onClick={() => removeFromCmp(s.id)}
                              >
                                Retirer
                              </a>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {CRIT.map(([lab, txt, num]) => {
                        const vals = st.map((s) => (num ? num(s) : null));
                        const known = vals.filter((v): v is number => v != null);
                        const best = num && known.length ? Math.max(...known) : null;
                        return (
                          <tr key={lab}>
                            <th>{lab}</th>
                            {st.map((s, i) => {
                              const v = txt(s);
                              const isBest =
                                num && vals[i] != null && vals[i] === best && known.length > 1;
                              return (
                                <td
                                  key={s.id}
                                  className={`${s.id === pick ? "sel" : ""}${isBest ? " best" : ""}${v == null ? " cmp__none" : ""}`}
                                >
                                  <span className={num ? "rel" : ""}>{v ?? "–"}</span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="cmpp__foot">
                  <span className="muted">
                    « – » : donnée absente du référentiel ou non relevée. Surligné : meilleure
                    valeur du critère.
                  </span>
                  <button type="button" className="btn btn--lg" id="cmp-go" onClick={cmpGo}>
                    {pickStation
                      ? `Voir les logements à ${pickStation.name}`
                      : "Voir les logements"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Coquille>
  );
}
