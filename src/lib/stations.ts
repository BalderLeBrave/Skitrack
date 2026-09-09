/** Altitudes France Montagnes. Mix de pistes : comptes OSM, km = total annoncé. */

import { type StationSlopes } from "./pistes";

export type Station = {
  id: string;
  name: string;
  massif: string;
  villageM: number;
  minM: number;
  maxM: number;
  photo: string | null;
  fmId: number;
  lat: number;
  lon: number;
  slopes: StationSlopes;
};

export const STATIONS: Station[] = [
  {
    id: "les-2-alpes",
    name: "Les 2 Alpes",
    massif: "Alpes du Nord",
    villageM: 1645,
    minM: 1284,
    maxM: 3511,
    photo: "/stations/les-2-alpes.jpg",
    fmId: 1076,
    lat: 45.009,
    lon: 6.122,
    slopes: {
      announcedKm: 225,
      counts: { green: 62, blue: 137, red: 33, black: 17, other: 1 },
      source: "osm",
    },
  },
  {
    id: "chamonix",
    name: "Chamonix-Mont-Blanc",
    massif: "Alpes du Nord",
    villageM: 1075,
    minM: 1046,
    maxM: 2505,
    photo: "/stations/chamonix.jpg",
    fmId: 1023,
    lat: 45.923,
    lon: 6.869,
    slopes: {
      announcedKm: 150,
      counts: { green: 17, blue: 19, red: 23, black: 13 },
      source: "osm",
    },
  },
  {
    id: "val-thorens",
    name: "Val Thorens",
    massif: "Alpes du Nord",
    villageM: 2321,
    minM: 1110,
    maxM: 3223,
    photo: "/stations/val-thorens.jpg",
    fmId: 1146,
    lat: 45.298,
    lon: 6.58,
    slopes: {
      announcedKm: 150,
      counts: { green: 168, blue: 422, red: 222, black: 55, other: 4 },
      source: "osm",
    },
  },
  {
    id: "tignes",
    name: "Tignes",
    massif: "Alpes du Nord",
    villageM: 2171,
    minM: 1559,
    maxM: 3456,
    photo: "/stations/tignes.jpg",
    fmId: 1139,
    lat: 45.469,
    lon: 6.907,
    slopes: {
      announcedKm: 150,
      counts: { green: 68, blue: 195, red: 111, black: 30, other: 11 },
      source: "osm",
    },
  },
  {
    id: "meribel",
    name: "Méribel",
    massif: "Alpes du Nord",
    villageM: 1413,
    minM: 1110,
    maxM: 3223,
    photo: "/stations/meribel.jpg",
    fmId: 1101,
    lat: 45.397,
    lon: 6.565,
    slopes: {
      announcedKm: 150,
      counts: { green: 168, blue: 422, red: 222, black: 55, other: 4 },
      source: "osm",
    },
  },
  {
    id: "val-disere",
    name: "Val d'Isère",
    massif: "Alpes du Nord",
    villageM: 1829,
    minM: 1559,
    maxM: 3456,
    photo: "/stations/val-disere.jpg",
    fmId: 1145,
    lat: 45.448,
    lon: 6.98,
    slopes: {
      announcedKm: 150,
      counts: { green: 68, blue: 195, red: 111, black: 30, other: 11 },
      source: "osm",
    },
  },
  {
    id: "alpe-d-huez",
    name: "Alpe d'Huez",
    massif: "Alpes du Nord",
    villageM: 1807,
    minM: 1124,
    maxM: 3314,
    photo: "/stations/alpe-d-huez.jpg",
    fmId: 1004,
    lat: 45.09,
    lon: 6.071,
    slopes: {
      announcedKm: 250,
      counts: { green: 131, blue: 89, red: 75, black: 33, other: 22 },
      source: "osm",
    },
  },
  {
    id: "la-clusaz",
    name: "La Clusaz",
    massif: "Alpes du Nord",
    villageM: 1104,
    minM: 1030,
    maxM: 2476,
    photo: "/stations/la-clusaz.jpg",
    fmId: 1049,
    lat: 45.904,
    lon: 6.423,
    slopes: {
      announcedKm: 125,
      counts: { green: 29, blue: 60, red: 47, black: 11, other: 1 },
      source: "osm",
    },
  },
];

export function stationById(id: string): Station | undefined {
  return STATIONS.find((s) => s.id === id);
}

export function dropM(station: Station): number {
  return Math.max(0, station.maxM - station.minM);
}

export function formatAlt(n: number): string {
  return `${n.toLocaleString("fr-FR")} m`;
}
