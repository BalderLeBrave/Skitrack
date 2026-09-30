import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Coquille } from "@/components/Coquille";
import { SensTri } from "@/components/v7/SensTri";
import {
  OSM_VERDICT_FR,
  osmSkiinfoAll,
  osmSkiinfoSummary,
  type OsmVerdict,
} from "@/lib/openskimap";
import { formatKm } from "@/lib/pistes";
import { formatAlt } from "@/lib/stations";
import { parMesure, type Sens } from "@/lib/tri";

export const Route = createFileRoute("/openskimap")({ component: OpenSkiMapPage });

type Filter = "all" | OsmVerdict;

function OpenSkiMapPage() {
  const rows = useMemo(() => osmSkiinfoAll(), []);
  const sum = useMemo(() => osmSkiinfoSummary(rows), [rows]);
  const [filter, setFilter] = useState<Filter>("all");
  // Le plus grand rapport tronçons OSM / pistes Skiinfo d'abord ; le bouton de
  // sens inverse.
  const [sens, setSens] = useState<Sens>(-1);
  const shown = useMemo(() => {
    const list = filter === "all" ? [...rows] : rows.filter((r) => r.verdict === filter);
    const rapport = (r: (typeof rows)[number]) => (r.nOsm ?? 0) / Math.max(1, r.nSki ?? 1);
    list.sort((a, b) => parMesure(rapport(a), rapport(b), sens));
    return list;
  }, [rows, filter, sens]);

  const chips: [Filter, string][] = [
    ["all", `France · ${sum.n}`],
    ["segments", `tronçons · ${sum.segments}`],
    ["km_court", `km OSM inférieurs · ${sum.km_court}`],
    ["ok", `≈ Skiinfo · ${sum.ok}`],
    ["ecart_n", `nombre de pistes différent · ${sum.ecart_n}`],
    ["grain_domaine", `domaine OSM · ${sum.grain_domaine}`],
    ["osm_vide", `OSM sans piste · ${sum.osm_vide}`],
    ["osm_absent", `sans domaine OSM · ${sum.osm_absent}`],
  ];

  return (
    <Coquille
      chips={
        <>
          {chips.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`shrink-0 rounded-full px-3 py-1 text-corps ${filter === id ? "bg-glacier font-semibold" : "text-muted"}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
          <span className="shrink-0 pl-2 text-note text-muted">Tri : tronçons OSM par piste Skiinfo</span>
          <SensTri className="sens7--petit shrink-0" sens={sens} onChange={setSens} />
        </>
      }
    >
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="font-display text-affiche tracking-tight">OpenSkiMap × Skiinfo</h1>
        <p className="mt-2 max-w-2xl text-corps text-muted">
          OpenSkiMap reprend les pistes d’OpenStreetMap (OSM), comme OpenSnowMap. À ne pas confondre
          avec OpenSnow.com, un service américain de prévisions. OSM compte des tracés ; Skiinfo
          publie les pistes annoncées par la station. La répartition par couleur de Skiinfo n’est
          jamais remplacée par celle d’OSM.
        </p>
        <div className="mt-4 overflow-x-auto rounded-surface border border-line bg-panel">
          <table className="w-full min-w-[44rem] text-left text-corps">
            <thead>
              <tr className="border-b border-line text-note text-muted">
                <th className="px-3 py-2 font-medium">Station</th>
                <th className="px-3 py-2 font-medium">Pistes Skiinfo / OSM</th>
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
                    <p className="text-note text-muted">{r.osmName ?? r.massif}</p>
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
    </Coquille>
  );
}
