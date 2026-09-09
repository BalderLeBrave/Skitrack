import {
  classicCount,
  formatKm,
  PISTE_CLASSIC,
  PISTE_HEX,
  scaleKm,
  type PisteUnit,
  type StationSlopes,
} from "@/lib/pistes";

const INITIALS = { green: "V", blue: "B", red: "R", black: "N" } as const;

export function PisteMixBar({
  slopes,
  unit = "count",
  compact = false,
}: {
  slopes: StationSlopes;
  unit?: PisteUnit;
  compact?: boolean;
}) {
  const split = scaleKm(slopes);
  const classic = classicCount(slopes.counts);
  const values = PISTE_CLASSIC.map((color) => {
    const count = slopes.counts[color] ?? 0;
    const km = split[color];
    const weight = unit === "count" ? count : km;
    return { color, count, km, weight };
  });
  const denom = values.reduce((n, v) => n + v.weight, 0) || 1;

  return (
    <div className={`piste${compact ? " piste--compact" : ""}`} data-testid="piste-mix">
      <div className="piste__bar" role="img" aria-label="Répartition des pistes">
        {values.map((v) =>
          v.weight <= 0 ? null : (
            <span
              key={v.color}
              className="piste__seg"
              style={{ flexGrow: v.weight, background: PISTE_HEX[v.color] }}
              title={`${v.count} ${v.color} · ${formatKm(v.km)} km`}
            />
          ),
        )}
      </div>
      <p className="piste__meta">
        {PISTE_CLASSIC.map((c) => (
          <span key={c}>
            {INITIALS[c]}
            {unit === "km"
              ? formatKm(split[c])
              : unit === "pct"
                ? `${split.total ? Math.round((100 * split[c]) / split.total) : 0}%`
                : (slopes.counts[c] ?? 0)}
          </span>
        ))}
        <strong>
          {unit === "count"
            ? `${classic} pistes`
            : unit === "pct"
              ? "100 %"
              : `${formatKm(split.total)} km`}
        </strong>
        {(slopes.counts.other ?? 0) > 0 ? (
          <span className="text-muted">I{slopes.counts.other} OSM</span>
        ) : null}
      </p>
      {!compact && (
        <p className="piste__hint">
          {formatKm(split.total)} km annoncés, répartis selon OpenStreetMap ({classic} tracés
          { (slopes.counts.other ?? 0) > 0
            ? ` · ${slopes.counts.other} hors vert/bleu/rouge/noir`
            : ""}
          ).
        </p>
      )}
    </div>
  );
}
