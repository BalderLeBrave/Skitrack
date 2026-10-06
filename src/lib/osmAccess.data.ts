/** Gares de remontées OSM / OpenSkiMap, sept. 2026. Pas d’invention. */
import access from "./osmAccess.snapshot.json" with { type: "json" };
import lifts from "./osmLifts.json" with { type: "json" };
import { remonteeHorsService } from "./remonteeEnService.ts";
import { STATIONS } from "./stations.ts";
import { VILLAGES } from "./villages.ts";

export type OsmPt = { n: string | null; k: string; lat: number; lon: number };
export type OsmStationAccess = { lifts: OsmPt[]; places: OsmPt[] };

/** Une gare compte si son appareil est en service (`remonteeEnService.ts`). */
const enService = (p: OsmPt) => !remonteeHorsService(p.n);

const PAR_ENTREE: Record<string, OsmStationAccess> = Object.fromEntries(
  Object.entries(access as Record<string, OsmStationAccess>).map(([id, a]) => [
    id,
    { ...a, lifts: a.lifts.filter(enService) },
  ]),
);

/** Les gares et lieux de deux relevés, sans doublon : les relevés voisins se
 *  recouvrent sur un même domaine. */
function reunir(a: readonly OsmPt[], b: readonly OsmPt[]): OsmPt[] {
  const vus = new Set(a.map((p) => `${p.n}|${p.k}|${p.lat}|${p.lon}`));
  return [...a, ...b.filter((p) => !vus.has(`${p.n}|${p.k}|${p.lat}|${p.lon}`))];
}

/** Repères des stations et de leurs villages, chacun avec sa station. */
const REPERES: { lat: number; lon: number; station: string }[] = [
  ...STATIONS.map((s) => ({ lat: s.lat, lon: s.lon, station: s.id })),
  ...VILLAGES.map((v) => ({ lat: v.lat, lon: v.lon, station: v.station })),
];

/** La station du repère le plus proche d'un point. Une distance plane suffit
 *  à comparer des repères distants de quelques kilomètres, et coûte moins
 *  que la formule exacte sur les milliers de gares des villages. */
function stationLaPlusProche(p: OsmPt): string | null {
  const k = Math.cos((p.lat * Math.PI) / 180);
  let best: string | null = null;
  let bestD = Infinity;
  for (const r of REPERES) {
    const dLat = p.lat - r.lat;
    const dLon = (p.lon - r.lon) * k;
    const d = dLat * dLat + dLon * dLon;
    if (d < bestD) {
      bestD = d;
      best = r.station;
    }
  }
  return best;
}

/**
 * Gares et lieux par station. Le relevé est rangé par entrée de l'ancien
 * référentiel, villages compris : depuis que les villages se rattachent à leur
 * station (`villages.ts`, 5 octobre 2026), les gares de Plagne Centre ou de
 * Val Claret sont celles de La Plagne ou de Tignes. Le relevé d'un village
 * rejoint donc celui de sa station ; sa clé reste lisible.
 *
 * Seulement ce qui est à elle : le relevé d'un village a été pris dans un
 * rayon autour de son repère, et celui du Fornet porte sept gares de
 * Bonneval, de l'autre côté de l'Iseran. Une gare ou un lieu ne rejoint la
 * station que si le repère le plus proche (station ou village) est le sien.
 */
export const OSM_ACCESS: Record<string, OsmStationAccess> = (() => {
  const out: Record<string, OsmStationAccess> = { ...PAR_ENTREE };
  for (const v of VILLAGES) {
    const du = PAR_ENTREE[v.id];
    if (!du) continue;
    const aElle = (p: OsmPt) => stationLaPlusProche(p) === v.station;
    const vers = out[v.station] ?? { lifts: [], places: [] };
    out[v.station] = {
      lifts: reunir(vers.lifts, du.lifts.filter(aElle)),
      places: reunir(vers.places, du.places.filter(aElle)),
    };
  }
  return out;
})();
/** Toutes les gares de remontées françaises, pour mesurer hors des 8 stations d’origine. */
export const OSM_LIFTS: OsmPt[] = (lifts as OsmPt[]).filter(enService);
