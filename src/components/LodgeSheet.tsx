import { formatDist } from "@/lib/access";
import { formatEuro, type Listing } from "@/lib/listings";
import { stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";

export function LodgeSheet({
  listing,
  onClose,
}: {
  listing: Listing;
  onClose: () => void;
}) {
  const stay = useStay();
  const station = stationById(listing.stationId);
  const nights = Math.max(
    1,
    Math.round((Date.parse(stay.checkOut) - Date.parse(stay.checkIn)) / 86400000),
  );
  const pp = Math.round(listing.total / Math.max(1, stay.guests) / nights);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-4" data-testid="lodge-sheet">
      <button type="button" className="absolute inset-0 bg-ink/55 backdrop-blur-md" aria-label="Fermer" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="lodge-sheet-title"
        className="relative z-10 grid max-h-[min(860px,calc(100dvh-24px))] w-[min(1120px,calc(100vw-24px))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-3xl bg-panel text-ink shadow-[0_24px_80px_rgb(0_0_0_/_0.35)]"
      >
        <header className="relative border-b border-line px-6 py-4 pr-14">
          <p className="text-xs uppercase tracking-wide text-muted">{listing.source}</p>
          <h2 id="lodge-sheet-title" className="font-display text-3xl tracking-tight">
            {listing.title}
          </h2>
          <p className="mt-1 text-sm text-muted">
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
              <p className="font-display text-3xl">{formatEuro(listing.total)}</p>
              <p className="text-sm text-muted">
                {nights} nuits · {stay.guests} pers. · {formatEuro(pp)} /pers/nuit
              </p>
              <p className="text-xs font-medium text-ink">Prix ferme du séjour, relevé pour ces dates.</p>
            </div>
          </div>
          <div className="overflow-auto p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Ce que Skitrack a vérifié</p>
            <ul className="mt-3 grid gap-2 text-sm">
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
                <strong>Distance aux pistes</strong> : {formatDist(listing.distToSlopesM)}
                {listing.lat == null || listing.lon == null
                  ? " — pas de GPS publié (Booking n’envoie souvent que le quartier)."
                  : " — GPS de l’annonce, front de neige de la fiche station."}
              </li>
            </ul>
            <p className="mt-6 text-sm text-muted">{listing.proven}</p>
            {listing.url && (
              <a
                href={listing.url}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex text-sm font-semibold text-ink underline"
              >
                Ouvrir sur {listing.source} ↗
              </a>
            )}
          </div>
        </div>
        <footer className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-full border border-line px-4 py-2 text-sm">
            Fermer
          </button>
          <span className="flex-1" />
          <a
            href={`/reservation/${listing.id}`}
            className="inline-flex h-11 items-center rounded-xl bg-cta px-5 text-sm font-semibold text-cta-ink"
          >
            Réserver
          </a>
        </footer>
      </aside>
    </div>
  );
}
