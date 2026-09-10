import { altBands, altDeltaM } from "@/lib/alt";
import { formatAlt, type Station } from "@/lib/stations";

function cell(n: number | null): string {
  return n == null ? "—" : formatAlt(n);
}

function delta(n: number | null): string | null {
  if (n == null || n === 0) return null;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("fr-FR")} m`;
}

export function AltCard({ station }: { station: Station }) {
  const bands = altBands(station);
  const ski = bands.find((b) => b.source === "skiinfo");
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel p-4" data-testid="alt-card">
      <p className="text-xs uppercase tracking-wide text-muted">Altitudes de cette station</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 pr-3 font-medium">Source</th>
              <th className="pb-2 pr-3 font-medium">Village</th>
              <th className="pb-2 pr-3 font-medium">Base</th>
              <th className="pb-2 pr-3 font-medium">Sommet</th>
              <th className="pb-2 font-medium">Dénivelé</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => {
              const dSummit = ski && b !== ski ? altDeltaM(b.maxM, ski.maxM) : null;
              return (
                <tr key={b.source + b.label} className="border-t border-line">
                  <td className="py-2 pr-3 font-medium">{b.label}</td>
                  <td className="py-2 pr-3 tabular-nums">{cell(b.villageM)}</td>
                  <td className="py-2 pr-3 tabular-nums">{cell(b.minM)}</td>
                  <td className="py-2 pr-3 tabular-nums">
                    {cell(b.maxM)}
                    {dSummit != null ? (
                      <span className="ml-1 text-xs text-muted">{delta(dSummit)}</span>
                    ) : null}
                  </td>
                  <td className="py-2 tabular-nums">{cell(b.dropM)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Village et base/sommet sont ceux de cette fiche, pas du domaine lié. IGN = altitude du pin GPS
        (RGE ALTI).
        {station.gpsDup ? " Pin GPS identique à une autre station : altitudes IGN non distinctes." : ""}
        {station.pinKind === "sommet" ? " Le pin Skiinfo est au sommet : le village n’est pas l’IGN." : ""}
      </p>
    </section>
  );
}
