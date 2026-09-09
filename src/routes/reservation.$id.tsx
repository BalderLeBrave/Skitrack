import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { formatEuro, listingById } from "@/lib/listings";
import { stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";

export const Route = createFileRoute("/reservation/$id")({ component: Reservation });

function Reservation() {
  const { id } = Route.useParams();
  const listing = listingById(id);
  const stay = useStay();
  const station = stationById(stay.stationId);
  const navigate = useNavigate();

  if (!listing) {
    return (
      <AppShell>
        <p className="p-8 text-muted">Logement introuvable dans le relevé.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <article className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <button
            type="button"
            onClick={() => navigate({ to: "/logements" })}
            className="mb-4 text-sm text-muted hover:text-ink"
          >
            ← Retour à la liste
          </button>
          <div className="aspect-[16/10] rounded-[var(--radius-card)] bg-glacier">
            {listing.photo ? (
              <img src={listing.photo} alt="" className="h-full w-full rounded-[var(--radius-card)] object-cover" />
            ) : (
              <div className="flex h-full items-end p-5 text-muted">photo manquante</div>
            )}
          </div>
          <h1 className="mt-5 font-display text-4xl">{listing.title}</h1>
          <p className="mt-2 text-muted">
            {listing.source} · {listing.bedrooms ?? "chambres non annoncées"} ·{" "}
            {listing.guests ?? "capacité non annoncée"}
          </p>
          <p className="mt-4 text-sm text-muted">{listing.proven}</p>
        </div>
        <aside className="stay-glass h-fit rounded-[var(--radius-card)] p-5">
          <p className="text-sm text-muted">Séjour</p>
          <p className="font-display text-2xl">{station?.name}</p>
          <p className="mt-2">
            {stay.checkIn} → {stay.checkOut}
          </p>
          <p>
            {stay.guests} pers.
            {stay.bedrooms > 0 ? ` · ${stay.bedrooms}+ ch.` : ""}
          </p>
          <p className="mt-6 text-3xl font-semibold">{formatEuro(listing.total)}</p>
          <p className="text-sm text-muted">Total ferme de ce séjour · Disponible</p>
          {listing.url ? (
            <a
              href={listing.url}
              target="_blank"
              rel="noreferrer"
              className="mt-6 flex h-12 items-center justify-center rounded-xl bg-cta font-semibold text-cta-ink"
            >
              Ouvrir chez {listing.source}
            </a>
          ) : (
            <p className="mt-6 text-sm text-muted">Lien source non publié sur cette tuile.</p>
          )}
          <Link to="/logements" className="mt-3 block text-center text-sm text-muted">
            Retour
          </Link>
        </aside>
      </article>
    </AppShell>
  );
}
