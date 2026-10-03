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
import { tr, trN } from "@/lib/i18n";

const INITIALS = { green: "V", blue: "B", red: "R", black: "N" } as const;

function qualityLabel(slopes: StationSlopes): string {
  if (slopes.source === "skiinfo") {
    return slopes.skiinfoGrain === "valley" ? tr("Skiinfo · vallée") : "Skiinfo";
  }
  if (slopes.quality === "grain_mismatch") {
    return slopes.osmArea ? tr("OSM = {domaine}, pas la station seule", { domaine: slopes.osmArea }) : tr("grain OSM ≠ station");
  }
  if (slopes.quality === "partial") return tr("mix partiel, pas un décompte brochure");
  if (slopes.quality === "segments") return tr("tracés OSM (pas des pistes brochure)");
  return tr("pistes OSM");
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
          <p className="piste__hint">{tr("{km} km · mix indisponible", { km: formatKm(slopes.announcedKm) })}</p>
        ) : (
          <div className="piste__bar" role="img" aria-label={tr("Répartition des pistes")} />
        )}
      </div>
    );
  }

  return (
    <div className={`piste${compact ? " piste--compact" : ""}`} data-testid="piste-mix">
      <div className="piste__bar" role="img" aria-label={tr("Répartition des pistes")}>
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
            ? trN(classic, "{n} piste", "{n} pistes")
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
    const grain = slopes.skiinfoGrain === "valley" ? tr("vallée") : tr("station");
    const km = split.total > 0 ? tr("{km} km", { km: formatKm(split.total) }) : tr("km non publié");
    return tr("{km} · {pistes} ({grain}, Skiinfo). % = bloc publié.", {
      km,
      pistes: trN(classic, "{n} piste", "{n} pistes"),
      grain,
    });
  }
  const extra =
    (slopes.counts.other ?? 0) > 0 ? tr(" · {n} hors vert/bleu/rouge/noir", { n: slopes.counts.other ?? 0 }) : "";
  const traces = trN(classic, "{n} tracé", "{n} tracés");
  if (slopes.quality === "grain_mismatch") {
    return tr("{annonce} km annoncés station. OSM décrit {domaine} ({mesure} km mesurés, {traces}{extra}). Pas un mix station.", {
      annonce: formatKm(slopes.announcedKm),
      domaine: slopes.osmArea ?? tr("un domaine lié"),
      mesure: formatKm(split.total),
      traces,
      extra,
    });
  }
  if (slopes.quality === "partial") {
    return tr("{km} km annoncés · mix OSM partiel ({traces}{extra}).", { km: formatKm(split.total), traces, extra });
  }
  return tr("{km} km annoncés, répartis selon les longueurs OSM ({traces}{extra}). {qualite}.", {
    km: formatKm(split.total),
    traces,
    extra,
    qualite: qualityLabel(slopes),
  });
}
