import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { ElevationProfile } from "@/components/ElevationProfile";
import { GpxDrop } from "@/components/GpxDrop";
import { LodgeSheet } from "@/components/LodgeSheet";
import { SensTri } from "@/components/v7/SensTri";
import { Carte } from "@/components/Carte";
import { distToGpxM, formatPerPerson } from "@/lib/accommodation";
import { formatDistFrom, formatLift, sectorOf, skiAccessLabel } from "@/lib/access";
import { formatEle, formatDuration, formatKm } from "@/lib/gpx";
import { formatEuro, listingsForStay, type Listing } from "@/lib/listings";
import { enrichirListing } from "@/lib/stay/enrichir";
import { stationById } from "@/lib/stations";
import { useParcours } from "@/lib/parcours";
import { useStay } from "@/lib/stay";
import { useTrack } from "@/lib/track";
import { parMesure, type Sens } from "@/lib/tri";
import { bedNomme, capNomme } from "@/lib/v7";
import { langueIntl } from "@/lib/i18n/langue";
import { tr, trN } from "@/lib/i18n";

export const Route = createFileRoute("/traces")({ component: Traces });

type Tab = "trace" | "carte" | "logements";
type SortKey = "gpx" | "pistes" | "lift" | "total" | "pp";

function Traces() {
  // La station courante n'a qu'une source : le parcours.
  const stationId = useParcours((s) => s.stationId);
  const guests = useStay((s) => s.guests);
  const bedrooms = useStay((s) => s.bedrooms);
  const live = useStay((s) => s.liveListings);
  const station = stationId ? stationById(stationId) : undefined;
  const stats = useTrack((s) => s.stats);
  const points = useTrack((s) => s.points);
  const fileName = useTrack((s) => s.fileName);
  const clear = useTrack((s) => s.clear);
  const [tab, setTab] = useState<Tab>("trace");
  const [sort, setSort] = useState<SortKey>("gpx");
  // Le plus près et le moins cher d'abord ; le bouton de sens inverse.
  const [sens, setSens] = useState<Sens>(1);
  const [ficheId, setFicheId] = useState<string | null>(null);

  const frozen = useMemo(
    () => (stationId ? listingsForStay(stationId, guests, bedrooms).map(enrichirListing) : []),
    [stationId, guests, bedrooms],
  );
  const raw = live ?? frozen;
  const rows = useMemo(() => {
    const scored = raw.map((l) => ({ listing: l, gpxM: distToGpxM(l, points) }));
    // Un prix non publié (`total` à zéro) ou une distance inconnue reste en
    // queue, dans les deux sens.
    const prix = (l: Listing) => (l.total > 0 ? l.total : null);
    const valeur = (x: (typeof scored)[number]): number | null => {
      if (sort === "total") return prix(x.listing);
      if (sort === "pp") {
        const t = prix(x.listing);
        return t == null ? null : t / Math.max(1, guests);
      }
      if (sort === "pistes") return x.listing.distToSlopesM ?? null;
      if (sort === "lift") return x.listing.distToLiftM ?? null;
      return x.gpxM ?? null;
    };
    scored.sort((a, b) => parMesure(valeur(a), valeur(b), sens));
    return scored;
  }, [raw, sort, sens, guests, points]);

  const fiche = ficheId ? raw.find((l) => l.id === ficheId) : undefined;
  const mapCenter = stats?.start ?? (station ? { lat: station.lat, lon: station.lon } : null);

  return (
    <Coquille
      chips={
        <>
          <span className="rounded-full bg-glacier px-3 py-1">
            {station?.name ?? tr("Aucune station retenue")}
          </span>
          {stats ? (
            <>
              <span className="rounded-full bg-glacier px-3 py-1">{stats.name}</span>
              <span className="rounded-full bg-glacier px-3 py-1">{formatKm(stats.km)}</span>
              <span className="rounded-full bg-glacier px-3 py-1">
                D+ {formatEle(stats.dPlusM)}
              </span>
            </>
          ) : (
            <span className="text-muted">{tr("Aucune trace chargée")}</span>
          )}
        </>
      }
    >
      <div className="flex gap-2 border-b border-line px-4 py-2 lg:hidden">
        {(
          [
            ["trace", tr("Trace"), "montagne"],
            ["carte", tr("Carte"), "carte"],
            ["logements", tr("Logements"), "tableau"],
          ] as const
        ).map(([id, label, icone]) => (
          <button
            key={id}
            type="button"
            className={`inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-surface text-corps ${tab === id ? "bg-glacier font-semibold" : "text-muted"}`}
            onClick={() => setTab(id)}
          >
            <Icon name={icone} className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="grid flex-1 items-start gap-4 px-4 py-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.15fr)]">
        <div className={`${tab === "carte" ? "hidden lg:block" : ""} grid gap-4`}>
          <section
            className={`rounded-surface bg-panel p-4 ${tab === "logements" ? "hidden lg:block" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-titre tracking-tight">{tr("Trace GPX")}</h1>
                <p className="mt-1 text-corps text-muted">
                  {tr("Distance, D+ / D− et profil : uniquement ce que le fichier contient.")}
                </p>
              </div>
              {stats ? (
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-1 rounded-full border border-line px-3 text-corps"
                  onClick={clear}
                >
                  <Icon name="corbeille" className="size-4" aria-hidden />
                  {tr("Retirer")}
                </button>
              ) : null}
            </div>
            <div className="mt-4">
              <GpxDrop />
            </div>
            {stats ? (
              <dl className="gpx-stats mt-4" data-testid="gpx-stats">
                <div>
                  <dt>{tr("Fichier")}</dt>
                  <dd>{fileName}</dd>
                </div>
                <div>
                  <dt>{tr("Distance")}</dt>
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
                  <dt>{tr("Altitude")}</dt>
                  <dd>
                    {stats.eleMin == null
                      ? tr("non mesurée")
                      : `${formatEle(stats.eleMin)} → ${formatEle(stats.eleMax)}`}
                  </dd>
                </div>
                <div>
                  <dt>{tr("Durée")}</dt>
                  <dd>{formatDuration(stats.durationSec)}</dd>
                </div>
                <div>
                  <dt>{tr("Vitesse moy.")}</dt>
                  <dd>
                    {stats.speedKmh == null
                      ? tr("non mesurée")
                      : `${stats.speedKmh.toLocaleString(langueIntl(), { maximumFractionDigits: 1 })} km/h`}
                  </dd>
                </div>
                <div>
                  <dt>{tr("Points")}</dt>
                  <dd>{stats.points.toLocaleString(langueIntl())}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-corps text-muted">
                {tr(
                  "Aucune trace chargée. Déposez un fichier GPX pour classer les logements par distance à la trace.",
                )}
              </p>
            )}
            {points.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-note text-muted">{tr("Profil d’altitude")}</p>
                <ElevationProfile points={points} />
              </div>
            ) : null}
          </section>

          <section
            className={`rounded-surface bg-panel p-4 ${tab === "trace" ? "hidden lg:block" : ""}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-section">{tr("Logements et départ")}</h2>
              <p className="text-corps text-muted">
                {raw.length === 0
                  ? tr("Aucun logement dans ce relevé.")
                  : trN(raw.length, "{n} logement", "{n} logements")}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ["gpx", tr("Trace GPX")],
                  ["lift", tr("Remontée")],
                  ["pistes", tr("Pistes")],
                  ["total", tr("Prix du séjour")],
                  ["pp", tr("Prix / pers.")],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`rounded-full px-3 py-1.5 text-corps ${sort === id ? "bg-glacier font-semibold" : "border border-line text-muted"}`}
                  onClick={() => setSort(id)}
                >
                  {label}
                </button>
              ))}
              <SensTri className="sens7--petit" sens={sens} onChange={setSens} />
            </div>
            {rows.length === 0 ? (
              <p className="mt-4 text-corps text-muted">
                {tr("Pas de relevé pour ces dates. Lancez une recherche de logements ou")}{" "}
                <Link to="/logements" className="underline">
                  {tr("ouvrez la liste")}
                </Link>
                .
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="gpx-table">
                  <thead>
                    <tr>
                      <th>{tr("Logement")}</th>
                      <th>{tr("Séjour")}</th>
                      <th>{tr("/ pers.")}</th>
                      <th>{tr("Lieu")}</th>
                      <th>{tr("Remontée")}</th>
                      <th>{tr("Trace")}</th>
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
                          <p className="text-note text-muted">
                            {listing.source}
                            {` · ${bedNomme(listing)} · ${capNomme(listing)}`}
                          </p>
                        </td>
                        <td>{formatEuro(listing.total)}</td>
                        <td>{formatPerPerson(listing.total, guests)}</td>
                        <td>{sectorOf(listing) ?? "–"}</td>
                        <td>
                          {skiAccessLabel(listing.distToLiftM) ? (
                            <span className="block text-note font-semibold">
                              {skiAccessLabel(listing.distToLiftM)}
                            </span>
                          ) : null}
                          {formatLift(listing)}
                        </td>
                        <td>
                          {stats
                            ? gpxM == null
                              ? tr("Position du logement inconnue")
                              : formatDistFrom(gpxM, tr("de la trace"))
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
            <Carte
              className="traces__carte"
              centre={[mapCenter.lat, mapCenter.lon]}
              zoom={stats ? 13 : 12}
              trace={points}
              epingles={raw
                .filter(
                  (l): l is Listing & { lat: number; lon: number } =>
                    l.lat != null && l.lon != null,
                )
                .map((l) => ({
                  id: l.id,
                  lat: l.lat,
                  lon: l.lon,
                  titre: l.title,
                  detail: `${formatEuro(l.total)} · ${sectorOf(l) ?? l.source} · ${formatLift(l)}`,
                  sorte: "logement" as const,
                }))}
            />
          </div>
        ) : null}
      </div>
      {fiche ? <LodgeSheet listing={fiche} onClose={() => setFicheId(null)} /> : null}
    </Coquille>
  );
}
