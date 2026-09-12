import { useEffect, useState } from "react";
import { Bouton } from "@/components/base/Bouton";
import { getSkiinfo } from "@/lib/skiinfoApi";
import { useSkiinfoLive } from "@/lib/skiinfoLive";
import { formatSkiinfoAge, type SkiinfoLive } from "@/lib/skiinfoStore";
import { useT } from "@/lib/i18n";

export function SkiinfoCard({ stationId }: { stationId: string }) {
  const t = useT();
  const put = useSkiinfoLive((s) => s.put);
  const live = useSkiinfoLive((s) => s.rows[stationId]);
  const [busy, setBusy] = useState(false);
  const [row, setRow] = useState<SkiinfoLive | null>(live ?? null);

  useEffect(() => {
    let cancelled = false;
    void getSkiinfo({ data: { id: stationId } }).then((r) => {
      if (cancelled) return;
      setRow(r);
      put(stationId, r);
      if (r.status === "stale" || r.status === "seed") {
        void getSkiinfo({ data: { id: stationId, refresh: true } }).then((next) => {
          if (cancelled) return;
          setRow(next);
          put(stationId, next);
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [stationId, put]);

  async function refresh() {
    setBusy(true);
    try {
      const next = await getSkiinfo({ data: { id: stationId, refresh: true } });
      setRow(next);
      put(stationId, next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 text-corps"
      data-testid="skiinfo-refresh"
    >
      <p className="text-muted">
        {t("skiinfo.title")}
        {row ? ` · ${formatSkiinfoAge(row)}` : null}
        {row?.status === "erreur" && row.lastError ? ` — ${row.lastError}` : null}
      </p>
      <Bouton ton="fantome" onClick={() => void refresh()} disabled={busy} className="shrink-0">
        {busy ? "…" : t("skiinfo.refresh")}
      </Bouton>
    </div>
  );
}
