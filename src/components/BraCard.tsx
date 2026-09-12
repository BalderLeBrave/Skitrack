import { useEffect, useState } from "react";
import { getStationBra, type BraPayload } from "@/lib/bra/api";
import { BRA_LABELS } from "@/lib/bra/parse";
import { useT } from "@/lib/i18n";

const inflight = new Map<string, Promise<BraPayload>>();

function loadBra(args: {
  name: string;
  massif: string;
  lat: number;
  lon: number;
  villageM?: number;
}): Promise<BraPayload> {
  const key = `${args.name}|${args.lat}|${args.lon}|${args.villageM ?? ""}`;
  const hit = inflight.get(key);
  if (hit) return hit;
  const p = getStationBra({ data: args });
  inflight.set(key, p);
  return p;
}

export function BraCard({
  name,
  massif,
  lat,
  lon,
  villageM,
}: {
  name: string;
  massif: string;
  lat: number;
  lon: number;
  villageM?: number;
}) {
  const t = useT();
  const [data, setData] = useState<BraPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadBra({ name, massif, lat, lon, villageM }).then((r) => {
      if (!cancelled) setData(r);
    });
    return () => {
      cancelled = true;
    };
  }, [name, massif, lat, lon, villageM]);

  const official = data?.official;
  const hasOfficial = Boolean(official?.ok && official.risk != null);
  const internal = data?.internal;
  const label = (n: number | null) => (n != null ? BRA_LABELS[n]?.fr ?? String(n) : "—");

  return (
    <section className="rounded-surface border border-line bg-panel p-4" data-testid="bra-card">
      <p className="text-note text-muted">
        {hasOfficial ? t("bra.official") : t("bra.internal")}
        {data?.massif ? ` · ${data.massif}` : ""}
      </p>
      {hasOfficial ? (
        <>
          <p className="mt-1 font-display text-titre tracking-tight">
            {official?.risk} · {label(official?.risk ?? null)}
          </p>
          <p className="mt-1 text-corps text-muted">
            {official?.loc1 && official.risk1 != null ? `${label(official.risk1)} ${official.loc1}` : null}
            {official?.loc2 && official.risk2 != null ? ` · ${label(official.risk2)} ${official.loc2}` : null}
          </p>
          {official?.issuedAt ? (
            <p className="mt-1 text-note text-muted">Bulletin {official.issuedAt}</p>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-1 font-display text-titre tracking-tight">
            {internal?.level != null ? `${internal.level} · ${label(internal.level)}` : "—"}
          </p>
          <p className="mt-1 text-corps text-muted">{t("bra.none")}</p>
          <p className="mt-1 text-note text-muted">{t("bra.notBra")}</p>
          {internal?.snowfall24hCm != null || internal?.windKmh != null ? (
            <p className="mt-1 text-note text-muted">
              {internal.snowfall24hCm != null ? `Chutes 24 h ${internal.snowfall24hCm} cm` : null}
              {internal.windKmh != null ? ` · vent ${Math.round(internal.windKmh)} km/h` : null}
              {internal.snowDepthCm != null ? ` · sol ${internal.snowDepthCm} cm` : null}
            </p>
          ) : null}
          {official?.message ? <p className="mt-1 text-note text-muted">{official.message}</p> : null}
          {official?.error ? (
            <p className="mt-1 text-note text-muted">{t("bra.unreachable")}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
