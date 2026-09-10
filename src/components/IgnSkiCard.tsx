import { Link } from "@tanstack/react-router";
import { ignSkiinfo, VERDICT_FR } from "@/lib/ignSkiinfo";
import { formatAlt, type Station } from "@/lib/stations";

function cell(n: number | null): string {
  return n == null ? "—" : formatAlt(n);
}

function delta(n: number | null): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("fr-FR")} m`;
}

export function IgnSkiCard({ station }: { station: Station }) {
  const r = ignSkiinfo(station);
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel p-4" data-testid="ign-ski-card">
      <p className="text-xs uppercase tracking-wide text-muted">IGN × Skiinfo</p>
      <p className="mt-1 text-sm font-medium">{VERDICT_FR[r.verdict]}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[16rem] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 pr-3 font-medium">Champ</th>
              <th className="pb-2 pr-3 font-medium">Skiinfo</th>
              <th className="pb-2 pr-3 font-medium">IGN pin</th>
              <th className="pb-2 font-medium">Δ</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line">
              <td className="py-1.5 pr-3">Base / village</td>
              <td className="py-1.5 pr-3 tabular-nums">{cell(r.skiMin)}</td>
              <td className="py-1.5 pr-3 tabular-nums">{cell(r.ignM)}</td>
              <td className="py-1.5 tabular-nums">{delta(r.dBase)}</td>
            </tr>
            <tr className="border-t border-line">
              <td className="py-1.5 pr-3">Sommet</td>
              <td className="py-1.5 pr-3 tabular-nums">{cell(r.skiMax)}</td>
              <td className="py-1.5 pr-3 text-muted">pas un sommet IGN</td>
              <td className="py-1.5 tabular-nums">{delta(r.dSummit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        IGN RGE ALTI = un point. Skiinfo = bande publiée. Pas de mix ni de km côté IGN.{" "}
        <Link to="/altitudes" className="text-ink underline-offset-2 hover:underline">
          231 stations
        </Link>
      </p>
    </section>
  );
}
