import { useEffect, useState } from "react";
import { getSnowPair } from "@/lib/snow/api";
import { recordSnow, snowHistoryOf, snowHistorySince, type SnowPoint } from "@/lib/snow/history";
import { formatAlt } from "@/lib/stations";

const W = 320;
const H = 120;
const PAD = 8;

/** « 16/02 » : le jour est une chaîne calendaire, lue telle quelle. */
function shortDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

type Serie = { key: "bas" | "haut"; label: string; color: string };

function path(points: SnowPoint[], key: "bas" | "haut", max: number): string {
  const usable = points.map((p, i) => ({ i, v: p[key] })).filter((p) => p.v != null);
  if (usable.length === 0) return "";
  const span = Math.max(points.length - 1, 1);
  return usable
    .map((p, k) => {
      const x = PAD + ((W - 2 * PAD) * p.i) / span;
      const y = H - PAD - ((H - 2 * PAD) * (p.v as number)) / max;
      return `${k === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * Historique de neige au sol, celui que l'application a relevé elle-même.
 *
 * L'appel à `getSnowPair` est le même que celui de la carte de neige : le cache
 * serveur de 30 minutes l'absorbe, et le relevé du jour est enregistré une
 * seule fois, le premier gagnant.
 */
export function SnowHistoryCard({
  stationId,
  lat,
  lon,
  villageM,
  summitM,
}: {
  stationId: string;
  lat: number;
  lon: number;
  villageM: number;
  summitM: number;
}) {
  const [points, setPoints] = useState<SnowPoint[]>([]);
  const [since, setSince] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSnowPair({ data: { lat, lon, villageM, summitM } }).then((r) => {
      if (cancelled) return;
      recordSnow([
        {
          stationId,
          bas: r.village.snowDepthCm,
          haut: r.summit.snowDepthCm,
          fetchedAt: Date.now(),
        },
      ]);
      setPoints(snowHistoryOf(stationId));
      setSince(snowHistorySince());
    });
    return () => {
      cancelled = true;
    };
  }, [stationId, lat, lon, villageM, summitM]);

  const series: Serie[] = [
    { key: "bas", label: `Bas des pistes ${formatAlt(villageM)}`, color: "var(--color-marque)" },
    { key: "haut", label: `Point culminant ${formatAlt(summitM)}`, color: "var(--color-cta)" },
  ];
  const values = points.flatMap((p) => [p.bas, p.haut]).filter((v): v is number => v != null);
  const max = Math.max(10, ...values);
  const last = points[points.length - 1];

  return (
    <section
      className="rounded-surface border border-line bg-panel p-4"
      data-testid="snow-history-card"
    >
      <p className="text-note text-muted">
        Neige au sol, relevé jour par jour
      </p>

      {points.length === 0 ? (
        <p className="mt-3 text-corps text-muted">
          L’historique commence aujourd’hui : SKITRACK enregistre ce qu’il mesure, il n’importe
          aucun passé.
        </p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mt-3 w-full"
            role="img"
            aria-label="Hauteur de neige au sol relevée jour par jour"
          >
            <line
              x1={PAD}
              y1={H - PAD}
              x2={W - PAD}
              y2={H - PAD}
              stroke="var(--color-line)"
              strokeWidth="1"
            />
            {series.map((s) => {
              const d = path(points, s.key, max);
              return d ? (
                <path
                  key={s.key}
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null;
            })}
            {points.length === 1
              ? series.map((s) =>
                  points[0][s.key] == null ? null : (
                    <circle
                      key={s.key}
                      cx={PAD}
                      cy={H - PAD - ((H - 2 * PAD) * (points[0][s.key] as number)) / max}
                      r="3"
                      fill={s.color}
                    />
                  ),
                )
              : null}
          </svg>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-note">
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-muted">
                <span
                  className="inline-block h-0.5 w-4 rounded"
                  style={{ background: s.color }}
                  aria-hidden
                />
                {s.label} :{" "}
                {last?.[s.key] == null
                  ? "–"
                  : `${(last[s.key] as number).toLocaleString("fr-FR")} cm`}
              </span>
            ))}
          </div>

          <p className="mt-3 text-note text-muted">
            {points.length.toLocaleString("fr-FR")} relevé{points.length > 1 ? "s" : ""}, du{" "}
            {shortDay(points[0].day)} au {shortDay(points[points.length - 1].day)}
            {since && since !== points[0].day
              ? ` (première mesure de l’application le ${shortDay(since)})`
              : ""}
            . Échelle de 0 à {max.toLocaleString("fr-FR")} cm. Un jour sans relevé est un trou, pas
            un zéro.
          </p>
        </>
      )}
    </section>
  );
}
