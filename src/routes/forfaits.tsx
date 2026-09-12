import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Coquille } from "@/components/Coquille";
import { formatEuroTarif, formatForfaitAge, forfaitConfirmLabel } from "@/lib/forfaits/age";
import { listForfaitDomains, listForfaits, refreshForfaits } from "@/lib/forfaits/api";
import type { DomainForfait } from "@/lib/forfaits/types";
import type { ForfaitRow } from "@/lib/forfaits/types";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/forfaits")({ component: ForfaitsPage });

function ForfaitsPage() {
  const t = useT();
  const [domains, setDomains] = useState<DomainForfait[]>([]);
  const [rows, setRows] = useState<Record<string, ForfaitRow>>({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([listForfaitDomains({ data: {} }), listForfaits({ data: {} })]).then(
      ([list, stored]) => {
        setDomains(list);
        const map: Record<string, ForfaitRow> = {};
        for (const r of stored.items) map[r.slug] = r;
        setRows(map);
        setLastSync(stored.lastSyncAt);
      },
    );
  }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return domains;
    return domains.filter(
      (d) =>
        d.name.toLowerCase().includes(needle) ||
        d.massif.toLowerCase().includes(needle) ||
        (d.pass ?? "").toLowerCase().includes(needle),
    );
  }, [domains, q]);

  async function refreshVisible() {
    setBusy(true);
    try {
      const slugs = visible.slice(0, 16).map((d) => d.slug);
      const next = await refreshForfaits({ data: { slugs, force: true } });
      setRows((cur) => {
        const copy = { ...cur };
        for (const r of next) copy[r.slug] = r;
        return copy;
      });
      setLastSync(new Date().toISOString());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Coquille>
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-affiche tracking-tight">{t("pass.title")}</h1>
            <p className="mt-2 max-w-xl text-muted">
              Tarifs des domaines français, relevés sur les pages officielles. Un estimé ≈ n’entre
              pas dans le coût du séjour. Rien n’est inventé.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshVisible()}
            disabled={busy}
            className="h-12 rounded-surface bg-cta px-5 font-semibold text-cta-ink"
          >
            {busy ? "…" : t("pass.refresh")}
          </button>
        </div>
        <p className="mt-3 text-note text-muted">
          {domains.length} domaines de forfait
          {lastSync ? ` · dernière synchro ${new Date(lastSync).toLocaleString("fr-FR")}` : ""}
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un domaine"
          className="mt-4 h-12 w-full rounded-surface border border-line bg-panel px-4"
        />
        <ul className="mt-6 divide-y divide-line rounded-surface border border-line bg-panel">
          {visible.map((d) => {
            const row = rows[d.slug];
            const confirm = row ? forfaitConfirmLabel(row) : null;
            return (
              <li
                key={d.slug}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
              >
                <div>
                  <p className="font-display text-section leading-tight">{d.name}</p>
                  <p className="text-note text-muted">
                    {d.massif}
                    {d.pass ? ` · ${d.pass}` : ""}
                  </p>
                </div>
                <div className="text-right text-corps">
                  <p>
                    {t("pass.day")} {formatEuroTarif(row?.j1 ?? d.seed?.j1)} · {t("pass.six")}{" "}
                    {formatEuroTarif(row?.j6 ?? d.seed?.j6)}
                  </p>
                  <p className="text-note text-muted">
                    {row
                      ? formatForfaitAge(row)
                      : d.seed?.majLabel
                        ? `relevé ${d.seed.majLabel}`
                        : "–"}
                    {confirm ? ` · ${confirm}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Coquille>
  );
}
