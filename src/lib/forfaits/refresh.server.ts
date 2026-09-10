/** Connecteur forfaits. Distinct des logements. robots.txt n’est pas consulté. */

import { allowsPath } from "@/lib/scrape/robots";
import { domainBySlug, estimateForfait, FORFAIT_CATALOG } from "./catalog";
import { extractForfaits } from "./extract";
import { applyExtracted, DEFAULT_TTL_MS, emptyRow, isStale, markFailure, markStaleIfNeeded } from "./store";
import type { ForfaitRow } from "./types";

const CANDIDATE_PATHS = [
  "",
  "/forfaits",
  "/forfaits-ski",
  "/skipass",
  "/tarifs",
  "/tickets",
  "/billetterie",
  "/fr/forfaits",
];

const FETCH_TIMEOUT_MS = 12_000;
const DELAY_MS = 400;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const memory = new Map<string, ForfaitRow>();
let ttlMs = DEFAULT_TTL_MS;

export function forfaitTtlMs(): number {
  return ttlMs;
}

export function setForfaitTtlMs(ms: number): void {
  if (Number.isFinite(ms) && ms >= 30 * 60 * 1000) ttlMs = ms;
}

function seedRow(slug: string): ForfaitRow {
  const domain = domainBySlug(slug);
  if (!domain) return emptyRow(slug, { lastError: "Domaine inconnu." });
  const seed = domain.seed;
  if (seed && (seed.j1 != null || seed.j6 != null)) {
    const fetchedAt = seed.maj ? `${seed.maj}T12:00:00.000Z` : null;
    return markStaleIfNeeded(
      emptyRow(slug, {
        j1: seed.j1,
        j6: seed.j6,
        enf6: seed.enf6,
        kind: seed.j6 != null ? "6 jours" : "journée",
        sourceUrl: domain.website,
        fetchedAt,
        lastAttemptAt: fetchedAt,
        status: "ok",
        parseKind: "referentiel",
      }),
      ttlMs,
    );
  }
  const est = estimateForfait(domain.km, domain.maxM);
  return emptyRow(slug, {
    ...est,
    status: "estimé",
    kind: "6 jours",
    lastError: "Aucun relevé — estimation km + altitude, hors coût officiel.",
  });
}

export function getStored(slug: string): ForfaitRow {
  const hit = memory.get(slug);
  if (hit) return markStaleIfNeeded(hit, ttlMs);
  const row = seedRow(slug);
  memory.set(slug, row);
  return row;
}

function candidates(website: string): string[] {
  const raw = website.trim().startsWith("http") ? website.trim() : `https://${website.trim()}`;
  let origin: string;
  try {
    origin = new URL(raw).origin;
  } catch {
    return [];
  }
  const seen: string[] = [];
  for (const path of CANDIDATE_PATHS) {
    const url = path === "" ? raw : `${origin}${path}`;
    if (!seen.includes(url)) seen.push(url);
  }
  return seen;
}

async function fetchHtml(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function refreshOne(slug: string, force = false): Promise<ForfaitRow> {
  const domain = domainBySlug(slug);
  let row = getStored(slug);
  if (row.locked) return { ...row, lastAttemptAt: new Date().toISOString() };
  if (!force && !isStale(row, ttlMs) && row.status === "ok") return row;
  if (!domain?.website) {
    const next = markFailure(row, "URL source absente.", new Date().toISOString());
    memory.set(slug, next);
    return next;
  }

  const origin = (() => {
    try {
      return new URL(domain.website).origin;
    } catch {
      return domain.website;
    }
  })();
  await allowsPath(origin, "/");

  let lastError = "Aucun tarif lisible.";
  for (const url of candidates(domain.website)) {
    try {
      const page = await fetchHtml(url);
      if (!page.ok) {
        lastError = `HTTP ${page.status}`;
        continue;
      }
      const extracted = extractForfaits(page.text);
      if (!extracted) {
        lastError = "Page lue, tarif illisible.";
        continue;
      }
      const applied = applyExtracted(row, extracted, url, new Date().toISOString());
      memory.set(slug, applied.row);
      return applied.row;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  const failed = markFailure(row, lastError, new Date().toISOString());
  memory.set(slug, failed);
  return failed;
}

export async function refreshMany(slugs: string[], force = false): Promise<ForfaitRow[]> {
  const out: ForfaitRow[] = [];
  for (const slug of slugs) {
    out.push(await refreshOne(slug, force));
    await sleep(DELAY_MS);
  }
  return out;
}

export function listStored(): ForfaitRow[] {
  return FORFAIT_CATALOG.filter((d) => d.country === "FR").map((d) => getStored(d.slug));
}

export function lastSyncAt(): string | null {
  let latest: string | null = null;
  for (const row of memory.values()) {
    const at = row.lastAttemptAt;
    if (at && (!latest || at > latest)) latest = at;
  }
  return latest;
}

export { FORFAIT_CATALOG };
