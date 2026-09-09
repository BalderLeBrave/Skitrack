import { useEffect, useState } from "react";
import { getStationBra, type BraPayload } from "@/lib/bra/api";
import { BRA_LABELS } from "@/lib/bra/parse";
import { useT } from "@/lib/i18n";

export function BraCard({
  name,
  massif,
  lat,
  lon,
}: {
  name: string;
  massif: string;
  lat: number;
  lon: number;
}) {
  const t = useT();
  const [data, setData] = useState<BraPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getStationBra({ data: { name, massif, lat, lon } }).then((r) => {
      if (!cancelled) setData(r);
    });
    return () => {
      cancelled = true;
    };
  }, [name, massif, lat, lon]);

  const official = data?.official;
  const hasOfficial = official?.ok && official.risk != null;
  const internal = data?.internal;
  const label = (n: number | null) => (n != null ? BRA_LABELS[n]?.fr ?? String(n) : "—");

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel p-4" data-testid="bra-card">
      <p className="text-xs uppercase tracking-wide text-muted">
        {hasOfficial ? t("bra.official") : t("bra.internal")}
        {data?.massif ? ` · ${data.massif}` : ""}
      </p>
      {hasOfficial ? (
        <>
          <p className="mt-1 font-display text-3xl tracking-tight">
            {official.risk} · {label(official.risk)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {official.loc1 && official.risk1 != null
              ? `${label(official.risk1)} ${official.loc1}`
              : null}
            {official.loc2 && official.risk2 != null
              ? ` · ${label(official.risk2)} ${official.loc2}`
              : null}
          </p>
          {official.issuedAt ? (
            <p className="mt-1 text-xs text-muted">Bulletin {official.issuedAt}</p>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-1 font-display text-3xl tracking-tight">
            {internal?.level != null ? `${internal.level} · ${label(internal.level)}` : "—"}
          </p>
          <p className="mt-1 text-sm text-muted">{t("bra.none")}</p>
          <p className="mt-1 text-xs text-muted">{t("bra.notBra")}</p>
          {internal?.snowfall24hCm != null || internal?.windKmh != null ? (
            <p className="mt-1 text-xs text-muted">
              {internal.snowfall24hCm != null ? `Chutes 24 h ${internal.snowfall24hCm} cm` : null}
              {internal.windKmh != null ? ` · vent ${Math.round(internal.windKmh)} km/h` : null}
              {internal.snowDepthCm != null ? ` · sol ${internal.snowDepthCm} cm` : null}
            </p>
          ) : null}
          {official?.message ? <p className="mt-1 text-xs text-muted">{official.message}</p> : null}
          {official?.error ? (
            <p className="mt-1 text-xs text-muted">BRA officiel injoignable pour le moment.</p>
          ) : null}
        </>
      )}
    </section>
  );
}
