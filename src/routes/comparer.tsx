import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { distToGpxM, formatPerPerson, resolveListing } from "@/lib/accommodation";
import { formatDist, formatDistFrom, formatLift, sectorOf, skiAccessLabel } from "@/lib/access";
import { formatEuro } from "@/lib/listings";
import { useStay } from "@/lib/stay";
import { useTrack } from "@/lib/track";

export const Route = createFileRoute("/comparer")({ component: Comparer });

type SortKey = "total" | "pp" | "pistes" | "lift" | "gpx";

function Comparer() {
  const ids = useStay((s) => s.shortlist);
  const guests = useStay((s) => s.guests);
  const hasTrack = useTrack((s) => s.points.length > 0);
  const [sort, setSort] = useState<SortKey>("total");
  const rows = useMemo(() => {
    const list = ids.map(resolveListing).filter((l) => l != null);
    return [...list].sort((a, b) => {
      if (sort === "pp") return a.total / Math.max(1, guests) - b.total / Math.max(1, guests);
      if (sort === "pistes") {
        return (a.distToSlopesM ?? Number.POSITIVE_INFINITY) - (b.distToSlopesM ?? Number.POSITIVE_INFINITY);
      }
      if (sort === "lift") {
        return (a.distToLiftM ?? Number.POSITIVE_INFINITY) - (b.distToLiftM ?? Number.POSITIVE_INFINITY);
      }
      if (sort === "gpx") {
        const am = distToGpxM(a) ?? Number.POSITIVE_INFINITY;
        const bm = distToGpxM(b) ?? Number.POSITIVE_INFINITY;
        return am - bm;
      }
      return a.total - b.total;
    });
  }, [ids, sort, guests, hasTrack]);

  return (
    <AppShell>
      <div className="p-4">
        {rows.length === 0 ? (
          <p className="text-muted">
            Ajoutez jusqu’à 4 logements depuis la liste. Rien n’est retenu pour l’instant.
          </p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {(
                [
                  ["total", "Prix séjour"],
                  ["pp", "Prix / pers."],
                  ["pistes", "Remontées mécaniques"],
                  ["lift", "Remontée"],
                  ["gpx", "Trace GPX"],
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
            <div className="grid flex-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {rows.map((l) => {
                const gpxM = distToGpxM(l);
                return (
                  <article key={l.id} className="rounded-[var(--radius-card)] bg-panel p-4">
                    {l.photo ? (
                      <img
                        src={l.photo}
                        alt=""
                        className="mb-3 aspect-[16/10] w-full rounded-xl object-cover"
                      />
                    ) : (
                      <div className="mb-3 flex aspect-[16/10] items-end rounded-xl bg-glacier p-3 text-sm text-muted">
                        photo manquante
                      </div>
                    )}
                    <p className="text-xs text-muted">{l.source}</p>
                    <h2 className="font-display text-2xl">{l.title}</h2>
                    <p className="mt-2 text-lg font-semibold">{formatEuro(l.total)}</p>
                    <p className="text-sm text-muted">
                      {formatPerPerson(l.total, guests)} / pers. · {guests} voyageurs
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      {l.bedrooms ?? "—"} ch. · {l.guests ?? "—"} pers. max
                    </p>
                    <p className="mt-2 text-xs">{sectorOf(l) ?? "Lieu non publié"}</p>
                    {skiAccessLabel(l.distToLiftM) ? (
                      <p className="text-xs font-semibold">{skiAccessLabel(l.distToLiftM)}</p>
                    ) : null}
                    <p className="text-xs">{formatLift(l)}</p>
                    <p className="mt-2 text-xs text-muted">{formatDist(l.distToSlopesM)}</p>
                    <p className="text-xs">
                      {hasTrack
                        ? formatDistFrom(gpxM, "de la trace")
                        : "Pas de trace GPX — distance à la trace non mesurée"}
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
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
