import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { formatEuro, listingById } from "@/lib/listings";
import { useStay } from "@/lib/stay";

export const Route = createFileRoute("/comparer")({ component: Comparer });

function Comparer() {
  const ids = useStay((s) => s.shortlist);
  const rows = ids.map(listingById).filter(Boolean);

  return (
    <AppShell>
      <div className="grid flex-1 gap-4 overflow-x-auto p-4 md:grid-cols-2 xl:grid-cols-4">
        {rows.length === 0 ? (
          <p className="text-muted">
            Ajoutez jusqu’à 4 logements depuis la liste. Rien n’est retenu pour l’instant.
          </p>
        ) : (
          rows.map((l) =>
            l ? (
              <article key={l.id} className="rounded-[var(--radius-card)] bg-panel p-4">
                <p className="text-xs text-muted">{l.source}</p>
                <h2 className="font-display text-2xl">{l.title}</h2>
                <p className="mt-2 text-lg font-semibold">{formatEuro(l.total)}</p>
                <p className="text-sm text-muted">
                  {l.bedrooms ?? "—"} ch. · {l.guests ?? "—"} pers.
                </p>
                <p className="mt-3 text-xs text-muted">{l.proven}</p>
                <Link
                  to="/reservation/$id"
                  params={{ id: l.id }}
                  className="mt-4 inline-flex h-11 items-center rounded-xl bg-cta px-4 text-sm font-semibold text-cta-ink"
                >
                  Réserver
                </Link>
              </article>
            ) : null,
          )
        )}
      </div>
    </AppShell>
  );
}
