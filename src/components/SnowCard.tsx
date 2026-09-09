import { useEffect, useState } from "react";
import { getSnowPair, type SnowPair, type SnowReading } from "@/lib/snow/api";
import { formatAlt } from "@/lib/stations";

function cell(v: SnowReading, kind: "snow" | "depth" | "wind"): string {
  if (kind === "snow") return v.snowfall24hCm == null ? "—" : `${v.snowfall24hCm.toLocaleString("fr-FR")} cm`;
  if (kind === "depth") return v.snowDepthCm == null ? "—" : `${v.snowDepthCm.toLocaleString("fr-FR")} cm`;
  return v.windKmh == null ? "—" : `${Math.round(v.windKmh)} km/h`;
}

export function SnowCard({
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
  const [data, setData] = useState<SnowPair | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSnowPair({ data: { lat, lon, villageM, summitM } }).then((r) => {
      if (!cancelled) setData(r);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon, villageM, summitM]);

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel p-4" data-testid="snow-card">
      <p className="text-xs uppercase tracking-wide text-muted">Neige (modèle Open-Meteo)</p>
      <div className="mt-3 grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1.5 text-sm">
        <span />
        <span className="text-muted">Village {formatAlt(villageM)}</span>
        <span className="text-muted">Sommet {formatAlt(summitM)}</span>
        <span className="text-muted">Chutes 24 h</span>
        <span className="font-semibold">{data ? cell(data.village, "snow") : "…"}</span>
        <span className="font-semibold">{data ? cell(data.summit, "snow") : "…"}</span>
        <span className="text-muted">Sol</span>
        <span>{data ? cell(data.village, "depth") : "…"}</span>
        <span>{data ? cell(data.summit, "depth") : "…"}</span>
        <span className="text-muted">Vent</span>
        <span>{data ? cell(data.village, "wind") : "…"}</span>
        <span>{data ? cell(data.summit, "wind") : "…"}</span>
      </div>
      <p className="mt-3 text-xs text-muted">
        Altitudes France Montagnes demandées au modèle. Zéro compris — rien n’est inventé.
      </p>
    </section>
  );
}
