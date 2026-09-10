/** Catalogue stations FR. Village = FM ou IGN au pin (pas le sommet). Min/max = fiche Skiinfo. */

import type { StationSlopes } from "./pistes.ts";
import { skiinfoPhoto, slopesFromSkiinfo } from "./skiinfo.ts";
import rows from "./stations.data.json" with { type: "json" };

export type PinKind = "base" | "sommet" | "autre" | "inconnu";

export type Station = {
  id: string;
  name: string;
  massif: string;
  villageM: number;
  minM: number;
  maxM: number;
  photo: string | null;
  fmId: number | null;
  fmVillageM: number | null;
  fmMinM: number | null;
  fmMaxM: number | null;
  demM: number | null;
  pinKind: PinKind;
  gpsDup: boolean;
  lat: number;
  lon: number;
  slopes: StationSlopes;
};

type StationRow = Omit<Station, "slopes">;

export const STATIONS: Station[] = (rows as StationRow[]).map((row) => ({
  ...row,
  photo: skiinfoPhoto(row.id),
  slopes: slopesFromSkiinfo(row.id),
}));

export function stationById(id: string): Station | undefined {
  return STATIONS.find((s) => s.id === id);
}

export function dropM(station: Station): number {
  return Math.max(0, station.maxM - station.minM);
}

export function formatAlt(n: number): string {
  return `${n.toLocaleString("fr-FR")} m`;
}
