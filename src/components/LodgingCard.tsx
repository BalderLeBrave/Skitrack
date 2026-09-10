import { memo } from "react";
import { distToGpxM } from "@/lib/accommodation";
import { formatDist, formatDistFrom, formatLift, formatLiftSpan, otherDomainMessage, sectorOf, skiAccessLabel } from "@/lib/access";
import { listingEleM, useElevations } from "@/lib/elevations";
import { formatEuro, type Listing } from "@/lib/listings";
import { formatAlt, stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { useTrack } from "@/lib/track";

export const LodgingCard = memo(function LodgingCard({
  listing,
  onOpen,
}: {
  listing: Listing;
  onOpen?: (id: string) => void;
}) {
  const short = useStay((s) => s.shortlist.includes(listing.id));
  const toggle = useStay((s) => s.toggleShort);
  const hasTrack = useTrack((s) => s.points.length > 0);
  const byKey = useElevations((s) => s.byKey);
  const gpxM = hasTrack ? distToGpxM(listing) : null;
  const sector = sectorOf(listing);
  const hasGps = listing.lat != null && listing.lon != null;
  const ski = skiAccessLabel(listing.distToLiftM);
  const eleM = listingEleM(byKey, listing.lat, listing.lon);
  const station = stationById(listing.stationId);
  const other = listing.domainFit === "other" ? otherDomainMessage(
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
  ) : null;
  const vsVillage =
    eleM != null && station != null ? eleM - station.villageM : null;
  const span = formatLiftSpan(listing, (lat, lon) => listingEleM(byKey, lat, lon));

  return (
    <article
      className="flex cursor-pointer flex-col overflow-hidden rounded-[var(--radius-card)] bg-panel shadow-[0_8px_28px_rgb(11_31_51_/_0.08)]"
      onClick={() => onOpen?.(listing.id)}
    >
      <div className="aspect-[16/10] bg-glacier">
        {listing.photo ? (
          <img
            src={listing.photo}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-end p-4 text-sm text-muted">photo manquante</div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="text-xs uppercase tracking-wide text-muted">{listing.source}</p>
        <p className="font-display text-lg leading-tight">{listing.title}</p>
        <p className="text-sm text-muted">
          {listing.bedrooms != null ? `${listing.bedrooms} chambres` : "chambres non annoncées"}
          {" · "}
          {listing.guests != null ? `${listing.guests} pers.` : "capacité non annoncée"}
        </p>
        {sector ? <p className="text-xs text-ink">{sector}</p> : null}
        {other ? (
          <p className="text-xs font-semibold text-ink" data-testid="other-domain">
            {other}
          </p>
        ) : null}
        {!other && ski ? <p className="text-xs font-semibold">{ski}</p> : null}
        {!other ? (
          <p className={`text-xs ${listing.distToLiftM == null ? "text-muted" : "text-ink"}`}>
            {hasGps ? formatLift(listing) : formatDist(listing.distToSlopesM)}
          </p>
        ) : listing.distToNearestDomainM != null ? (
          <p className="text-xs text-muted">
            {formatDistFrom(listing.distToNearestDomainM, `de ${listing.nearestDomainName ?? "la station la plus proche"}`)}
          </p>
        ) : null}
        {span && !other ? <p className="text-xs font-semibold">{span}</p> : null}
        {eleM != null ? (
          <p className="text-xs text-ink">
            {formatAlt(eleM)}
            {vsVillage != null
              ? vsVillage >= 0
                ? " · altitude village ou plus"
                : ` · ${formatAlt(Math.abs(vsVillage))} sous le village`
              : " · modèle"}
          </p>
        ) : null}
        {hasTrack ? (
          <p className={`text-xs ${gpxM == null ? "text-muted" : "text-ink"}`}>
            {formatDistFrom(gpxM, "de la trace")}
          </p>
        ) : null}
        <p className="mt-auto flex items-baseline justify-between pt-1">
          <span className="text-base font-semibold">{formatEuro(listing.total)}</span>
          <span className="text-xs font-medium text-ink">Disponible</span>
        </p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen?.(listing.id);
            }}
            className="flex-1 rounded-xl bg-cta py-2 text-center text-sm font-semibold text-cta-ink"
          >
            Voir
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle(listing.id);
            }}
            className={`rounded-xl border px-3 text-sm ${short ? "border-cta text-cta" : "border-line text-muted"}`}
          >
            {short ? "Retiré" : "Comparer"}
          </button>
        </div>
      </div>
    </article>
  );
});
