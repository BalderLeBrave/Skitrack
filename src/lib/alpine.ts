/** Carte France : pins GPS, altitude IGN au pin. Alpes + autres massifs. */

import { skiinfoPhoto } from "./skiinfo.ts";
import { STATIONS, type Station } from "./stations.ts";

export const ALPINE_MASSIFS = ["Alpes du Nord", "Alpes du Sud"] as const;
export type AlpineMassif = (typeof ALPINE_MASSIFS)[number];

export type MapFilter =
  | "all"
  | "nord"
  | "sud"
  | "pyrenees"
  | "jura"
  | "vosges"
  | "central"
  | "corse"
  | "haut";

const MASSIF: Record<Exclude<MapFilter, "all" | "haut">, string> = {
  nord: "Alpes du Nord",
  sud: "Alpes du Sud",
  pyrenees: "Pyrénées",
  jura: "Jura",
  vosges: "Vosges",
  central: "Massif Central",
  corse: "Corse",
};

export function isAlpine(station: Station): boolean {
  return station.massif === "Alpes du Nord" || station.massif === "Alpes du Sud";
}

export function alpineStations(): Station[] {
  return STATIONS.filter(isAlpine);
}

export function mapFilter(stations: readonly Station[], filter: MapFilter): Station[] {
  if (filter === "all") return [...stations];
  if (filter === "haut") return stations.filter((s) => s.maxM >= 3000);
  return stations.filter((s) => s.massif === MASSIF[filter]);
}

/** @deprecated use mapFilter */
export function alpineFilter(stations: readonly Station[], filter: "all" | "nord" | "sud" | "haut"): Station[] {
  return mapFilter(stations, filter);
}

export function alpineFeatureCollection(stations: readonly Station[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: stations.map((s) => ({
      type: "Feature",
      properties: {
        id: s.id,
        name: s.name,
        massif: s.massif,
        villageM: s.villageM,
        minM: s.minM,
        maxM: s.maxM,
        demM: s.demM,
        pinKind: s.pinKind,
        photo: skiinfoPhoto(s.id, 640),
        haut: s.maxM >= 3000 ? 1 : 0,
        nord: s.massif === "Alpes du Nord" ? 1 : 0,
      },
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
    })),
  };
}

export const ALPINE_CENTER: [number, number] = [6.35, 45.15];
export const ALPINE_ZOOM = 6.6;

/** Vue d’ouverture de l’écran « Carte des stations » : la France entière. */
export const CARTE_CENTER: [number, number] = [4.6, 45.4];
export const CARTE_ZOOM = 6;

export function mapView(filter: MapFilter): { center: [number, number]; zoom: number; maxFit: number } {
  if (filter === "nord" || filter === "sud") return { center: ALPINE_CENTER, zoom: 7.2, maxFit: 9.2 };
  if (filter === "pyrenees") return { center: [0.55, 42.85], zoom: 7.2, maxFit: 9 };
  if (filter === "jura") return { center: [6.05, 46.55], zoom: 8, maxFit: 10 };
  if (filter === "vosges") return { center: [6.95, 48.05], zoom: 8.2, maxFit: 10 };
  if (filter === "central") return { center: [3.1, 45.3], zoom: 7.4, maxFit: 9.5 };
  if (filter === "corse") return { center: [9.15, 42.15], zoom: 8.5, maxFit: 11 };
  if (filter === "haut") return { center: [6.2, 45.2], zoom: 6.4, maxFit: 8 };
  return { center: [2.9, 45.35], zoom: 5.45, maxFit: 6.4 };
}
