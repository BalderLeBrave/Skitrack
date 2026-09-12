import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Carte } from "@/components/Carte";
import { Coquille } from "@/components/Coquille";
import {
  activeFilterCount,
  CARTE_ORDERS,
  CARTE_SORT_LABELS,
  COLOR_HEX,
  COLOR_KEYS,
  COLOR_LABELS,
  filterMassif,
  formatKm,
  NO_FILTERS,
  orderStations,
  passesFilters,
  searchStations,
  stationDomains,
  stationMassifs,
  stationTags,
  type CarteFilters,
  type CarteOrder,
  type ColorKey,
  type ColorUnit,
} from "@/lib/carte";
import { formatAlt, STATIONS, type Station } from "@/lib/stations";

export const Route = createFileRoute("/carte")({ component: PageCarte });

const MASSIFS = stationMassifs(STATIONS);
const DOMAINS = stationDomains(STATIONS);

/** Bornes des curseurs, par unité de couleur. */
const COLOR_RANGE: Record<ColorUnit, { max: number; step: number; suffix: string }> = {
  pct: { max: 60, step: 5, suffix: " %" },
  n: { max: 200, step: 5, suffix: " tronçons" },
  km: { max: 200, step: 10, suffix: " km" },
};

function PisteBar({ station }: { station: Station }) {
  const share = station.colorShare;
  if (!share) return <span className="carte-row__pistes">Répartition des pistes non relevée</span>;
  const counts = station.colorCounts;
  const title = [
    counts
      ? COLOR_KEYS.map((c) => `${COLOR_LABELS[c]} ${counts[c]} tronçons`).join(" · ")
      : "Répartition du domaine",
    station.skiinfoPct
      ? `Fiche Skiinfo : ${COLOR_KEYS.map((c) => `${COLOR_LABELS[c]} ${station.skiinfoPct![c]} %`).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className="carte-row__pistes" title={title}>
      <span className="bar">
        {COLOR_KEYS.map((c) => (
          <i key={c} style={{ width: `${share[c]}%`, background: COLOR_HEX[c] }} />
        ))}
      </span>
      <span className="num">{COLOR_KEYS.map((c) => share[c]).join(" / ")} %</span>
    </span>
  );
}

function StationRow({
  station,
  selected,
  onHover,
  onSelect,
}: {
  station: Station;
  selected: boolean;
  onHover: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const dist = station.distToPisteKm;
  return (
    <li>
      <button
        type="button"
        id={`carte-row-${station.id}`}
        className={`carte-row${selected ? " carte-row--on" : ""}`}
        aria-pressed={selected}
        onMouseEnter={() => onHover(station.id)}
        onFocus={() => onHover(station.id)}
        onClick={() => onSelect(station.id)}
      >
        <span className="carte-row__name">{station.name}</span>
        <span className="carte-row__km num">{formatKm(station.pistesKm)}</span>
        <span className="carte-row__sub">{stationTags(station)}</span>
        <span className="carte-row__facts">
          <span className="num">
            {station.minM.toLocaleString("fr-FR")}–{formatAlt(station.maxM)}
          </span>
          <span className="text-texte-2">
            village <span className="num text-ink">{formatAlt(station.villageM)}</span>
          </span>
          {station.lifts != null ? (
            <span className="text-texte-2">
              <span className="num text-ink">{station.lifts}</span> remontées
            </span>
          ) : null}
          {dist != null ? (
            <span className="text-texte-2">
              piste à{" "}
              <span className="num text-ink">
                {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}
              </span>
            </span>
          ) : null}
        </span>
        <PisteBar station={station} />
      </button>
      {selected ? (
        <Link
          to="/stations/$id"
          params={{ id: station.id }}
          className="carte-row__link block px-5 pb-3"
        >
          Fiche station →
        </Link>
      ) : null}
    </li>
  );
}

function RangeFilter({
  label,
  value,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="f">
      <span className="f__lab">
        <span>{label}</span>
        <span className="num">{format(value)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function PageCarte() {
  const [massif, setMassif] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<CarteOrder>("km");
  const [filters, setFilters] = useState<CarteFilters>(NO_FILTERS);
  const [unit, setUnit] = useState<ColorUnit>("pct");
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [centreId, setCentreId] = useState<string | null>(null);
  // Une activation venue de la carte fait défiler la liste ; l'inverse, non.
  const fromMap = useRef(false);

  const rows = useMemo(() => {
    const kept = searchStations(filterMassif(STATIONS, massif), query).filter((s) =>
      passesFilters(s, filters, unit),
    );
    return orderStations(kept, order);
  }, [massif, query, filters, unit, order]);
  const visibleIds = useMemo(() => new Set(rows.map((s) => s.id)), [rows]);
  const nFilters = activeFilterCount(filters);

  useEffect(() => {
    if (activeId && !visibleIds.has(activeId)) setActiveId(null);
  }, [visibleIds, activeId]);

  useEffect(() => {
    if (!activeId || !fromMap.current) return;
    fromMap.current = false;
    document.getElementById(`carte-row-${activeId}`)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  // Survol : la liste et la carte s'éclairent l'une l'autre, sans recentrage.
  const hoverFromMap = (id: string | null) => {
    fromMap.current = true;
    setActiveId(id);
  };
  // Clic : la station devient celle que la carte centre.
  const selectFromMap = (id: string) => {
    fromMap.current = true;
    setActiveId(id);
    setCentreId(id);
  };
  const selectFromRow = (id: string) => {
    setActiveId(id);
    setCentreId(id);
  };
  const patch = (p: Partial<CarteFilters>) => setFilters((f) => ({ ...f, ...p }));
  const setColor = (c: ColorKey, v: number) =>
    setFilters((f) => ({ ...f, colors: { ...f.colors, [c]: v } }));
  const range = COLOR_RANGE[unit];

  return (
    <Coquille>
      <main className="carte" data-testid="carte">
        <aside className="carte__panel">
          <div className="carte__head">
            <span className="carte__eyebrow">Étape 1 · Station</span>
            <h1 className="carte__title">Toutes les stations</h1>
            <p className="carte__lead">
              Cliquez une station pour la centrer ; survolez la carte pour la retrouver dans la
              liste.
            </p>
            <label className="carte__search">
              <span className="sr-only">Rechercher une station ou un domaine</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" />
              </svg>
              <input
                type="search"
                value={query}
                placeholder="Chamonix, Val Thorens, Les Angles…"
                autoComplete="off"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="carte__massifs" role="group" aria-label="Massif">
              <button
                type="button"
                className={`chip chip--sm${massif === null ? " chip--on" : ""}`}
                aria-pressed={massif === null}
                onClick={() => setMassif(null)}
              >
                Tous
              </button>
              {MASSIFS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`chip chip--sm${massif === m ? " chip--on" : ""}`}
                  aria-pressed={massif === m}
                  onClick={() => setMassif(massif === m ? null : m)}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="carte__tools">
              <button
                type="button"
                className={`chip${nFilters || open ? " chip--on" : ""}`}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                Filtres
                {nFilters ? <span className="fbadge">{nFilters}</span> : null}
              </button>
              <label>
                <span className="sr-only">Tri des stations</span>
                <select
                  className="carte__sort"
                  value={order}
                  onChange={(e) => setOrder(e.target.value as CarteOrder)}
                >
                  {CARTE_ORDERS.map(([id, label]) => (
                    <option key={id} value={id}>
                      Tri : {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="carte__body">
            {open ? (
              <div className="filters">
                <div className="filters__in">
                  <div className="two">
                    <RangeFilter
                      label="Village, au minimum"
                      value={filters.villageM}
                      max={2400}
                      step={100}
                      format={(v) => (v ? `≥ ${formatAlt(v)}` : "Toutes")}
                      onChange={(v) => patch({ villageM: v })}
                    />
                    <RangeFilter
                      label="Bas des pistes, au minimum"
                      value={filters.loM}
                      max={2200}
                      step={100}
                      format={(v) => (v ? `≥ ${formatAlt(v)}` : "Toutes")}
                      onChange={(v) => patch({ loM: v })}
                    />
                    <RangeFilter
                      label="Sommet, au minimum"
                      value={filters.hiM}
                      max={3400}
                      step={100}
                      format={(v) => (v ? `≥ ${formatAlt(v)}` : "Toutes")}
                      onChange={(v) => patch({ hiM: v })}
                    />
                    <RangeFilter
                      label="Km de pistes, au minimum"
                      value={filters.km}
                      max={300}
                      step={10}
                      format={(v) => (v ? `≥ ${v} km` : "Toutes")}
                      onChange={(v) => patch({ km: v })}
                    />
                    <RangeFilter
                      label="Remontées, au minimum"
                      value={filters.lifts}
                      max={150}
                      step={5}
                      format={(v) => (v ? `≥ ${v}` : "Toutes")}
                      onChange={(v) => patch({ lifts: v })}
                    />
                    <div className="f">
                      <span className="f__lab">
                        <span>Type</span>
                      </span>
                      <span className="seg" role="group" aria-label="Type de station">
                        {(
                          [
                            ["", "Tous"],
                            ["station", "Station"],
                            ["village-station", "Village-station"],
                          ] as const
                        ).map(([v, label]) => (
                          <button
                            key={v}
                            type="button"
                            className={filters.kind === v ? "on" : ""}
                            aria-pressed={filters.kind === v}
                            onClick={() => patch({ kind: v })}
                          >
                            {label}
                          </button>
                        ))}
                      </span>
                    </div>
                  </div>

                  <div className="f">
                    <span className="f__lab">
                      <span>Répartition par couleur, au minimum</span>
                      <span className="seg" role="group" aria-label="Unité">
                        {(
                          [
                            ["pct", "%"],
                            ["n", "tronçons"],
                            ["km", "km"],
                          ] as const
                        ).map(([v, label]) => (
                          <button
                            key={v}
                            type="button"
                            className={unit === v ? "on" : ""}
                            aria-pressed={unit === v}
                            onClick={() => {
                              setUnit(v);
                              patch({ colors: NO_FILTERS.colors });
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </span>
                    </span>
                    <div className="cols">
                      {COLOR_KEYS.map((c) => (
                        <label key={c} className="col">
                          <span className="col__t">
                            <i style={{ background: COLOR_HEX[c] }} />
                            {COLOR_LABELS[c]}
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={range.max}
                            step={range.step}
                            value={filters.colors[c]}
                            onChange={(e) => setColor(c, Number(e.target.value))}
                          />
                          <span className="col__v">
                            {filters.colors[c]
                              ? `≥ ${filters.colors[c]}${range.suffix}`
                              : "Indifférent"}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="carte__note">
                      Tronçons par couleur : OpenSkiMap, à l'échelle du domaine skiable. Les km par
                      couleur sont une part des km du domaine, notés ≈.
                    </p>
                  </div>

                  <label className="f">
                    <span className="f__lab">
                      <span>Domaine skiable</span>
                    </span>
                    <select
                      value={filters.domain}
                      onChange={(e) => patch({ domain: e.target.value })}
                    >
                      <option value="">Tous</option>
                      <option value="__none">Non renseigné</option>
                      {DOMAINS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>

                  <p className="carte__note">
                    Sources : France Montagnes (référentiel), OpenSkiMap (pistes, remontées). Une
                    station hors classeur n'affiche ni domaine, ni remontées, ni répartition : la
                    donnée n'est pas estimée.
                  </p>
                </div>
                <div className="filters__foot">
                  <button type="button" className="reset" onClick={() => setFilters(NO_FILTERS)}>
                    Réinitialiser
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={rows.length === 0}
                    onClick={() => setOpen(false)}
                  >
                    {rows.length
                      ? `Voir ${rows.length} station${rows.length > 1 ? "s" : ""}`
                      : "Aucune station : assouplir"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="carte__count">
              <span>
                {rows.length} station{rows.length > 1 ? "s" : ""} sur {STATIONS.length}
              </span>
              <span>Trié par {CARTE_SORT_LABELS[order]}</span>
            </div>
            {rows.length === 0 ? (
              <p className="carte__empty">
                Aucune station ne remplit tous les critères. Assouplissez un filtre ou
                réinitialisez.
              </p>
            ) : (
              <ul className="carte__list">
                {rows.map((s) => (
                  <StationRow
                    key={s.id}
                    station={s}
                    selected={s.id === activeId}
                    onHover={setActiveId}
                    onSelect={selectFromRow}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>
        <div className="carte__map">
          <Carte
            className="carte__toile-hote"
            epingles={rows.map((x) => ({
              id: x.id,
              lat: x.lat,
              lon: x.lon,
              titre: x.name,
              detail: x.domain ?? undefined,
              sorte: (x.maxM ?? 0) >= 3000 ? ("station-haute" as const) : ("station" as const),
            }))}
            selectionne={centreId}
            survole={activeId}
            surSurvol={(id) => hoverFromMap(id ?? null)}
            surClic={selectFromMap}
            ajuster
            legende={
              <>
                <b>Épingles</b>
                <span>Une épingle par station de la liste. L’anneau suit le survol.</span>
                <span>Fonds IGN et OpenTopoMap ; pistes et remontées OpenSnowMap.</span>
              </>
            }
          />
        </div>
      </main>
    </Coquille>
  );
}
