import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  OSM_VERDICT_FR,
  osmSkiinfoAll,
  osmSkiinfoSummary,
  type OsmVerdict,
} from "@/lib/openskimap";
import { formatKm } from "@/lib/pistes";
import { formatAlt } from "@/lib/stations";

export const Route = createFileRoute("/openskimap")({ component: OpenSkiMapPage });

type Filter = "all" | OsmVerdict;

function OpenSkiMapPage() {
  const rows = useMemo(() => osmSkiinfoAll(), []);
  const sum = useMemo(() => osmSkiinfoSummary(rows), [rows]);
  const [filter, setFilter] = useState<Filter>("all");
  const shown = useMemo(() => {
    const list = filter === "all" ? [...rows] : rows.filter((r) => r.verdict === filter);
    list.sort(
      (a, b) => (b.nOsm ?? 0) / Math.max(1, b.nSki ?? 1) - (a.nOsm ?? 0) / Math.max(1, a.nSki ?? 1),
    );
    return list;
  }, [rows, filter]);

  const chips: [Filter, string][] = [
    ["all", `France · ${sum.n}`],
    ["segments", `segments · ${sum.segments}`],
    ["km_court", `km OSM court · ${sum.km_court}`],
    ["ok", `≈ Skiinfo · ${sum.ok}`],
    ["ecart_n", `écart n · ${sum.ecart_n}`],
    ["grain_domaine", `domaine OSM · ${sum.grain_domaine}`],
    ["osm_vide", `OSM sans piste · ${sum.osm_vide}`],
    ["osm_absent", `absent · ${sum.osm_absent}`],
  ];

  return (
    <AppShell
      chips={
        <>
          {chips.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`shrink-0 rounded-full px-3 py-1 text-sm ${filter === id ? "bg-glacier font-semibold" : "text-muted"}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </>
      }
    >
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="font-display text-4xl tracking-tight">OpenSkiMap × Skiinfo</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          OpenSkiMap = pistes OSM (même fond qu’OpenSnowMap). Ce n’est pas OpenSnow.com (prévisions
          US, API partenaire). Les comptes OSM sont des tracés ; Skiinfo publie des pistes brochure.
          On n’écrase pas le mix avec OSM.
        </p>
        <div className="mt-4 overflow-x-auto rounded-[var(--radius-card)] border border-line bg-panel">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Station</th>
                <th className="px-3 py-2 font-medium">n Skiinfo / OSM</th>
                <th className="px-3 py-2 font-medium">km Skiinfo / OSM</th>
                <th className="px-3 py-2 font-medium">Alt. OSM</th>
                <th className="px-3 py-2 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-3 py-2">
                    <Link
                      to="/stations/$id"
                      params={{ id: r.id }}
                      className="font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                    <p className="text-xs text-muted">{r.osmName ?? r.massif}</p>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.nSki ?? "–"} / {r.nOsm ?? "–"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.kmSki != null ? `${formatKm(r.kmSki)} km` : "–"} /{" "}
                    {r.kmOsm != null ? `${formatKm(r.kmOsm)} km` : "–"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.minOsm != null && r.maxOsm != null
                      ? `${formatAlt(r.minOsm)} – ${formatAlt(r.maxOsm)}`
                      : "–"}
                  </td>
                  <td className="px-3 py-2 text-muted">{OSM_VERDICT_FR[r.verdict]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </AppShell>
  );
}
