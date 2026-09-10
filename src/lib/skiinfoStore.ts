/** Overlay Skiinfo en mémoire. Le snapshot JSON reste le repli. */

import type { SkiinfoRow } from "./skiinfo.ts";

export const SKIINFO_TTL_MS = 24 * 60 * 60 * 1000;

export type SkiinfoStatus = "ok" | "stale" | "erreur" | "seed";

export type SkiinfoLive = SkiinfoRow & {
  status: SkiinfoStatus;
  fetchedAt: string | null;
  lastError: string | null;
  photoUrl: string | null;
  photoRev: number | null;
};

export function seedLive(row: SkiinfoRow): SkiinfoLive {
  return {
    ...row,
    status: "seed",
    fetchedAt: row.at ? `${row.at}T12:00:00.000Z` : null,
    lastError: null,
    photoUrl: null,
    photoRev: null,
  };
}

export function isStale(row: SkiinfoLive, ttlMs = SKIINFO_TTL_MS, now = Date.now()): boolean {
  if (row.status === "seed" || row.status === "erreur") return true;
  if (row.fetchedAt == null) return true;
  const at = Date.parse(row.fetchedAt);
  return !Number.isFinite(at) || now - at > ttlMs;
}

export function markStaleIfNeeded(row: SkiinfoLive, ttlMs = SKIINFO_TTL_MS, now = Date.now()): SkiinfoLive {
  if (row.status === "ok" && isStale(row, ttlMs, now)) return { ...row, status: "stale" };
  return row;
}

export function formatSkiinfoAge(row: SkiinfoLive, now = Date.now()): string {
  const at = Date.parse(row.fetchedAt ?? "");
  if (!Number.isFinite(at)) return `relevé ${row.at}`;
  if (row.status === "erreur") return row.lastError ? `fiche injoignable — ${row.lastError}` : "fiche injoignable";
  if (row.status === "stale") return "relevé à actualiser";
  const delta = now - at;
  if (delta < 60_000) return "à l’instant";
  if (delta < 3_600_000) return `il y a ${Math.max(1, Math.round(delta / 60_000))} min`;
  if (delta < 36_000_000) return `il y a ${Math.max(1, Math.round(delta / 3_600_000))} h`;
  return new Date(at).toLocaleDateString("fr-FR");
}
