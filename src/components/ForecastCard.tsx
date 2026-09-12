import { useEffect, useState } from "react";
import {
  getForecastPair,
  type ForecastDay,
  type ForecastPair,
  type SkyKind,
} from "@/lib/meteo/forecast";
import { formatAlt } from "@/lib/stations";

/** Quatre familles de ciel, quatre dessins. Aucun glyphe Unicode en guise d'icône. */
function SkyIcon({ kind }: { kind: SkyKind }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  if (kind === "sun") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
      </svg>
    );
  }
  if (kind === "rain") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M7 15a4 4 0 010-8 5 5 0 019.6-1A3.5 3.5 0 0117.5 15H7z" />
        <path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5" />
      </svg>
    );
  }
  if (kind === "snow") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M7 14a4 4 0 010-8 5 5 0 019.6-1A3.5 3.5 0 0117.5 14H7z" />
        <path d="M9 18h.01M12 20h.01M15 18h.01M10.5 21h.01M13.5 17h.01" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M7 18a4.5 4.5 0 010-9 5.5 5.5 0 0110.6-1.2A4 4 0 0117.5 18H7z" />
    </svg>
  );
}

const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/** « lun. 16/02 ». Date lue en UTC : la chaîne d'Open-Meteo est un jour, pas un instant. */
function dayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${JOURS[d.getUTCDay()]} ${m[3]}/${m[2]}`;
}

function temp(v: number | null): string {
  return v == null ? "—" : `${v} °C`;
}

function Row({ day }: { day: ForecastDay }) {
  return (
    <div className="grid grid-cols-[6.5rem_1.5rem_1fr_4.5rem_4.5rem] items-center gap-x-2 py-1 text-sm">
      <span className="text-muted">{dayLabel(day.date)}</span>
      <span className="text-muted">
        <SkyIcon kind={day.kind} />
      </span>
      <span>
        <span className="font-semibold">{temp(day.tempMax)}</span>
        <span className="text-muted"> / {temp(day.tempMin)}</span>
      </span>
      <span className={day.snowCm ? "font-semibold" : "text-muted"}>
        {day.snowCm == null ? "—" : `${day.snowCm.toLocaleString("fr-FR")} cm`}
      </span>
      <span className="text-muted">
        {day.rainMm == null ? "—" : `${day.rainMm.toLocaleString("fr-FR")} mm`}
      </span>
    </div>
  );
}

export function ForecastCard({
  lat,
  lon,
  villageM,
  summitM,
}: {
  lat: number;
  lon: number;
  villageM: number;
  summitM: number;
}) {
  const [data, setData] = useState<ForecastPair | null>(null);
  const [level, setLevel] = useState<"low" | "high">("low");

  useEffect(() => {
    let cancelled = false;
    void getForecastPair({ data: { lat, lon, villageM, summitM } }).then((r) => {
      if (!cancelled) setData(r);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon, villageM, summitM]);

  const shown = data ? data[level] : null;
  const days = shown?.days.slice(0, 14) ?? [];
  const depth = days[0]?.depthCm ?? null;

  return (
    <section
      className="rounded-[var(--radius-card)] border border-line bg-panel p-4"
      data-testid="forecast-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">14 jours (modèle Open-Meteo)</p>
        <div className="flex gap-1 rounded-md border border-line p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setLevel("low")}
            className={`rounded px-2 py-1 ${level === "low" ? "bg-glacier font-semibold" : "text-muted"}`}
          >
            Bas des pistes {formatAlt(villageM)}
          </button>
          <button
            type="button"
            onClick={() => setLevel("high")}
            className={`rounded px-2 py-1 ${level === "high" ? "bg-glacier font-semibold" : "text-muted"}`}
          >
            Point culminant {formatAlt(summitM)}
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[6.5rem_1.5rem_1fr_4.5rem_4.5rem] gap-x-2 text-xs text-muted">
        <span />
        <span />
        <span>Max / min</span>
        <span>Neige</span>
        <span>Pluie</span>
      </div>

      {data == null ? (
        <p className="mt-2 text-sm text-muted">…</p>
      ) : days.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Prévision non obtenue. Rien n’est affiché plutôt qu’une valeur inventée.
        </p>
      ) : (
        <div className="mt-1 divide-y divide-line">
          {days.map((d) => (
            <Row key={d.date} day={d} />
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-muted">
        Isotherme 0 °C à midi :{" "}
        {data?.freezingLevelM == null ? "non rendue" : formatAlt(data.freezingLevelM)}. Neige au sol
        aujourd’hui à {formatAlt(shown?.altitudeM ?? villageM)} :{" "}
        {depth == null ? "non rendue" : `${depth.toLocaleString("fr-FR")} cm`}. Millimètres de pluie
        seule, hors équivalent en eau de la neige.
      </p>
    </section>
  );
}
