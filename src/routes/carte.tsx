import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlpineMap } from "@/components/AlpineMap";
import { AppShell } from "@/components/AppShell";
import { PisteMixBar } from "@/components/PisteMixBar";
import { mapFilter, type MapFilter } from "@/lib/alpine";
import { CARTE_ORDERS, orderStations, searchStations, type CarteOrder } from "@/lib/carte";
import { formatFleet, liftFleet } from "@/lib/osmAccess";
import { dropM, formatAlt, STATIONS, type Station } from "@/lib/stations";

export const Route = createFileRoute("/carte")({ component: Carte });

const FILTERS: readonly [MapFilter, string][] = [
  ["all", "France"],
  ["nord", "Alpes Nord"],
  ["sud", "Alpes Sud"],
  ["pyrenees", "Pyrénées"],
  ["jura", "Jura"],
  ["vosges", "Vosges"],
  ["central", "Massif central"],
  ["corse", "Corse"],
  ["haut", "≥ 3000 m"],
];

function StationRow({
  station,
  selected,
  onSelect,
}: {
  station: Station;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li id={`carte-row-${station.id}`} className={`carte-row${selected ? " carte-row--on" : ""}`}>
      <button
        type="button"
        className="carte-row__btn"
        aria-pressed={selected}
        onClick={() => onSelect(station.id)}
      >
        <span className="carte-row__thumb bg-glacier">
          {station.photo ? (
            <img src={station.photo} alt="" loading="lazy" decoding="async" />
          ) : null}
        </span>
        <span className="carte-row__body">
          <span className="carte-row__name font-display">{station.name}</span>
          <span className="carte-row__meta">
            {station.massif} · village {formatAlt(station.villageM)}
          </span>
          <span className="carte-row__meta">
            Sommet {formatAlt(station.maxM)} · {station.slopes.announcedKm} km
          </span>
        </span>
      </button>
      {selected ? (
        <div className="carte-row__detail">
          <p className="carte-row__meta">
            Base {formatAlt(station.minM)} · {formatAlt(dropM(station))} de dénivelé
          </p>
          <p className="carte-row__meta">{formatFleet(liftFleet(station.id))}</p>
          <PisteMixBar slopes={station.slopes} compact />
          <Link to="/stations/$id" params={{ id: station.id }} className="carte-row__link">
            Fiche station →
          </Link>
        </div>
      ) : null}
    </li>
  );
}

function Carte() {
  const [filter, setFilter] = useState<MapFilter>("all");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<CarteOrder>("catalog");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const inMassif = useMemo(() => mapFilter(STATIONS, filter), [filter]);
  const stations = useMemo(
    () => orderStations(searchStations(inMassif, query), order),
    [inMassif, query, order],
  );
  const n = (id: MapFilter) => mapFilter(STATIONS, id).length;

  // Une station sortie de la liste (massif ou recherche) n'est plus sélectionnée.
  useEffect(() => {
    if (selectedId && !stations.some((s) => s.id === selectedId)) setSelectedId(null);
  }, [stations, selectedId]);

  // Un clic sur la carte fait défiler la liste jusqu'à la station.
  useEffect(() => {
    if (!selectedId) return;
    document.getElementById(`carte-row-${selectedId}`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <AppShell
      chips={
        <>
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              className={`shrink-0 rounded-full px-3 py-1 text-sm ${filter === id ? "bg-glacier font-semibold" : "text-muted"}`}
              onClick={() => setFilter(id)}
            >
              {label} · {n(id)}
            </button>
          ))}
        </>
      }
    >
      <main className="carte" data-testid="carte">
        <aside className="carte__panel">
          <div className="carte__head">
            <h1 className="font-display text-2xl tracking-tight">Carte des stations</h1>
            <p className="carte__lead">
              {stations.length} station{stations.length > 1 ? "s" : ""}
              {query ? ` pour « ${query.trim()} »` : ""} · pin GPS, altitude IGN au pin.
            </p>
            <label className="carte__search">
              <span className="sr-only">Rechercher une station</span>
              <input
                type="search"
                value={query}
                placeholder="Rechercher une station"
                autoComplete="off"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="carte__orders" role="radiogroup" aria-label="Ordre des stations">
              {CARTE_ORDERS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={order === id}
                  className={`carte__order${order === id ? " carte__order--on" : ""}`}
                  onClick={() => setOrder(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {stations.length === 0 ? (
            <p className="carte__empty">Aucune station ne correspond à cette recherche.</p>
          ) : (
            <ul className="carte__list">
              {stations.map((s) => (
                <StationRow
                  key={s.id}
                  station={s}
                  selected={s.id === selectedId}
                  onSelect={setSelectedId}
                />
              ))}
            </ul>
          )}
        </aside>
        <div className="carte__map">
          <AlpineMap
            stations={stations}
            filter={filter}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      </main>
    </AppShell>
  );
}
