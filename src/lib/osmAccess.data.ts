/** Gares de remontées OSM / OpenSkiMap, sept. 2026. Pas d’invention. */
import access from "./osmAccess.snapshot.json" with { type: "json" };
import lifts from "./osmLifts.json" with { type: "json" };
import { remonteeHorsService } from "./remonteeEnService.ts";

export type OsmPt = { n: string | null; k: string; lat: number; lon: number };
export type OsmStationAccess = { lifts: OsmPt[]; places: OsmPt[] };

/** Une gare compte si son appareil est en service (`remonteeEnService.ts`). */
const enService = (p: OsmPt) => !remonteeHorsService(p.n);

export const OSM_ACCESS: Record<string, OsmStationAccess> = Object.fromEntries(
  Object.entries(access as Record<string, OsmStationAccess>).map(([id, a]) => [
    id,
    { ...a, lifts: a.lifts.filter(enService) },
  ]),
);
/** Toutes les gares de remontées françaises, pour mesurer hors des 8 stations d’origine. */
export const OSM_LIFTS: OsmPt[] = (lifts as OsmPt[]).filter(enService);
