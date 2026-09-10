import { useEffect, useState } from "react";
import { getAromePair } from "@/lib/meteo/api";
import { freezeSplit, type AromePair, type AromeReading } from "@/lib/meteo/arome";
import { formatAlt } from "@/lib/stations";

function temp(v: AromeReading): string {
  return v.tempC == null ? "—" : `${v.tempC.toLocaleString("fr-FR")} °C`;
}

function wind(v: AromeReading): string {
  if (v.windKmh == null) return "—";
  const g = v.gustKmh != null ? ` (raf. ${Math.round(v.gustKmh)})` : "";
  return `${Math.round(v.windKmh)} km/h${g}`;
}

function mm(n: number | null, unit: string): string {
  return n == null ? "—" : `${n.toLocaleString("fr-FR")} ${unit}`;
}

export function MfCard({
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
  const [data, setData] = useState<AromePair | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAromePair({ data: { lat, lon, villageM, summitM } }).then((r) => {
      if (!cancelled) setData(r);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon, villageM, summitM]);

  const split = data ? freezeSplit(data.village, data.summit) : null;

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel p-4" data-testid="mf-card">
      <p className="text-xs uppercase tracking-wide text-muted">Météo-France · AROME</p>
      <div className="mt-3 grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1.5 text-sm">
        <span />
        <span className="text-muted">Village {formatAlt(villageM)}</span>
        <span className="text-muted">Sommet {formatAlt(summitM)}</span>
        <span className="text-muted">Température</span>
        <span className="font-semibold">{data ? temp(data.village) : "…"}</span>
        <span className="font-semibold">{data ? temp(data.summit) : "…"}</span>
        <span className="text-muted">Temps</span>
        <span>{data ? data.village.weatherFr ?? "—" : "…"}</span>
        <span>{data ? data.summit.weatherFr ?? "—" : "…"}</span>
        <span className="text-muted">Vent</span>
        <span>{data ? wind(data.village) : "…"}</span>
        <span>{data ? wind(data.summit) : "…"}</span>
        <span className="text-muted">Pluie 24 h</span>
        <span>{data ? mm(data.village.precip24hMm, "mm") : "…"}</span>
        <span>{data ? mm(data.summit.precip24hMm, "mm") : "…"}</span>
        <span className="text-muted">Neige 24 h</span>
        <span>{data ? mm(data.village.snowfall24hCm, "cm") : "…"}</span>
        <span>{data ? mm(data.summit.snowfall24hCm, "cm") : "…"}</span>
      </div>
      {split ? <p className="mt-2 text-sm font-medium">{split}</p> : null}
      <p className="mt-2 text-xs text-muted">
        Modèle AROME Météo-France, altitudes village et sommet demandées au modèle. Zéro compris — rien n’est inventé.
        Hors saison, la neige peut être 0 cm.
      </p>
    </section>
  );
}
