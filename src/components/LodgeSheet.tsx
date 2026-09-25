import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { distToGpxM, distToGpxStartM } from "@/lib/accommodation";
import { formatDistFrom, formatLift, formatLiftSpan, otherDomainMessage, sectorOf, skiAccessLabel } from "@/lib/access";
import { listingEleM, useElevations } from "@/lib/elevations";
import { formatEuro, type Listing } from "@/lib/listings";
import { provenancePhrase, sourcePhrase } from "@/lib/provenance";
import { datesCourtes, nuitsLbl } from "@/lib/parcours";
import { completudeOf, galerieOf, trouLbl } from "@/lib/stay/completude";
import { availabilityLabel, availabilityOf } from "@/lib/stay/availability";
import { bedLbl, capLbl, prixLbl } from "@/lib/v7";
import { getListingElevation } from "@/lib/snow/api";
import { formatAlt, stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { useTrack } from "@/lib/track";

/**
 * « de Tignes », « d’Avoriaz », « des Gets », « du Corbier », « de l’Alpe
 * d’Huez ». Un « de » collé devant le nom écrivait « de Les Gets » et « de
 * Avoriaz ». Mêmes règles d’article que `aStation`.
 */
function deStation(nom: string): string {
  const n = nom.trim();
  if (/^les /i.test(n)) return `des ${n.slice(4)}`;
  if (/^le /i.test(n)) return `du ${n.slice(3)}`;
  if (/^l['’]/i.test(n)) return `de l’${n.slice(2)}`;
  if (/^alpes? /i.test(n)) return `de l’${n}`;
  if (/^[aeiouàâéèêîïôû]/i.test(n)) return `d’${n}`;
  return `de ${n}`;
}

export function GalerieAnnonce({
  urls,
  index,
  onIndex,
}: {
  urls: string[];
  index: number;
  onIndex: (i: number) => void;
}) {
  if (urls.length < 2) return null;
  return (
    <div className="galerie7" role="tablist" aria-label="Photos de l’annonce">
      {urls.map((u, i) => (
        <button
          type="button"
          key={u}
          role="tab"
          aria-selected={i === index}
          aria-current={i === index ? "true" : undefined}
          onClick={(e) => {
            e.stopPropagation();
            onIndex(i);
          }}
        >
          <img src={u} alt="" />
        </button>
      ))}
    </div>
  );
}

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
  const cachedEle = listingEleM(byKey, listing.lat, listing.lon);
  const [eleM, setEleM] = useState<number | null | undefined>(cachedEle);
  const [photoI, setPhotoI] = useState(0);
  const galerie = galerieOf(listing);
  const shown = galerie[photoI] ?? galerie[0] ?? null;
  const nights = Math.max(
    1,
    Math.round((Date.parse(stay.checkOut) - Date.parse(stay.checkIn)) / 86400000),
  );
  // `total: 0` veut dire « prix non publié » : diviser ce zéro rendait un
  // « 0 €/pers/nuit » que personne n'a écrit.
  const ppNuit =
    listing.total > 0 ? Math.round(listing.total / Math.max(1, stay.guests) / nights) : null;
  const dispo = availabilityOf(listing, { checkIn: stay.checkIn, checkOut: stay.checkOut });
  const complet = completudeOf(listing);

  useEffect(() => {
    setPhotoI(0);
  }, [listing.id]);

  useEffect(() => {
    if (listing.lat == null || listing.lon == null) {
      setEleM(null);
      return;
    }
    const hit = listingEleM(useElevations.getState().byKey, listing.lat, listing.lon);
    if (hit !== undefined) {
      setEleM(hit);
      return;
    }
    let cancelled = false;
    setEleM(undefined);
    void getListingElevation({ data: { lat: listing.lat, lon: listing.lon } }).then((r) => {
      if (cancelled) return;
      setEleM(r.eleM);
      useElevations.getState().put([{ lat: listing.lat!, lon: listing.lon!, eleM: r.eleM }]);
    });
    return () => {
      cancelled = true;
    };
  }, [listing.lat, listing.lon]);

  const altitude = listing.lat == null || listing.lon == null ? "no-gps" : eleM !== undefined ? eleM : cachedEle;

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
            {station?.name ?? listing.stationId} · {datesCourtes(stay.checkIn, stay.checkOut)} · {stay.guests} pers.
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
            {shown ? (
              <img src={shown} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex items-end p-6 text-muted">Pas de photo dans l’annonce {listing.source}</div>
            )}
            <div className="grid gap-2 border-t border-line bg-panel p-5">
              <GalerieAnnonce urls={galerie} index={photoI} onIndex={setPhotoI} />
              <p className="font-display text-titre">{prixLbl(listing)}</p>
              <p className="text-corps text-muted">
                {nuitsLbl(nights)} · {stay.guests} pers.
                {ppNuit != null ? ` · ${formatEuro(ppNuit)} par personne et par nuit` : " · prix non publié"}
              </p>
              {listing.priceIndicative ? (
                <p className="text-note text-muted">Annoncé « à partir de » : ce n’est pas un total de séjour.</p>
              ) : null}
              <p className="text-note font-medium text-ink">{availabilityLabel(dispo)}</p>
            </div>
          </div>
          <div className="overflow-auto p-6">
            <p className="text-note text-muted">Vérifications</p>
            <ul className="mt-3 grid gap-2 text-corps">
              <li>
                <strong>Dates du relevé</strong> : {datesCourtes(stay.checkIn, stay.checkOut)}
                <span>, alignées sur votre séjour</span>
              </li>
              <li>
                <strong>Prix</strong> :{" "}
                {listing.total > 0 ? formatEuro(listing.total) : "non publié par la source"}
                {" · "}
                {availabilityLabel(dispo).toLowerCase()}
                {listing.priceIndicative ? " · annoncé « à partir de », ce n’est pas un total de séjour" : ""}
              </li>
              {listing.priceLabel ? (
                <li>
                  <strong>Libellé de la source</strong> : « {listing.priceLabel} »
                </li>
              ) : null}
              <li>{sourcePhrase(listing)}</li>
              {listing.rating != null ? (
                <li>
                  <strong>Note publiée</strong> : {listing.rating.toLocaleString("fr-FR")}
                  {listing.reviewCount != null ? ` (${listing.reviewCount} avis)` : ""}
                  {", telle que la source l’affiche, jamais recalculée."}
                </li>
              ) : null}
              <li>
                <strong>Capacité</strong> : {capLbl(listing)} · {bedLbl(listing)}
                {listing.beds != null ? ` · ${listing.beds} lit${listing.beds > 1 ? "s" : ""}` : ""}
                {listing.baths != null
                  ? ` · ${listing.baths} salle${listing.baths > 1 ? "s" : ""} de bain`
                  : ""}
              </li>
              {!complet.ok ? (
                <li>
                  <strong>Fiche incomplète</strong> : {complet.trous.map(trouLbl).join(" · ")}
                </li>
              ) : null}
              <li>
                <strong>Lieu</strong> : {sectorOf(listing) ?? "non publié"}
                {listing.locality
                  ? " (commune de l’annonce)."
                  : listing.placeName
                    ? " (lieu le plus proche de la position GPS, d’après OpenStreetMap)."
                    : " (pas de position GPS publiée)."}
              </li>
              {other ? (
                <li data-testid="other-domain">
                  <strong>Domaine</strong> : {other}
                </li>
              ) : null}
              {other && listing.distToNearestDomainM != null ? (
                <li>
                  <strong>Station la plus proche</strong> :{" "}
                  {formatDistFrom(
                    listing.distToNearestDomainM,
                    listing.nearestDomainName ? deStation(listing.nearestDomainName) : "de la station",
                  )}
                  {" (repère de la station, pas une piste)."}
                </li>
              ) : null}
              {other && listing.searchedLiftM != null ? (
                <li>
                  <strong>À vol d’oiseau vers {station?.name}</strong> :{" "}
                  {formatDistFrom(listing.searchedLiftM, listing.searchedLiftName ? `de ${listing.searchedLiftName}` : "des remontées du domaine recherché")}
                  {" (hors domaine, ne compte pas comme accès ski)."}
                </li>
              ) : null}
              {!other ? (
                <li>
                  <strong>Accès ski</strong> : {ski ?? "non classé"}
                  {listing.distToLiftM != null
                    ? " (d’après la distance mesurée sur OpenStreetMap, pas un temps de trajet)."
                    : " (pas de position GPS, ou aucune remontée OpenStreetMap autour de la station)."}
                </li>
              ) : null}
              {!other ? (
                <li>
                  <strong>Distance aux remontées mécaniques</strong> : {formatLift(listing)}
                  {listing.distToLiftM != null
                    ? " (gare OpenStreetMap la plus proche de la position GPS, dans le domaine recherché)."
                    : " (pas de position GPS, ou aucune remontée OpenStreetMap autour de la station)."}
                </li>
              ) : null}
              <li>
                <strong>Arrivée de la remontée</strong> : {span ?? "non mesurée"}
                {span
                  ? " (altitudes calculées des deux gares OpenStreetMap ; la plus haute est l’arrivée)."
                  : " (les deux gares n’ont pas encore d’altitude calculée)."}
              </li>
              <li>
                <strong>Station recherchée</strong> :{" "}
                {formatDistFrom(
                  listing.distToSlopesM,
                  station ? `du repère ${deStation(station.name)}` : "du repère de la station",
                )}
                {listing.lat == null || listing.lon == null
                  ? " (pas de position GPS publiée)."
                  : " (de la position GPS de l’annonce au repère, qui n’est ni une piste ni un domaine)."}
              </li>
              <li>
                <strong>Trace GPX</strong> :{" "}
                {hasTrack
                  ? formatDistFrom(gpxM, "du point le plus proche")
                  : "distance non mesurée, aucune trace chargée"}
              </li>
              <li>
                <strong>Départ GPX</strong> :{" "}
                {start
                  ? formatDistFrom(gpxStartM, "du départ")
                  : "distance non mesurée, aucune trace chargée"}
              </li>
              <li>
                <strong>Altitude du logement</strong> :{" "}
                {altitude === "no-gps"
                  ? "non mesurée, pas de position GPS publiée"
                  : altitude === undefined
                    ? "calcul en cours…"
                    : altitude == null
                      ? "non mesurée, service d’altitude injoignable"
                      : `${formatAlt(altitude)} (modèle Open-Meteo / Copernicus)`}
              </li>
            </ul>
            <p className="mt-6 text-corps text-muted">{provenancePhrase(listing)}</p>
            {listing.proven ? (
              <details className="mt-2 text-note text-muted">
                <summary className="cursor-pointer">Détail technique</summary>
                <p className="mt-1 font-mono">{listing.proven}</p>
              </details>
            ) : null}
            {listing.url && (
              <a
                href={listing.url}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex text-corps font-semibold text-ink underline"
              >
                Ouvrir sur {listing.source}
                <Icon name="externe" taille={12} />
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
