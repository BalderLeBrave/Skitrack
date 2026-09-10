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
  compact = false,
}: {
  name: string;
  massif: string;
  lat: number;
  lon: number;
  villageM?: number;
  compact?: boolean;
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
  const level = hasOfficial ? official?.risk ?? null : (internal?.level ?? null);
  const label = (n: number | null) => (n != null ? BRA_LABELS[n]?.fr ?? String(n) : null);
  const source = hasOfficial ? t("bra.official") : t("bra.internal");
  const line = level != null ? `${level} · ${label(level)}` : null;

  if (compact) {
    return (
      <p className="mt-2 text-sm text-white/90" data-testid="bra-strip">
        {t("bra.risk")}
        {" · "}
        {data == null
          ? t("bra.loading")
          : line
            ? `${line} (${source}${data.massif ? ` · ${data.massif}` : ""})`
            : t("bra.unavailable")}
      </p>
    );
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel p-4" data-testid="bra-card">
      <p className="text-xs uppercase tracking-wide text-muted">
        {t("bra.risk")}
        {data?.massif ? ` · ${data.massif}` : ""}
      </p>
      {data == null ? (
        <p className="mt-1 text-sm text-muted">{t("bra.loading")}</p>
      ) : (
        <>
          <p className="mt-1 font-display text-3xl tracking-tight">{line ?? "—"}</p>
          <p className="mt-1 text-sm text-ink">{source}</p>
          {hasOfficial ? (
            <>
              <p className="mt-1 text-sm text-muted">
                {official?.loc1 && official.risk1 != null ? `${label(official.risk1)} ${official.loc1}` : null}
                {official?.loc2 && official.risk2 != null ? ` · ${label(official.risk2)} ${official.loc2}` : null}
              </p>
              {official?.issuedAt ? (
                <p className="mt-1 text-xs text-muted">Bulletin {official.issuedAt}</p>
              ) : null}
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">{t("bra.notBra")}</p>
              {official?.message ? <p className="mt-1 text-xs text-muted">{official.message}</p> : null}
              {official?.error ? (
                <p className="mt-1 text-xs text-muted">{t("bra.unreachable")}</p>
              ) : data.code == null ? (
                <p className="mt-1 text-xs text-muted">{t("bra.none")}</p>
              ) : null}
            </>
          )}
          {internal?.snowfall24hCm != null || internal?.windKmh != null ? (
            <p className="mt-1 text-xs text-muted">
              {internal.snowfall24hCm != null ? `Chutes 24 h ${internal.snowfall24hCm} cm` : null}
              {internal.windKmh != null ? ` · vent ${Math.round(internal.windKmh)} km/h` : null}
              {internal.snowDepthCm != null ? ` · sol ${internal.snowDepthCm} cm` : null}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
