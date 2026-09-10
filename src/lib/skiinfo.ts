/** Relevé Skiinfo France (témoin publié). Date : 2026-09-09. Pas un scrape live. */

import raw from "./skiinfo.snapshot.json" with { type: "json" };
import photosRaw from "./skiinfo.photos.json" with { type: "json" };
import localPhotosRaw from "./skiinfo.photos.local.json" with { type: "json" };
import { allocateInts, type PisteCounts, type StationSlopes } from "./pistes.ts";

export type SkiinfoPct = { green: number; blue: number; red: number; black: number };

export type SkiinfoRow = {
  n: number | null;
  km: number | null;
  pct: SkiinfoPct;
  longestKm: number | null;
  grain: "station" | "valley";
  url: string;
  at: string;
  hasMix: boolean;
  minM: number | null;
  maxM: number | null;
};

type Snapshot = { at: string; rows: Record<string, SkiinfoRow> };

export const SKIINFO_AT = (raw as Snapshot).at;
export const SKIINFO: Record<string, SkiinfoRow> = (raw as Snapshot).rows;

type PhotoSnap = { at: string; rows: Record<string, { url: string | null }> };
export const SKIINFO_PHOTOS: Record<string, string | null> = Object.fromEntries(
  Object.entries((photosRaw as PhotoSnap).rows).map(([id, row]) => [id, row.url]),
);

const LOCAL_FILES = new Set((localPhotosRaw as { files: string[] }).files);

/** Photo Skiinfo de la fiche, fichier local (copie de la photo publiée). */
export function skiinfoPhotoAsset(url: string): string {
  const path = url.split("?")[0] ?? url;
  const local = path.match(/\/stations\/([^/]+)\.jpe?g$/i);
  if (local) return local[1];
  const m = path.match(/\/as\/([^/]+)\//);
  return m?.[1] ?? path;
}

export function skiinfoPhoto(id: string, _width = 1400): string | null {
  const url = SKIINFO_PHOTOS[id];
  if (!url || url.includes("resort_header") || url.startsWith("/")) return null;
  if (!LOCAL_FILES.has(id)) return null;
  return `/stations/${id}.jpg`;
}

export function countsFromSkiinfo(n: number, pct: SkiinfoPct): PisteCounts {
  const [green, blue, red, black] = allocateInts([pct.green, pct.blue, pct.red, pct.black], n);
  return { green, blue, red, black };
}

export function slopesFromRow(row: SkiinfoRow | undefined): StationSlopes {
  if (!row || !row.hasMix || row.n == null) {
    return {
      announcedKm: row?.km ?? 0,
      counts: {},
      source: "skiinfo",
      quality: "partial",
      skiinfoGrain: row?.grain ?? "station",
    };
  }
  return {
    announcedKm: row.km ?? 0,
    counts: countsFromSkiinfo(row.n, row.pct),
    pct: row.pct,
    source: "skiinfo",
    quality: row.km != null && row.km > 0 ? "ok" : "partial",
    skiinfoGrain: row.grain,
  };
}

export function slopesFromSkiinfo(id: string): StationSlopes {
  return slopesFromRow(SKIINFO[id]);
}
