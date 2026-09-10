import {
  classicCount,
  displayPct,
  formatKm,
  mixHasClassic,
  PISTE_CLASSIC,
  PISTE_HEX,
  scaleKm,
  type PisteUnit,
  type StationSlopes,
} from "@/lib/pistes";

const INITIALS = { green: "V", blue: "B", red: "R", black: "N" } as const;

function qualityLabel(slopes: StationSlopes): string {
  if (slopes.source === "skiinfo") {
    return slopes.skiinfoGrain === "valley" ? "Skiinfo · vallée" : "Skiinfo";
  }
  if (slopes.quality === "grain_mismatch") {
    return slopes.osmArea ? `OSM = ${slopes.osmArea}, pas la station seule` : "grain OSM ≠ station";
  }
  if (slopes.quality === "partial") return "mix partiel — pas un décompte brochure";
  if (slopes.quality === "segments") return "tracés OSM (pas des pistes brochure)";
  return "pistes OSM";
}

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
  const hasMix = mixHasClassic(slopes);
  const other = slopes.counts.other ?? 0;
  const values = PISTE_CLASSIC.map((color) => {
    const count = slopes.counts[color] ?? 0;
    const km = split[color];
    const weight = unit === "count" ? count : unit === "pct" ? displayPct(slopes, color) : km;
    return { color, count, km, weight };
  });

  if (!hasMix) {
    return (
      <div className={`piste${compact ? " piste--compact" : ""}`} data-testid="piste-mix">
        {!compact ? (
          <p className="piste__hint">{formatKm(slopes.announcedKm)} km · mix indisponible</p>
        ) : (
          <div className="piste__bar" role="img" aria-label="Répartition des pistes" />
        )}
      </div>
    );
  }

  return (
    <div className={`piste${compact ? " piste--compact" : ""}`} data-testid="piste-mix">
      <div className="piste__bar" role="img" aria-label="Répartition des pistes">
        {values.map((v) =>
          v.weight <= 0 ? null : (
            <span
              key={v.color}
              className="piste__seg"
              style={{ flexGrow: v.weight, background: PISTE_HEX[v.color] }}
              title={`${v.count} ${v.color} · ${displayPct(slopes, v.color)} % · ${formatKm(v.km)} km`}
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
                ? `${displayPct(slopes, c)}%`
                : (slopes.counts[c] ?? 0)}
          </span>
        ))}
        <strong>
          {unit === "count"
            ? `${classic} pistes`
            : unit === "pct"
              ? `${PISTE_CLASSIC.reduce((n, c) => n + displayPct(slopes, c), 0)} %`
              : `${formatKm(split.total)} km`}
        </strong>
        {other > 0 ? <span className="text-muted">I{other} OSM</span> : null}
      </p>
      {!compact ? <p className="piste__hint">{mixHint(slopes, split, classic)}</p> : null}
    </div>
  );
}

function mixHint(slopes: StationSlopes, split: { total: number }, classic: number): string {
  if (slopes.source === "skiinfo") {
    const grain = slopes.skiinfoGrain === "valley" ? "vallée" : "station";
    const kmBit = split.total > 0 ? `${formatKm(split.total)} km · ` : "km non publié · ";
    return `${kmBit}${classic} pistes (${grain}, Skiinfo). % = bloc publié.`;
  }
  const extra = (slopes.counts.other ?? 0) > 0 ? ` · ${slopes.counts.other} hors vert/bleu/rouge/noir` : "";
  if (slopes.quality === "grain_mismatch") {
    return `${formatKm(slopes.announcedKm)} km annoncés station. OSM décrit ${slopes.osmArea ?? "un domaine lié"} (${formatKm(split.total)} km mesurés, ${classic} tracés${extra}). Pas un mix station.`;
  }
  if (slopes.quality === "partial") {
    return `${formatKm(split.total)} km annoncés · mix OSM partiel (${classic} tracés${extra}).`;
  }
  return `${formatKm(split.total)} km annoncés, répartis selon les longueurs OSM (${classic} tracés${extra}). ${qualityLabel(slopes)}.`;
}
