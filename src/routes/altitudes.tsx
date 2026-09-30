import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Coquille } from "@/components/Coquille";
import { SensTri } from "@/components/v7/SensTri";
import { ignSkiinfoAll, ignSkiinfoSummary, VERDICT_FR, type IgnSkiVerdict } from "@/lib/ignSkiinfo";
import { formatAlt } from "@/lib/stations";
import { parMesure, type Sens } from "@/lib/tri";

export const Route = createFileRoute("/altitudes")({ component: Altitudes });

type Filter = "all" | IgnSkiVerdict;

function delta(n: number | null): string {
  if (n == null) return "–";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("fr-FR")} m`;
}

function Altitudes() {
  const rows = useMemo(() => ignSkiinfoAll(), []);
  const sum = useMemo(() => ignSkiinfoSummary(rows), [rows]);
  const [filter, setFilter] = useState<Filter>("all");
  // Le plus grand écart d'abord ; le bouton de sens inverse. Un écart non
  // mesuré reste en queue dans les deux sens.
  const [sens, setSens] = useState<Sens>(-1);
  const shown = useMemo(() => {
    const list = filter === "all" ? [...rows] : rows.filter((r) => r.verdict === filter);
    const ecart = (d: number | null) => (d == null ? null : Math.abs(d));
    list.sort((a, b) => parMesure(ecart(a.dBase), ecart(b.dBase), sens));
    return list;
  }, [rows, filter, sens]);

  const chips: [Filter, string][] = [
    ["all", `France · ${sum.n}`],
    ["village", `≈ village · ${sum.village}`],
    ["domaine", `dans le domaine · ${sum.domaine}`],
    ["sous_base", `sous la base · ${sum.sous_base}`],
    ["sommet", `≈ sommet · ${sum.sommet}`],
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
          <span className="shrink-0 pl-2 text-note text-muted">Tri : écart à la base</span>
          <SensTri className="sens7--petit shrink-0" sens={sens} onChange={setSens} />
        </>
      }
    >
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="font-display text-affiche tracking-tight">IGN × Skiinfo</h1>
        <p className="mt-2 max-w-2xl text-corps text-muted">
          L’IGN donne l’altitude du repère GPS de la station (RGE ALTI). Skiinfo publie une plage
          d’altitudes, de la base au sommet. Écart médian entre l’IGN et la base Skiinfo :{" "}
          {sum.medianAbsBase != null ? `${sum.medianAbsBase} m` : "–"}. Deux repères restent au
          centre de la commune, pas au front de neige : Lans-en-Vercors et Goulier. L’IGN ne donne
          ni répartition des pistes ni kilomètres : ils ne sont pas comparés.
        </p>
        <div className="mt-4 overflow-x-auto rounded-surface border border-line bg-panel">
          <table className="w-full min-w-[40rem] text-left text-corps">
            <thead>
              <tr className="border-b border-line text-note text-muted">
                <th className="px-3 py-2 font-medium">Station</th>
                <th className="px-3 py-2 font-medium">Skiinfo</th>
                <th className="px-3 py-2 font-medium">IGN</th>
                <th className="px-3 py-2 font-medium">Δ base</th>
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
                    <p className="text-note text-muted">{r.massif}</p>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.skiMin != null && r.skiMax != null
                      ? `${formatAlt(r.skiMin)} – ${formatAlt(r.skiMax)}`
                      : "–"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.ignM != null ? formatAlt(r.ignM) : "–"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{delta(r.dBase)}</td>
                  <td className="px-3 py-2 text-muted">{VERDICT_FR[r.verdict]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </Coquille>
  );
}
