import { Fragment, useEffect, useState } from "react";
import {
  getForecastPair,
  SKY_FR,
  type ForecastDay,
  type ForecastPair,
  type ForecastSlot,
  type SkyKind,
} from "@/lib/meteo/forecast";
import { Icon, type IconName } from "@/components/Icon";
import { formatAlt } from "@/lib/stations";

/** Quatre familles de ciel, quatre pictogrammes du registre. */
function SkyIcon({ kind }: { kind: SkyKind }) {
  const nom: IconName =
    kind === "sun" ? "soleil" : kind === "rain" ? "pluie" : kind === "snow" ? "neige" : "nuage";
  return <Icon name={nom} taille={20} />;
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
  return v == null ? "–" : `${v} °C`;
}

/** Un créneau : température et état du ciel, ou l'absence dite. */
function Slot({ slot }: { slot: ForecastSlot }) {
  if (slot.temp == null && slot.sky === "unknown") {
    return <span className="text-muted">non rendu</span>;
  }
  return (
    <span className="whitespace-nowrap">
      <b>{slot.temp == null ? "–" : `${slot.temp} °C`}</b>{" "}
      <span className="text-muted">{SKY_FR[slot.sky]}</span>
    </span>
  );
}

function Row({ day }: { day: ForecastDay }) {
  return (
    <div className="grid grid-cols-[6.5rem_1.5rem_1fr_4.5rem_4.5rem] items-center gap-x-2 py-1 text-corps">
      <span className="text-muted">{dayLabel(day.date)}</span>
      <span className="text-muted">
        <SkyIcon kind={day.kind} />
      </span>
      <span>
        <span className="font-semibold">{temp(day.tempMax)}</span>
        <span className="text-muted"> / {temp(day.tempMin)}</span>
      </span>
      <span className={day.snowCm ? "font-semibold" : "text-muted"}>
        {day.snowCm == null ? "–" : `${day.snowCm.toLocaleString("fr-FR")} cm`}
      </span>
      <span className="text-muted">
        {day.rainMm == null ? "–" : `${day.rainMm.toLocaleString("fr-FR")} mm`}
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
      className="rounded-surface border border-line bg-panel p-4"
      data-testid="forecast-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-note uppercase tracking-wide text-muted">14 jours (modèle Open-Meteo)</p>
        <div className="flex gap-1 rounded-surface border border-line p-0.5 text-note">
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

      {/* Matin et après-midi du jour, aux deux altitudes en même temps : c'est la
          comparaison qui compte, pas chaque valeur prise seule. Deux mille
          mètres d'écart valent souvent plus qu'une journée de décalage. */}
      {data != null && (
        <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 gap-y-1 text-corps">
          <span />
          <span className="text-note uppercase tracking-wide text-muted">Matin 9 h</span>
          <span className="text-note uppercase tracking-wide text-muted">Après-midi 15 h</span>
          {(["low", "high"] as const).map((k) => {
            const lvl = data[k];
            return (
              <Fragment key={k}>
                <span className="text-muted">
                  {k === "low" ? "Bas des pistes" : "Point culminant"} {formatAlt(lvl.altitudeM)}
                </span>
                <Slot slot={lvl.morning} />
                <Slot slot={lvl.afternoon} />
              </Fragment>
            );
          })}
        </div>
      )}

      <div className="mt-3 grid grid-cols-[6.5rem_1.5rem_1fr_4.5rem_4.5rem] gap-x-2 text-note text-muted">
        <span />
        <span />
        <span>Max / min</span>
        <span>Neige</span>
        <span>Pluie</span>
      </div>

      {data == null ? (
        <p className="mt-2 text-corps text-muted">…</p>
      ) : days.length === 0 ? (
        <p className="mt-2 text-corps text-muted">
          Prévision non obtenue. Rien n’est affiché plutôt qu’une valeur inventée.
        </p>
      ) : (
        <div className="mt-1 divide-y divide-line">
          {days.map((d) => (
            <Row key={d.date} day={d} />
          ))}
        </div>
      )}

      <p className="mt-3 text-note text-muted">
        Isotherme 0 °C à midi :{" "}
        {data?.freezingLevelM == null ? "non rendue" : formatAlt(data.freezingLevelM)}. Neige au sol
        aujourd’hui à {formatAlt(shown?.altitudeM ?? villageM)} :{" "}
        {depth == null ? "non rendue" : `${depth.toLocaleString("fr-FR")} cm`}. Millimètres de pluie
        seule, hors équivalent en eau de la neige.
      </p>
    </section>
  );
}
