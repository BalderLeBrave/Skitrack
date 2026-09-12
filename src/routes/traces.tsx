import { createFileRoute, Link } from "@tanstack/react-router";
import { Map as MapIcon, Mountain, Table2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ElevationProfile } from "@/components/ElevationProfile";
import { GpxDrop } from "@/components/GpxDrop";
import { LodgeSheet } from "@/components/LodgeSheet";
import { MapPanel } from "@/components/MapPanel";
import { distToGpxM, formatPerPerson } from "@/lib/accommodation";
import { formatDistFrom, formatLift, sectorOf, skiAccessLabel } from "@/lib/access";
import { formatEle, formatDuration, formatKm } from "@/lib/gpx";
import { formatEuro, listingsForStay, type Listing } from "@/lib/listings";
import { stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { useTrack } from "@/lib/track";

export const Route = createFileRoute("/traces")({ component: Traces });

type Tab = "trace" | "carte" | "logements";
type SortKey = "gpx" | "pistes" | "lift" | "total" | "pp";

function Traces() {
  const stationId = useStay((s) => s.stationId);
  const guests = useStay((s) => s.guests);
  const bedrooms = useStay((s) => s.bedrooms);
  const live = useStay((s) => s.liveListings);
  const station = stationById(stationId);
  const stats = useTrack((s) => s.stats);
  const points = useTrack((s) => s.points);
  const fileName = useTrack((s) => s.fileName);
  const clear = useTrack((s) => s.clear);
  const [tab, setTab] = useState<Tab>("trace");
  const [sort, setSort] = useState<SortKey>("gpx");
  const [ficheId, setFicheId] = useState<string | null>(null);

  const frozen = useMemo(
    () => listingsForStay(stationId, guests, bedrooms),
    [stationId, guests, bedrooms],
  );
  const raw = live ?? frozen;
  const rows = useMemo(() => {
    const scored = raw.map((l) => ({ listing: l, gpxM: distToGpxM(l) }));
    scored.sort((a, b) => {
      if (sort === "total") return a.listing.total - b.listing.total;
      if (sort === "pp") {
        return a.listing.total / Math.max(1, guests) - b.listing.total / Math.max(1, guests);
      }
      if (sort === "pistes") {
        const am = a.listing.distToSlopesM ?? Number.POSITIVE_INFINITY;
        const bm = b.listing.distToSlopesM ?? Number.POSITIVE_INFINITY;
        return am - bm;
      }
      if (sort === "lift") {
        const am = a.listing.distToLiftM ?? Number.POSITIVE_INFINITY;
        const bm = b.listing.distToLiftM ?? Number.POSITIVE_INFINITY;
        return am - bm;
      }
      const am = a.gpxM ?? Number.POSITIVE_INFINITY;
      const bm = b.gpxM ?? Number.POSITIVE_INFINITY;
      return am - bm;
    });
    return scored;
  }, [raw, sort, guests, points, stats]);

  const fiche = ficheId ? raw.find((l) => l.id === ficheId) : undefined;
  const mapCenter = stats?.start ?? (station ? { lat: station.lat, lon: station.lon } : null);

  return (
    <AppShell
      chips={
        <>
          <span className="rounded-full bg-glacier px-3 py-1">{station?.name ?? stationId}</span>
          {stats ? (
            <>
              <span className="rounded-full bg-glacier px-3 py-1">{stats.name}</span>
              <span className="rounded-full bg-glacier px-3 py-1">{formatKm(stats.km)}</span>
              <span className="rounded-full bg-glacier px-3 py-1">
                D+ {formatEle(stats.dPlusM)}
              </span>
            </>
          ) : (
            <span className="text-muted">Aucune trace chargée</span>
          )}
        </>
      }
    >
      <div className="flex gap-2 border-b border-line px-4 py-2 lg:hidden">
        {(
          [
            ["trace", "Trace", Mountain],
            ["carte", "Carte", MapIcon],
            ["logements", "Logements", Table2],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={`inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm ${tab === id ? "bg-glacier font-semibold" : "text-muted"}`}
            onClick={() => setTab(id)}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div className="grid flex-1 items-start gap-4 px-4 py-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.15fr)]">
        <div className={`${tab === "carte" ? "hidden lg:block" : ""} grid gap-4`}>
          <section
            className={`rounded-[var(--radius-card)] bg-panel p-4 ${tab === "logements" ? "hidden lg:block" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl tracking-tight">Trace GPX</h1>
                <p className="mt-1 text-sm text-muted">
                  Distance, D+ / D− et profil : uniquement ce que le fichier contient.
                </p>
              </div>
              {stats ? (
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-1 rounded-full border border-line px-3 text-sm"
                  onClick={clear}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Retirer
                </button>
              ) : null}
            </div>
            <div className="mt-4">
              <GpxDrop />
            </div>
            {stats ? (
              <dl className="gpx-stats mt-4" data-testid="gpx-stats">
                <div>
                  <dt>Fichier</dt>
                  <dd>{fileName}</dd>
                </div>
                <div>
                  <dt>Distance</dt>
                  <dd>{formatKm(stats.km)}</dd>
                </div>
                <div>
                  <dt>D+</dt>
                  <dd>{formatEle(stats.dPlusM)}</dd>
                </div>
                <div>
                  <dt>D−</dt>
                  <dd>{formatEle(stats.dMinusM)}</dd>
                </div>
                <div>
                  <dt>Altitude</dt>
                  <dd>
                    {stats.eleMin == null
                      ? "non mesurée"
                      : `${formatEle(stats.eleMin)} → ${formatEle(stats.eleMax)}`}
                  </dd>
                </div>
                <div>
                  <dt>Durée</dt>
                  <dd>{formatDuration(stats.durationSec)}</dd>
                </div>
                <div>
                  <dt>Vitesse moy.</dt>
                  <dd>
                    {stats.speedKmh == null
                      ? "non mesurée"
                      : `${stats.speedKmh.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km/h`}
                  </dd>
                </div>
                <div>
                  <dt>Points</dt>
                  <dd>{stats.points.toLocaleString("fr-FR")}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted">
                Aucune trace. Les logements ci-dessous viennent du relevé de séjour, pas d’un jeu
                inventé.
              </p>
            )}
            {points.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                  Profil d’altitude
                </p>
                <ElevationProfile points={points} />
              </div>
            ) : null}
          </section>

          <section
            className={`rounded-[var(--radius-card)] bg-panel p-4 ${tab === "trace" ? "hidden lg:block" : ""}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl">Logements et départ</h2>
              <p className="text-sm text-muted">
                {raw.length === 0 ? "Aucun logement dans ce relevé." : `${raw.length} fiches`}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ["gpx", "Trace GPX"],
                  ["lift", "Remontée"],
                  ["pistes", "Remontées mécaniques"],
                  ["total", "Prix séjour"],
                  ["pp", "Prix / pers."],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`rounded-full px-3 py-1.5 text-sm ${sort === id ? "bg-glacier font-semibold" : "border border-line text-muted"}`}
                  onClick={() => setSort(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {rows.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                Pas de relevé pour ces dates. Lancez une recherche logements, ou{" "}
                <Link to="/logements" className="underline">
                  ouvrez la liste
                </Link>
                .
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="gpx-table">
                  <thead>
                    <tr>
                      <th>Logement</th>
                      <th>Séjour</th>
                      <th>/ pers.</th>
                      <th>Lieu</th>
                      <th>Remontée</th>
                      <th>Trace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 40).map(({ listing, gpxM }) => (
                      <tr key={listing.id}>
                        <td>
                          <button
                            type="button"
                            className="text-left font-medium"
                            onClick={() => setFicheId(listing.id)}
                          >
                            {listing.title}
                          </button>
                          <p className="text-xs text-muted">
                            {listing.source}
                            {listing.bedrooms != null ? ` · ${listing.bedrooms} ch.` : ""}
                            {listing.guests != null ? ` · ${listing.guests} pers.` : ""}
                          </p>
                        </td>
                        <td>{formatEuro(listing.total)}</td>
                        <td>{formatPerPerson(listing.total, guests)}</td>
                        <td>{sectorOf(listing) ?? "–"}</td>
                        <td>
                          {skiAccessLabel(listing.distToLiftM) ? (
                            <span className="block text-xs font-semibold">
                              {skiAccessLabel(listing.distToLiftM)}
                            </span>
                          ) : null}
                          {formatLift(listing)}
                        </td>
                        <td>
                          {stats
                            ? gpxM == null
                              ? "GPS logement manquant"
                              : formatDistFrom(gpxM, "de la trace")
                            : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {mapCenter ? (
          <div className={tab === "trace" || tab === "logements" ? "hidden lg:block" : ""}>
            <MapPanel
              lat={mapCenter.lat}
              lon={mapCenter.lon}
              zoom={stats ? 13 : 12}
              label={stats ? "Départ GPX" : station?.name}
              track={points}
              pins={raw
                .filter(
                  (l): l is Listing & { lat: number; lon: number } =>
                    l.lat != null && l.lon != null,
                )
                .map((l) => ({
                  id: l.id,
                  lat: l.lat,
                  lon: l.lon,
                  title: l.title,
                  hint: `${formatEuro(l.total)} · ${sectorOf(l) ?? l.source} · ${formatLift(l)}`,
                }))}
            />
          </div>
        ) : null}
      </div>
      {fiche ? <LodgeSheet listing={fiche} onClose={() => setFicheId(null)} /> : null}
    </AppShell>
  );
}
