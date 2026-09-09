import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LodgeSheet } from "@/components/LodgeSheet";
import { LodgingCard } from "@/components/LodgingCard";
import { MapPanel } from "@/components/MapPanel";
import { listingsForStay, type Listing } from "@/lib/listings";
import { searchStay } from "@/lib/searchStay";
import { stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";

export const Route = createFileRoute("/logements")({ component: Logements });

const ALL_SOURCES: Listing["source"][] = [
  "Airbnb",
  "Booking",
  "Abritel",
  "Gîtes de France",
  "Centrale",
];

function Logements() {
  const stationId = useStay((s) => s.stationId);
  const guests = useStay((s) => s.guests);
  const bedrooms = useStay((s) => s.bedrooms);
  const checkIn = useStay((s) => s.checkIn);
  const checkOut = useStay((s) => s.checkOut);
  const searchNonce = useStay((s) => s.searchNonce);
  const liveListings = useStay((s) => s.liveListings);
  const liveSources = useStay((s) => s.liveSources);
  const searching = useStay((s) => s.searching);
  const setLive = useStay((s) => s.setLive);
  const mergeLive = useStay((s) => s.mergeLive);
  const setSearching = useStay((s) => s.setSearching);
  const station = stationById(stationId);
  const frozen = useMemo(
    () => listingsForStay(stationId, guests, bedrooms),
    [stationId, guests, bedrooms],
  );
  const raw = useMemo(() => {
    if (liveListings == null) return frozen;
    const reported = new Set(liveSources.map((s) => s.source));
    const keepDump = frozen.filter((l) => !reported.has(l.source));
    return [...keepDump, ...liveListings].sort((a, b) => a.total - b.total);
  }, [liveListings, liveSources, frozen]);
  const [off, setOff] = useState<string[]>([]);
  const [ficheId, setFicheId] = useState<string | null>(null);
  const list = useMemo(
    () => raw.filter((l) => !off.includes(l.source)),
    [raw, off],
  );
  const grid = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!station) return;
    let cancelled = false;
    let pending = 3;
    setLive(null, [], true);
    const payload = {
      stationId,
      stationName: station.name,
      lat: station.lat,
      lon: station.lon,
      checkIn,
      checkOut,
      guests,
      bedrooms,
    };
    const finish = () => {
      pending -= 1;
      if (!cancelled && pending <= 0) setSearching(false);
    };
    const run = (part: "airbnb" | "gites" | "cozy") => {
      void searchStay({ data: { ...payload, part } })
        .then((res) => {
          if (cancelled) return;
          mergeLive(res.listings, res.sources);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const error = err instanceof Error ? err.message : String(err);
          if (part === "airbnb") {
            mergeLive(frozen.filter((l) => l.source === "Airbnb"), [
              { source: "Airbnb", ok: false, count: 0, ms: 0, error },
            ]);
          } else if (part === "gites") {
            mergeLive(frozen.filter((l) => l.source === "Gîtes de France"), [
              { source: "Gîtes de France", ok: false, count: 0, ms: 0, error },
            ]);
          } else {
            mergeLive(frozen.filter((l) => l.source === "Abritel" || l.source === "Booking"), [
              { source: "Abritel", ok: false, count: 0, ms: 0, error },
              { source: "Booking", ok: false, count: 0, ms: 0, error },
            ]);
          }
        })
        .finally(finish);
    };
    run("airbnb");
    run("gites");
    run("cozy");
    return () => {
      cancelled = true;
    };
  }, [stationId, checkIn, checkOut, guests, bedrooms, searchNonce, station?.name]);

  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () => {
      setRatio(Math.round((el.getBoundingClientRect().height / window.innerHeight) * 100));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [list.length]);

  return (
    <AppShell
      chips={
        <>
          <span className="rounded-full bg-glacier px-3 py-1">
            {station?.name ?? stationId}
          </span>
          <span className="rounded-full bg-glacier px-3 py-1">
            {checkIn} → {checkOut}
          </span>
          <span className="rounded-full bg-glacier px-3 py-1">{guests} pers.</span>
          <span className="rounded-full bg-glacier px-3 py-1">
            {bedrooms > 0 ? `${bedrooms}+ ch.` : "chambres : toutes"}
          </span>
          {ALL_SOURCES.map((s) => {
            const n = raw.filter((l) => l.source === s).length;
            const report = liveSources.find((r) => r.source === s);
            const on = n > 0 && !off.includes(s);
            const pending = searching && !report;
            return (
              <button
                key={s}
                type="button"
                disabled={n === 0 && !pending}
                className={`rounded-full px-3 py-1 ${on ? "bg-glacier" : "bg-panel text-muted"} ${n === 0 && !pending ? "line-through" : ""}`}
                aria-pressed={on}
                title={report?.error ?? (n === 0 ? "Aucun total de séjour pour ce relevé." : `${n} logement${n > 1 ? "s" : ""}`)}
                onClick={() => {
                  if (n === 0) return;
                  setOff((cur) => (on ? [...cur, s] : cur.filter((x) => x !== s)));
                }}
              >
                {s}
                {pending ? " …" : n === 0 ? " · 0" : ` · ${n}`}
              </button>
            );
          })}
          <span className="text-muted">
            {searching ? "relevé en cours" : `${list.length} à l’écran`}
            {ratio != null ? ` · grille ${ratio}% viewport` : ""}
          </span>
        </>
      }
    >
      <div className="grid flex-1 items-start gap-4 px-4 py-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(560px,1.3fr)]">
        <div
          ref={grid}
          className="listings grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-2"
          data-testid="listings"
        >
          {searching && list.length === 0 ? (
            <p className="col-span-full self-start text-muted">
              Relevé live : Gîtes de France, Abritel, Airbnb, Booking. Totaux de séjour seulement.
            </p>
          ) : list.length === 0 ? (
            <p className="col-span-full self-start text-muted">
              Aucun total de séjour confirmé pour ces dates. Les sources qui ont échoué restent à 0 — rien n’est inventé.
            </p>
          ) : (
            list.map((l) => <LodgingCard key={l.id} listing={l} onOpen={setFicheId} />)
          )}
        </div>
        {station ? (
          <MapPanel
            lat={station.lat}
            lon={station.lon}
            zoom={13}
            label={station.name}
            pins={list
              .filter((l): l is Listing & { lat: number; lon: number } => l.lat != null && l.lon != null)
              .map((l) => ({ id: l.id, lat: l.lat, lon: l.lon, title: l.title }))}
          />
        ) : null}
      </div>
      {ficheId && raw.find((l) => l.id === ficheId) ? (
        <LodgeSheet listing={raw.find((l) => l.id === ficheId)!} onClose={() => setFicheId(null)} />
      ) : null}
    </AppShell>
  );
}
