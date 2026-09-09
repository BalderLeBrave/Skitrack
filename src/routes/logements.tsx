import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LodgeSheet } from "@/components/LodgeSheet";
import { LodgingCard } from "@/components/LodgingCard";
import { MapPanel, type MapPin } from "@/components/MapPanel";
import { distToGpxM } from "@/lib/accommodation";
import { formatLift, isCabinLift, sectorOf, skiAccessLabel, withinLiftM } from "@/lib/access";
import { eleKey, listingEleM, useElevations } from "@/lib/elevations";
import { formatEuro, listingsForStay, type Listing } from "@/lib/listings";
import { searchStay } from "@/lib/searchStay";
import { getListingElevations } from "@/lib/snow/api";
import { stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { useTrack } from "@/lib/track";

export const Route = createFileRoute("/logements")({ component: Logements });

const ALL_SOURCES: Listing["source"][] = [
  "Airbnb",
  "Booking",
  "Abritel",
  "Gîtes de France",
  "Centrale",
];

function uniqueLiftPins(list: Listing[]): MapPin[] {
  const seen = new Set<string>();
  const out: MapPin[] = [];
  const add = (
    lat: number,
    lon: number,
    title: string,
    hint: string,
    kind: "lift" | "lift-top",
  ) => {
    const k = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (seen.has(k) || out.length >= 40) return;
    seen.add(k);
    out.push({ id: `lift-${k}`, lat, lon, title, hint, kind });
  };
  for (const l of list) {
    if (l.liftLat == null || l.liftLon == null) continue;
    const name = l.liftName ?? "Remontée OSM";
    add(l.liftLat, l.liftLon, name, `${name} · gare OSM`, "lift");
    if (l.liftOtherLat != null && l.liftOtherLon != null) {
      add(l.liftOtherLat, l.liftOtherLon, name, `${name} · autre gare OSM`, "lift-top");
    }
  }
  return out;
}

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
  const trackPoints = useTrack((s) => s.points);
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
  const [sort, setSort] = useState<"total" | "lift" | "gpx" | "ele">("total");
  const [liftMax, setLiftMax] = useState<number | null>(null);
  const [villageOnly, setVillageOnly] = useState(false);
  const [cabinOnly, setCabinOnly] = useState(false);
  const hasTrack = trackPoints.length > 0;
  const byKey = useElevations((s) => s.byKey);
  const putEle = useElevations((s) => s.put);
  const list = useMemo(() => {
    const rows = raw.filter((l) => !off.includes(l.source));
    let kept = liftMax != null ? rows.filter((l) => withinLiftM(l, liftMax)) : rows;
    if (villageOnly && station) {
      kept = kept.filter((l) => {
        const ele = listingEleM(byKey, l.lat, l.lon);
        return ele != null && ele >= station.villageM;
      });
    }
    if (cabinOnly) kept = kept.filter((l) => isCabinLift(l.liftKind));
    const copy = [...kept];
    if (sort === "lift") {
      copy.sort(
        (a, b) =>
          (a.distToLiftM ?? Number.POSITIVE_INFINITY) - (b.distToLiftM ?? Number.POSITIVE_INFINITY),
      );
    } else if (sort === "gpx") {
      copy.sort((a, b) => {
        const am = distToGpxM(a) ?? Number.POSITIVE_INFINITY;
        const bm = distToGpxM(b) ?? Number.POSITIVE_INFINITY;
        return am - bm;
      });
    } else if (sort === "ele") {
      copy.sort((a, b) => {
        const ae = listingEleM(byKey, a.lat, a.lon) ?? Number.NEGATIVE_INFINITY;
        const be = listingEleM(byKey, b.lat, b.lon) ?? Number.NEGATIVE_INFINITY;
        return be - ae;
      });
    } else {
      copy.sort((a, b) => a.total - b.total);
    }
    return copy;
  }, [raw, off, sort, liftMax, trackPoints, villageOnly, cabinOnly, station, byKey]);
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

  useEffect(() => {
    const pts: { lat: number; lon: number }[] = [];
    const seen = new Set<string>();
    const consider = (lat: number | null | undefined, lon: number | null | undefined) => {
      if (lat == null || lon == null || pts.length >= 80) return;
      const k = eleKey(lat, lon);
      if (seen.has(k) || k in byKey) return;
      seen.add(k);
      pts.push({ lat, lon });
    };
    for (const l of raw) {
      consider(l.lat, l.lon);
      consider(l.liftLat, l.liftLon);
      consider(l.liftOtherLat, l.liftOtherLon);
    }
    if (pts.length === 0) return;
    let cancelled = false;
    void getListingElevations({ data: { points: pts } }).then((rows) => {
      if (!cancelled) putEle(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [raw, byKey, putEle]);

  const mapPins = useMemo(() => {
    const stays: MapPin[] = list
      .filter((l): l is Listing & { lat: number; lon: number } => l.lat != null && l.lon != null)
      .map((l) => ({
        id: l.id,
        lat: l.lat,
        lon: l.lon,
        title: l.title,
        hint: `${formatEuro(l.total)} · ${sectorOf(l) ?? l.source} · ${skiAccessLabel(l.distToLiftM) ?? (l.distToLiftM != null ? formatLift(l) : "remontée non mesurée")}`,
        kind: "listing" as const,
      }));
    return [...stays, ...uniqueLiftPins(list)];
  }, [list]);

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
          <button
            type="button"
            className={`rounded-full px-3 py-1 ${sort === "total" ? "bg-glacier" : "bg-panel text-muted"}`}
            aria-pressed={sort === "total"}
            onClick={() => setSort("total")}
          >
            Prix
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 ${sort === "lift" ? "bg-glacier" : "bg-panel text-muted"}`}
            aria-pressed={sort === "lift"}
            onClick={() => setSort("lift")}
          >
            Remontée
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 ${sort === "ele" ? "bg-glacier" : "bg-panel text-muted"}`}
            aria-pressed={sort === "ele"}
            onClick={() => setSort("ele")}
          >
            Plus haut
          </button>
          {hasTrack ? (
            <button
              type="button"
              className={`rounded-full px-3 py-1 ${sort === "gpx" ? "bg-glacier" : "bg-panel text-muted"}`}
              aria-pressed={sort === "gpx"}
              onClick={() => setSort("gpx")}
            >
              Trace GPX
            </button>
          ) : null}
          {(
            [
              [null, "Toutes distances"],
              [200, "Au pied"],
              [500, "≤ 500 m"],
              [1000, "≤ 1 km"],
            ] as const
          ).map(([max, label]) => (
            <button
              key={label}
              type="button"
              className={`rounded-full px-3 py-1 ${liftMax === max ? "bg-glacier" : "bg-panel text-muted"}`}
              aria-pressed={liftMax === max}
              onClick={() => setLiftMax(max)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className={`rounded-full px-3 py-1 ${villageOnly ? "bg-glacier" : "bg-panel text-muted"}`}
            aria-pressed={villageOnly}
            onClick={() => setVillageOnly((v) => !v)}
          >
            Altitude village
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 ${cabinOnly ? "bg-glacier" : "bg-panel text-muted"}`}
            aria-pressed={cabinOnly}
            onClick={() => setCabinOnly((v) => !v)}
          >
            Télécabine
          </button>
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
            track={trackPoints}
            pins={mapPins}
          />
        ) : null}
      </div>
      {ficheId && raw.find((l) => l.id === ficheId) ? (
        <LodgeSheet listing={raw.find((l) => l.id === ficheId)!} onClose={() => setFicheId(null)} />
      ) : null}
    </AppShell>
  );
}
