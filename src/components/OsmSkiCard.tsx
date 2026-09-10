import { Link } from "@tanstack/react-router";
import { OSM_VERDICT_FR, osmSkiinfo } from "@/lib/openskimap";
import { formatKm } from "@/lib/pistes";
import { formatAlt, type Station } from "@/lib/stations";

function n(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("fr-FR");
}

function km(v: number | null): string {
  return v == null ? "—" : `${formatKm(v)} km`;
}

export function OsmSkiCard({ station }: { station: Station }) {
  const r = osmSkiinfo(station);
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel p-4" data-testid="osm-ski-card">
      <p className="text-xs uppercase tracking-wide text-muted">OpenSkiMap × Skiinfo</p>
      <p className="mt-1 text-sm font-medium">{OSM_VERDICT_FR[r.verdict]}</p>
      {r.osmName ? <p className="text-sm text-muted">OSM : {r.osmName}</p> : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[16rem] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 pr-3 font-medium">Champ</th>
              <th className="pb-2 pr-3 font-medium">Skiinfo</th>
              <th className="pb-2 font-medium">OpenSkiMap</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line">
              <td className="py-1.5 pr-3">Pistes / tracés</td>
              <td className="py-1.5 pr-3 tabular-nums">{n(r.nSki)}</td>
              <td className="py-1.5 tabular-nums">{n(r.nOsm)}</td>
            </tr>
            <tr className="border-t border-line">
              <td className="py-1.5 pr-3">Kilomètres</td>
              <td className="py-1.5 pr-3 tabular-nums">{km(r.kmSki)}</td>
              <td className="py-1.5 tabular-nums">{km(r.kmOsm)}</td>
            </tr>
            <tr className="border-t border-line">
              <td className="py-1.5 pr-3">Base – sommet</td>
              <td className="py-1.5 pr-3 tabular-nums">
                {r.minSki != null && r.maxSki != null ? `${formatAlt(r.minSki)} – ${formatAlt(r.maxSki)}` : "—"}
              </td>
              <td className="py-1.5 tabular-nums">
                {r.minOsm != null && r.maxOsm != null ? `${formatAlt(r.minOsm)} – ${formatAlt(r.maxOsm)}` : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        OpenSkiMap = OSM (tuiles OpenSnowMap). Pas OpenSnow.com. Les km OSM sont mesurés sur les ways, pas la brochure.{" "}
        <Link to="/openskimap" className="text-ink underline-offset-2 hover:underline">
          231 stations
        </Link>
      </p>
    </section>
  );
}
