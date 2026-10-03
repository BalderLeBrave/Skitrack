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
import { bedNomme, capLbl, persLbl, prixLbl } from "@/lib/v7";
import { getListingElevation } from "@/lib/snow/api";
import { formatAlt, stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { useTrack } from "@/lib/track";
import { langue, langueIntl } from "@/lib/i18n/langue";
import { tr, trN } from "@/lib/i18n";

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

/** « de Tignes », « d’Avoriaz » en français ; « from Tignes » en anglais. */
function depuisStation(nom: string): string {
  return langue() === "en" ? tr("de {lieu}", { lieu: nom.trim() }) : deStation(nom);
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
    <div className="galerie7" role="tablist" aria-label={tr("Photos de l’annonce")}>
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
      <button type="button" className="absolute inset-0 bg-ink/55 backdrop-blur-md" aria-label={tr("Fermer")} onClick={onClose} />
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
            {station?.name ?? listing.stationId} · {datesCourtes(stay.checkIn, stay.checkOut)} · {persLbl(stay.guests)}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-line"
            data-testid="lodge-sheet-close"
            aria-label={tr("Fermer")}
          >
            ×
          </button>
        </header>
        <div className="grid min-h-0 overflow-hidden lg:grid-cols-[1.05fr_0.95fr]">
          <div className="grid min-h-0 grid-rows-[minmax(220px,1fr)_auto] bg-glacier">
            {shown ? (
              <img src={shown} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex items-end p-6 text-muted">{tr("Pas de photo dans l’annonce {source}", { source: listing.source })}</div>
            )}
            <div className="grid gap-2 border-t border-line bg-panel p-5">
              <GalerieAnnonce urls={galerie} index={photoI} onIndex={setPhotoI} />
              <p className="font-display text-titre">{prixLbl(listing)}</p>
              <p className="text-corps text-muted">
                {nuitsLbl(nights)} · {persLbl(stay.guests)}
                {ppNuit != null
                  ? ` · ${tr("{prix} par personne et par nuit", { prix: formatEuro(ppNuit) })}`
                  : ` · ${tr("prix non publié")}`}
              </p>
              {listing.priceIndicative ? (
                <p className="text-note text-muted">{tr("Annoncé « à partir de » : ce n’est pas un total de séjour.")}</p>
              ) : null}
              <p className="text-note font-medium text-ink">{availabilityLabel(dispo)}</p>
            </div>
          </div>
          <div className="overflow-auto p-6">
            <p className="text-note text-muted">{tr("Vérifications")}</p>
            <ul className="mt-3 grid gap-2 text-corps">
              <li>
                <strong>{tr("Dates du relevé")}</strong>
                {tr(" : ")}
                {datesCourtes(stay.checkIn, stay.checkOut)}
                <span>{tr(", alignées sur votre séjour")}</span>
              </li>
              <li>
                <strong>{tr("Prix")}</strong>
                {tr(" : ")}
                {listing.total > 0 ? formatEuro(listing.total) : tr("non publié par la source")}
                {" · "}
                {availabilityLabel(dispo).toLowerCase()}
                {listing.priceIndicative ? ` · ${tr("annoncé « à partir de », ce n’est pas un total de séjour")}` : ""}
              </li>
              {listing.priceLabel ? (
                <li>
                  <strong>{tr("Libellé de la source")}</strong>
                  {tr(" : ")}« {listing.priceLabel} »
                </li>
              ) : null}
              <li>{sourcePhrase(listing)}</li>
              {listing.rating != null ? (
                <li>
                  <strong>{tr("Note publiée")}</strong>
                  {tr(" : ")}
                  {listing.rating.toLocaleString(langueIntl())}
                  {listing.reviewCount != null ? ` (${listing.reviewCount === 1 ? tr("1 avis") : tr("{n} avis", { n: listing.reviewCount })})` : ""}
                  {tr(", telle que la source l’affiche, jamais recalculée.")}
                </li>
              ) : null}
              <li>
                <strong>{tr("Capacité")}</strong>
                {tr(" : ")}
                {capLbl(listing)} · {bedNomme(listing)}
                {listing.beds != null ? ` · ${trN(listing.beds, "{n} lit", "{n} lits")}` : ""}
                {listing.baths != null
                  ? ` · ${trN(listing.baths, "{n} salle de bain", "{n} salles de bain")}`
                  : ""}
              </li>
              {!complet.ok ? (
                <li>
                  <strong>{tr("Fiche incomplète")}</strong>
                  {tr(" : ")}
                  {complet.trous.map(trouLbl).join(" · ")}
                </li>
              ) : null}
              <li>
                <strong>{tr("Lieu")}</strong>
                {tr(" : ")}
                {sectorOf(listing) ?? tr("non publié")}{" "}
                {listing.locality
                  ? tr("(commune de l’annonce).")
                  : listing.placeName
                    ? tr("(lieu le plus proche de la position GPS, d’après OpenStreetMap).")
                    : tr("(pas de position GPS publiée).")}
              </li>
              {other ? (
                <li data-testid="other-domain">
                  <strong>{tr("Domaine")}</strong>
                  {tr(" : ")}
                  {other}
                </li>
              ) : null}
              {other && listing.distToNearestDomainM != null ? (
                <li>
                  <strong>{tr("Station la plus proche")}</strong>
                  {tr(" : ")}
                  {formatDistFrom(
                    listing.distToNearestDomainM,
                    listing.nearestDomainName ? depuisStation(listing.nearestDomainName) : tr("de la station"),
                  )}{" "}
                  {tr("(repère de la station, pas une piste).")}
                </li>
              ) : null}
              {other && listing.searchedLiftM != null ? (
                <li>
                  <strong>{tr("À vol d’oiseau vers {station}", { station: station?.name ?? "" })}</strong>
                  {tr(" : ")}
                  {formatDistFrom(
                    listing.searchedLiftM,
                    listing.searchedLiftName
                      ? tr("de {lieu}", { lieu: listing.searchedLiftName })
                      : tr("des remontées du domaine recherché"),
                  )}{" "}
                  {tr("(hors domaine, ne compte pas comme accès ski).")}
                </li>
              ) : null}
              {!other ? (
                <li>
                  <strong>{tr("Accès ski")}</strong>
                  {tr(" : ")}
                  {ski ?? tr("non classé")}{" "}
                  {listing.distToLiftM != null
                    ? tr("(d’après la distance mesurée sur OpenStreetMap, pas un temps de trajet).")
                    : tr("(pas de position GPS, ou aucune remontée OpenStreetMap autour de la station).")}
                </li>
              ) : null}
              {!other ? (
                <li>
                  <strong>{tr("Distance aux remontées mécaniques")}</strong>
                  {tr(" : ")}
                  {formatLift(listing)}{" "}
                  {listing.distToLiftM != null
                    ? tr("(gare OpenStreetMap la plus proche de la position GPS, dans le domaine recherché).")
                    : tr("(pas de position GPS, ou aucune remontée OpenStreetMap autour de la station).")}
                </li>
              ) : null}
              <li>
                <strong>{tr("Arrivée de la remontée")}</strong>
                {tr(" : ")}
                {span ?? tr("non mesurée")}{" "}
                {span
                  ? tr("(altitudes calculées des deux gares OpenStreetMap ; la plus haute est l’arrivée).")
                  : tr("(les deux gares n’ont pas encore d’altitude calculée).")}
              </li>
              <li>
                <strong>{tr("Station recherchée")}</strong>
                {tr(" : ")}
                {formatDistFrom(
                  listing.distToSlopesM,
                  station
                    ? tr("du repère {station}", { station: langue() === "en" ? station.name : deStation(station.name) })
                    : tr("du repère de la station"),
                )}{" "}
                {listing.lat == null || listing.lon == null
                  ? tr("(pas de position GPS publiée).")
                  : tr("(de la position GPS de l’annonce au repère, qui n’est ni une piste ni un domaine).")}
              </li>
              <li>
                <strong>{tr("Trace GPX")}</strong>
                {tr(" : ")}
                {hasTrack
                  ? formatDistFrom(gpxM, tr("du point le plus proche"))
                  : tr("distance non mesurée, aucune trace chargée")}
              </li>
              <li>
                <strong>{tr("Départ GPX")}</strong>
                {tr(" : ")}
                {start
                  ? formatDistFrom(gpxStartM, tr("du départ"))
                  : tr("distance non mesurée, aucune trace chargée")}
              </li>
              <li>
                <strong>{tr("Altitude du logement")}</strong>
                {tr(" : ")}
                {altitude === "no-gps"
                  ? tr("non mesurée, pas de position GPS publiée")
                  : altitude === undefined
                    ? tr("calcul en cours…")
                    : altitude == null
                      ? tr("non mesurée, service d’altitude injoignable")
                      : tr("{altitude} (modèle Open-Meteo / Copernicus)", { altitude: formatAlt(altitude) })}
              </li>
            </ul>
            <p className="mt-6 text-corps text-muted">{provenancePhrase(listing)}</p>
            {listing.proven ? (
              <details className="mt-2 text-note text-muted">
                <summary className="cursor-pointer">{tr("Détail technique")}</summary>
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
                {tr("Ouvrir sur {source}", { source: listing.source })}
                <Icon name="externe" taille={12} />
              </a>
            )}
          </div>
        </div>
        <footer className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-full border border-line px-4 py-2 text-corps">
            {tr("Fermer")}
          </button>
          <span className="flex-1" />
          <a
            href={`/reservation/${listing.id}`}
            className="inline-flex h-11 items-center rounded-surface bg-cta px-5 text-corps font-semibold text-cta-ink"
          >
            {tr("Réserver")}
          </a>
        </footer>
      </aside>
    </div>
  );
}
