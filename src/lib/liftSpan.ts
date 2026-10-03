import { langueIntl } from "./i18n/langue.ts";
import { tr } from "./i18n/tr.ts";
export type LiftEnds = {
  liftLat?: number | null;
  liftLon?: number | null;
  liftOtherLat?: number | null;
  liftOtherLon?: number | null;
};

function alt(n: number): string {
  return `${n.toLocaleString(langueIntl())} m`;
}

/** Altitude d’arrivée = gare OSM la plus haute. Les deux gares doivent être mesurées. */
export function liftArrivalM(
  listing: LiftEnds,
  eleOf: (lat: number, lon: number) => number | null | undefined,
): number | null {
  if (
    listing.liftLat == null ||
    listing.liftLon == null ||
    listing.liftOtherLat == null ||
    listing.liftOtherLon == null
  ) {
    return null;
  }
  const a = eleOf(listing.liftLat, listing.liftLon);
  const b = eleOf(listing.liftOtherLat, listing.liftOtherLon);
  if (a == null || b == null) return null;
  return Math.max(a, b);
}

/** Altitudes modèle des deux gares OSM. Rien n’est inventé. */
export function formatLiftSpan(
  listing: LiftEnds,
  eleOf: (lat: number, lon: number) => number | null | undefined,
): string | null {
  if (listing.liftLat == null || listing.liftLon == null) return null;
  const a = eleOf(listing.liftLat, listing.liftLon);
  if (listing.liftOtherLat == null || listing.liftOtherLon == null) {
    return a != null ? tr("gare à {altitude}", { altitude: alt(a) }) : null;
  }
  const b = eleOf(listing.liftOtherLat, listing.liftOtherLon);
  if (a == null || b == null) return null;
  const top = Math.max(a, b);
  const bot = Math.min(a, b);
  const drop = top - bot;
  if (drop < 40) return tr("gares à {altitude}", { altitude: alt(top) });
  return tr("arrivée {altitude} · +{denivele} m", { altitude: alt(top), denivele: drop.toLocaleString(langueIntl()) });
}
