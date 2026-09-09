import { memo } from "react";
import { formatDist } from "@/lib/access";
import { formatEuro, type Listing } from "@/lib/listings";
import { useStay } from "@/lib/stay";

export const LodgingCard = memo(function LodgingCard({
  listing,
  onOpen,
}: {
  listing: Listing;
  onOpen?: (id: string) => void;
}) {
  const short = useStay((s) => s.shortlist.includes(listing.id));
  const toggle = useStay((s) => s.toggleShort);

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
        <p className={`text-xs ${listing.distToSlopesM == null ? "text-muted" : "text-ink"}`}>
          {formatDist(listing.distToSlopesM)}
        </p>
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
