/** Gares de remontées OSM / OpenSkiMap, sept. 2026. Pas d’invention. */
import access from "./osmAccess.snapshot.json" with { type: "json" };
import lifts from "./osmLifts.json" with { type: "json" };

export type OsmPt = { n: string | null; k: string; lat: number; lon: number };
export type OsmStationAccess = { lifts: OsmPt[]; places: OsmPt[] };

export const OSM_ACCESS: Record<string, OsmStationAccess> = access as Record<string, OsmStationAccess>;
/** Toutes les gares de remontées françaises, pour mesurer hors des 8 stations d’origine. */
export const OSM_LIFTS: OsmPt[] = lifts as OsmPt[];
