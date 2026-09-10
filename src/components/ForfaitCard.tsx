import { useEffect, useState } from "react";
import { formatEuroTarif, formatForfaitAge, forfaitConfirmLabel } from "@/lib/forfaits/age";
import { getForfait } from "@/lib/forfaits/api";
import { domainForStation } from "@/lib/forfaits/catalog";
import type { ForfaitRow } from "@/lib/forfaits/types";
import { useT } from "@/lib/i18n";

export function ForfaitCard({ stationId }: { stationId: string }) {
  const t = useT();
  const domain = domainForStation(stationId);
  const [row, setRow] = useState<ForfaitRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!domain) return;
    let cancelled = false;
    void getForfait({ data: { slug: domain.slug } }).then((r) => {
      if (!cancelled) setRow(r);
    });
    return () => {
      cancelled = true;
    };
  }, [domain]);

  if (!domain) return null;

  async function refresh() {
    if (!domain) return;
    setBusy(true);
    try {
      const next = await getForfait({ data: { slug: domain.slug, refresh: true } });
      setRow(next);
    } finally {
      setBusy(false);
    }
  }

  const confirm = row ? forfaitConfirmLabel(row) : null;

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel p-4" data-testid="forfait-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{t("pass.title")}</p>
          <h2 className="font-display text-2xl tracking-tight">{domain.pass ?? domain.name}</h2>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm"
        >
          {busy ? "…" : t("pass.refreshOne")}
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-muted">{t("pass.day")}</dt>
          <dd className="font-semibold">{formatEuroTarif(row?.j1 ?? domain.seed?.j1)}</dd>
        </div>
        <div>
          <dt className="text-muted">{t("pass.six")}</dt>
          <dd className="font-semibold">{formatEuroTarif(row?.j6 ?? domain.seed?.j6)}</dd>
        </div>
        <div>
          <dt className="text-muted">{t("pass.child6")}</dt>
          <dd className="font-semibold">{formatEuroTarif(row?.enf6 ?? domain.seed?.enf6)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">
        {row ? formatForfaitAge(row) : domain.seed?.majLabel ? `relevé ${domain.seed.majLabel}` : t("pass.stale")}
        {confirm ? ` · ${t("pass.confirm")}` : null}
      </p>
      {row?.status === "estimé" ? <p className="mt-1 text-xs text-muted">{t("pass.estimated")}</p> : null}
    </section>
  );
}
