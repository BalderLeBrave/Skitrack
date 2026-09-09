export type LiftEnds = {
  liftLat?: number | null;
  liftLon?: number | null;
  liftOtherLat?: number | null;
  liftOtherLon?: number | null;
};

function alt(n: number): string {
  return `${n.toLocaleString("fr-FR")} m`;
}

/** Altitudes modèle des deux gares OSM. Rien n’est inventé. */
export function formatLiftSpan(
  listing: LiftEnds,
  eleOf: (lat: number, lon: number) => number | null | undefined,
): string | null {
  if (listing.liftLat == null || listing.liftLon == null) return null;
  const a = eleOf(listing.liftLat, listing.liftLon);
  if (listing.liftOtherLat == null || listing.liftOtherLon == null) {
    return a != null ? `gare OSM ${alt(a)}` : null;
  }
  const b = eleOf(listing.liftOtherLat, listing.liftOtherLon);
  if (a == null || b == null) return null;
  const top = Math.max(a, b);
  const bot = Math.min(a, b);
  const drop = top - bot;
  if (drop < 40) return `gares OSM à ${alt(top)}`;
  return `arrivée ${alt(top)} · +${drop.toLocaleString("fr-FR")} m`;
}
