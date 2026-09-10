import { useEffect, useMemo } from "react";
import { listingEleM, eleKey, useElevations } from "@/lib/elevations";
import { formatAlt } from "@/lib/stations";
import { liftKindLabel, stationLifts } from "@/lib/osmAccess";
import { getListingElevations } from "@/lib/snow/api";

export function LiftBoard({ stationId }: { stationId: string }) {
  const lifts = useMemo(() => stationLifts(stationId), [stationId]);
  const byKey = useElevations((s) => s.byKey);
  const putEle = useElevations((s) => s.put);

  useEffect(() => {
    const pts: { lat: number; lon: number }[] = [];
    const seen = new Set<string>();
    const consider = (lat: number | null, lon: number | null) => {
      if (lat == null || lon == null || pts.length >= 160) return;
      const k = eleKey(lat, lon);
      if (seen.has(k) || k in byKey) return;
      seen.add(k);
      pts.push({ lat, lon });
    };
    for (const l of lifts) {
      consider(l.aLat, l.aLon);
      consider(l.bLat, l.bLon);
    }
    if (pts.length === 0) return;
    let cancelled = false;
    void getListingElevations({ data: { points: pts } }).then((rows) => {
      if (!cancelled) putEle(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [lifts, byKey, putEle]);

  const rows = lifts
    .map((l) => {
      const a = listingEleM(byKey, l.aLat, l.aLon);
      const b = l.bLat != null && l.bLon != null ? listingEleM(byKey, l.bLat, l.bLon) : null;
      const paired = a != null && b != null;
      const top = paired ? Math.max(a, b) : (a ?? b ?? null);
      const bot = paired ? Math.min(a as number, b as number) : null;
      const drop = paired && bot != null && top != null ? top - bot : null;
      return { ...l, top, bot, drop, paired };
    })
    .sort((x, y) => {
      if (x.paired !== y.paired) return x.paired ? -1 : 1;
      return (y.top ?? -1) - (x.top ?? -1);
    });
  const measured = rows.filter((r) => r.paired).length;

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-panel p-4" data-testid="lift-board">
      <p className="text-xs uppercase tracking-wide text-muted">Remontées OSM</p>
      <p className="mt-1 text-sm text-ink">
        {measured} / {lifts.length} avec les deux gares mesurées (modèle). Rien n’est inventé.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Appareil</th>
              <th className="py-1 pr-3 font-medium">Départ</th>
              <th className="py-1 pr-3 font-medium">Arrivée</th>
              <th className="py-1 font-medium">Dénivelé</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.name ?? "?"}|${r.kind}|${r.aLat}`} className="border-t border-line">
                <td className="py-1.5 pr-3">
                  <span className="font-medium">{r.name ?? "sans nom OSM"}</span>
                  <span className="block text-xs text-muted">{liftKindLabel(r.kind)}</span>
                </td>
                <td className="py-1.5 pr-3 text-muted">{r.bot != null ? formatAlt(r.bot) : "—"}</td>
                <td className="py-1.5 pr-3 font-semibold">{r.top != null && r.paired ? formatAlt(r.top) : "—"}</td>
                <td className="py-1.5">
                  {r.drop != null && r.drop >= 40 ? `+${r.drop.toLocaleString("fr-FR")} m` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
