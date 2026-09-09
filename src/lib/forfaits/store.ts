/** Règles d’écriture d’un relevé. Un manuel verrouillé n’est jamais écrasé. */

import type { ForfaitReading, ForfaitRow, ForfaitStatus } from "./types";

export const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000;
export const MAX_HISTORY = 24;

export function emptyRow(slug: string, patch: Partial<ForfaitRow> = {}): ForfaitRow {
  return {
    slug,
    j1: null,
    j6: null,
    enf6: null,
    kind: null,
    validFrom: null,
    validTo: null,
    sourceUrl: null,
    fetchedAt: null,
    lastAttemptAt: null,
    status: "erreur",
    locked: false,
    lastError: null,
    parseKind: null,
    history: [],
    ...patch,
  };
}

export function isStale(row: ForfaitRow, ttlMs: number, now = Date.now()): boolean {
  if (row.locked) return false;
  if (row.status === "estimé") return true;
  if (row.fetchedAt == null) return true;
  return now - Date.parse(row.fetchedAt) > ttlMs;
}

export function markStaleIfNeeded(row: ForfaitRow, ttlMs: number, now = Date.now()): ForfaitRow {
  if (row.locked || row.status === "estimé" || row.status === "erreur") return row;
  if (isStale(row, ttlMs, now) && row.status === "ok") return { ...row, status: "stale" };
  return row;
}

function pushHistory(row: ForfaitRow, at: string): ForfaitReading[] {
  const next: ForfaitReading = {
    at,
    j1: row.j1,
    j6: row.j6,
    enf6: row.enf6,
    sourceUrl: row.sourceUrl,
  };
  return [next, ...row.history].slice(0, MAX_HISTORY);
}

export function applyExtracted(
  row: ForfaitRow,
  extracted: { j1: number | null; j6: number | null; enf6: number | null; kind: string },
  sourceUrl: string,
  nowIso: string,
): { row: ForfaitRow; outcome: "updated" | "skipped_manual" | "unchanged" } {
  if (row.locked || row.status === "manuel") {
    return {
      row: { ...row, lastAttemptAt: nowIso, lastError: null },
      outcome: "skipped_manual",
    };
  }
  if (
    row.j1 === extracted.j1 &&
    row.j6 === extracted.j6 &&
    row.enf6 === extracted.enf6 &&
    row.sourceUrl === sourceUrl &&
    (row.status === "ok" || row.status === "stale")
  ) {
    return {
      row: { ...row, lastAttemptAt: nowIso, lastError: null, status: "ok", fetchedAt: nowIso },
      outcome: "unchanged",
    };
  }
  const next: ForfaitRow = {
    ...row,
    j1: extracted.j1,
    j6: extracted.j6,
    enf6: extracted.enf6,
    kind: extracted.j6 != null ? "6 jours" : extracted.j1 != null ? "journée" : row.kind,
    sourceUrl,
    fetchedAt: nowIso,
    lastAttemptAt: nowIso,
    status: "ok",
    lastError: null,
    parseKind: extracted.kind,
  };
  next.history = pushHistory(next, nowIso);
  return { row: next, outcome: "updated" };
}

export function markFailure(row: ForfaitRow, error: string, nowIso: string): ForfaitRow {
  const hasPrice = row.j1 != null || row.j6 != null;
  return {
    ...row,
    lastAttemptAt: nowIso,
    lastError: error,
    status: hasPrice ? (row.status === "manuel" ? "manuel" : "stale") : "erreur",
  };
}

export function lockManual(
  row: ForfaitRow,
  prices: { j1: number | null; j6: number | null; enf6?: number | null },
  nowIso: string,
  sourceUrl?: string,
): ForfaitRow {
  return {
    ...row,
    j1: prices.j1,
    j6: prices.j6,
    enf6: prices.enf6 ?? row.enf6,
    locked: true,
    status: "manuel",
    fetchedAt: nowIso,
    lastAttemptAt: nowIso,
    lastError: null,
    sourceUrl: sourceUrl ?? row.sourceUrl,
    parseKind: "manuel",
    history: pushHistory(
      {
        ...row,
        j1: prices.j1,
        j6: prices.j6,
        enf6: prices.enf6 ?? row.enf6,
        sourceUrl: sourceUrl ?? row.sourceUrl,
      },
      nowIso,
    ),
  };
}

export function statusOf(row: ForfaitRow, ttlMs: number, now = Date.now()): ForfaitStatus {
  return markStaleIfNeeded(row, ttlMs, now).status;
}
