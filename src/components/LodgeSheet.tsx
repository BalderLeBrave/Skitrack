import { useEffect, useState } from "react";
import { distToGpxM, distToGpxStartM } from "@/lib/accommodation";
import { formatDistFrom, formatLift, formatLiftSpan, otherDomainMessage, sectorOf, skiAccessLabel } from "@/lib/access";
import { listingEleM, useElevations } from "@/lib/elevations";
import { formatEuro, type Listing } from "@/lib/listings";
import { getListingElevation } from "@/lib/snow/api";
import { formatAlt, stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { useTrack } from "@/lib/track";

export function LodgeSheet({
  listing,
  onClose,
}: {
  listing: Listing;
  onClose: () => void;
}) {
  const stay = useStay();
  const station = stationById(listing.stationId);
  const hasTrack = useTrack((s) => s.points.length > 0);
  const start = useTrack((s) => s.stats?.start);
  const gpxM = hasTrack ? distToGpxM(listing) : null;
  const gpxStartM = start ? distToGpxStartM(listing) : null;
  const ski = skiAccessLabel(listing.distToLiftM);
  const other = listing.domainFit === "other"
    ? otherDomainMessage(
        {
          searchedId: listing.stationId,
          nearestStationId: listing.nearestDomainId ?? null,
          nearestStationName: listing.nearestDomainName ?? null,
          distToSearchedPinM: listing.distToSlopesM ?? null,
          distToNearestPinM: listing.distToNearestDomainM ?? null,
          verdict: "other",
          winterBarrier: listing.winterBarrier ?? null,
        },
        station?.name ?? listing.stationId,
      )
    : null;
  const byKey = useElevations((s) => s.byKey);
  const span = formatLiftSpan(listing, (lat, lon) => listingEleM(byKey, lat, lon));
  const [eleM, setEleM] = useState<number | null | undefined>(undefined);
  const nights = Math.max(
    1,
    Math.round((Date.parse(stay.checkOut) - Date.parse(stay.checkIn)) / 86400000),
  );
  const pp = Math.round(listing.total / Math.max(1, stay.guests) / nights);

  useEffect(() => {
    if (listing.lat == null || listing.lon == null) {
      setEleM(null);
      return;
    }
    let cancelled = false;
    setEleM(undefined);
    void getListingElevation({ data: { lat: listing.lat, lon: listing.lon } }).then((r) => {
      if (!cancelled) setEleM(r.eleM);
    });
    return () => {
      cancelled = true;
    };
  }, [listing.lat, listing.lon]);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-4" data-testid="lodge-sheet">
      <button type="button" className="absolute inset-0 bg-ink/55 backdrop-blur-md" aria-label="Fermer" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="lodge-sheet-title"
        className="relative z-10 grid max-h-[min(860px,calc(100dvh-24px))] w-[min(1120px,calc(100vw-24px))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-surface bg-panel text-ink shadow-flottant"
      >
        <header className="relative border-b border-line px-6 py-4 pr-14">
          <p className="text-note text-muted">{listing.source}</p>
          <h2 id="lodge-sheet-title" className="font-display text-titre tracking-tight">
            {listing.title}
          </h2>
          <p className="mt-1 text-corps text-muted">
            {station?.name ?? listing.stationId} · {stay.checkIn} → {stay.checkOut} · {stay.guests} pers.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-line"
            data-testid="lodge-sheet-close"
            aria-label="Fermer"
          >
            ×
          </button>
        </header>
        <div className="grid min-h-0 overflow-hidden lg:grid-cols-[1.05fr_0.95fr]">
          <div className="grid min-h-0 grid-rows-[minmax(220px,1fr)_auto] bg-glacier">
            {listing.photo ? (
              <img src={listing.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex items-end p-6 text-muted">photo manquante — {listing.source}</div>
            )}
            <div className="grid gap-2 border-t border-line bg-panel p-5">
              <p className="font-display text-titre">{formatEuro(listing.total)}</p>
              <p className="text-corps text-muted">
                {nights} nuits · {stay.guests} pers. · {formatEuro(pp)} /pers/nuit
              </p>
              <p className="text-note font-medium text-ink">Prix ferme du séjour, relevé pour ces dates.</p>
            </div>
          </div>
          <div className="overflow-auto p-6">
            <p className="text-note text-muted">Ce que Skitrack a vérifié</p>
            <ul className="mt-3 grid gap-2 text-corps">
              <li>
                <strong>Dates du relevé</strong> : {stay.checkIn} → {stay.checkOut}
                <span> — alignées sur votre séjour</span>
              </li>
              <li>
                <strong>Prix</strong> : {formatEuro(listing.total)} · confirmé pour ces dates
              </li>
              <li>
                <strong>Source</strong> : {listing.source}
              </li>
              <li>
                <strong>Capacité</strong> :{" "}
                {listing.guests != null ? `${listing.guests} pers.` : "non annoncée"}
                {" · "}
                {listing.bedrooms != null ? `${listing.bedrooms} ch.` : "chambres non annoncées"}
              </li>
              <li>
                <strong>Lieu</strong> : {sectorOf(listing) ?? "non publié"}
                {listing.locality
                  ? " — commune de l’annonce."
                  : listing.placeName
                    ? " — lieu OSM le plus proche du GPS."
                    : " — pas de GPS publié."}
              </li>
              {other ? (
                <li data-testid="other-domain">
                  <strong>Domaine</strong> : {other}
                </li>
              ) : null}
              {other && listing.distToNearestDomainM != null ? (
                <li>
                  <strong>Station la plus proche</strong> :{" "}
                  {formatDistFrom(listing.distToNearestDomainM, `de ${listing.nearestDomainName}`)}
                  {" — pin de la fiche, pas une piste."}
                </li>
              ) : null}
              {other && listing.searchedLiftM != null ? (
                <li>
                  <strong>Vol d’oiseau vers {station?.name}</strong> :{" "}
                  {formatDistFrom(listing.searchedLiftM, listing.searchedLiftName ? `de ${listing.searchedLiftName}` : "des remontées du domaine recherché")}
                  {" — hors domaine, ne compte pas comme accès ski."}
                </li>
              ) : null}
              {!other ? (
                <li>
                  <strong>Accès ski</strong> : {ski ?? "non classé"}
                  {listing.distToLiftM != null
                    ? " — selon la distance OSM mesurée, pas des minutes."
                    : " — pas de GPS, ou pas de remontée OSM autour de la station."}
                </li>
              ) : null}
              {!other ? (
                <li>
                  <strong>Distance aux remontées mécaniques</strong> : {formatLift(listing)}
                  {listing.distToLiftM != null
                    ? " — gare OSM la plus proche du GPS, domaine recherché."
                    : " — pas de GPS, ou pas de remontée OSM autour de la station."}
                </li>
              ) : null}
              <li>
                <strong>Arrivée de la remontée</strong> : {span ?? "non mesurée"}
                {span
                  ? " — altitudes des deux gares OSM (modèle), la plus haute est l’arrivée."
                  : " — les deux gares OSM n’ont pas encore d’altitude modèle."}
              </li>
              <li>
                <strong>Repère station recherchée</strong> :{" "}
                {formatDistFrom(listing.distToSlopesM, `du pin ${station?.name ?? "station"}`)}
                {listing.lat == null || listing.lon == null
                  ? " — pas de GPS publié."
                  : " — GPS de l’annonce vers le pin de la fiche (pas une piste, pas un domaine)."}
              </li>
              <li>
                <strong>Trace GPX</strong> :{" "}
                {hasTrack
                  ? formatDistFrom(gpxM, "du plus proche point")
                  : "aucune trace chargée — non mesurée"}
              </li>
              <li>
                <strong>Départ GPX</strong> :{" "}
                {start
                  ? formatDistFrom(gpxStartM, "du départ")
                  : "aucune trace chargée — non mesurée"}
              </li>
              <li>
                <strong>Altitude du logement</strong> :{" "}
                {listing.lat == null || listing.lon == null
                  ? "non mesurée — pas de GPS publié"
                  : eleM === undefined
                    ? "modèle en cours…"
                    : eleM == null
                      ? "non mesurée — modèle injoignable"
                      : `${formatAlt(eleM)} (modèle Open-Meteo / Copernicus)`}
              </li>
            </ul>
            <p className="mt-6 text-corps text-muted">{listing.proven}</p>
            {listing.url && (
              <a
                href={listing.url}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex text-corps font-semibold text-ink underline"
              >
                Ouvrir sur {listing.source} ↗
              </a>
            )}
          </div>
        </div>
        <footer className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-full border border-line px-4 py-2 text-corps">
            Fermer
          </button>
          <span className="flex-1" />
          <a
            href={`/reservation/${listing.id}`}
            className="inline-flex h-11 items-center rounded-surface bg-cta px-5 text-corps font-semibold text-cta-ink"
          >
            Réserver
          </a>
        </footer>
      </aside>
    </div>
  );
}
