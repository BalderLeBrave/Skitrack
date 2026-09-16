/**
 * Limites de taux, même fichier que le sidecar Python.
 *
 * Relancer pendant la fenêtre ne recommence pas le compteur. Un 429 pose
 * `until` : Node et Python s'arrêtent tous les deux.
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";

const TAUX_PATH = () => process.env.SKITRACK_TAUX?.trim() || "/tmp/skitrack-taux.json";
const WINDOW_MS = 60_000;
const SLEEP_CAP_MS = 5_000;
const HOSTS: Record<string, { gapMs: number; maxHits: number }> = {
  airbnb: { gapMs: 2_000, maxHits: 18 },
  gites: { gapMs: 2_000, maxHits: 24 },
  booking: { gapMs: 1_200, maxHits: 24 },
};

type Row = { hits?: unknown; until?: unknown };
type Ledger = Record<string, Row>;

function load(): Ledger {
  try {
    const raw = JSON.parse(readFileSync(TAUX_PATH(), "utf8")) as unknown;
    return raw && typeof raw === "object" ? (raw as Ledger) : {};
  } catch {
    return {};
  }
}

function save(data: Ledger): void {
  try {
    const tmp = `${TAUX_PATH()}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, TAUX_PATH());
  } catch {
    /* tmp plein : le sidecar Python tient le journal */
  }
}

function hitsOf(row: Row | undefined, now: number): number[] {
  const raw = row?.hits;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is number => typeof t === "number" && now - t * 1000 < WINDOW_MS);
}

export function attenteTauxMs(host: string, now = Date.now()): number {
  const row = load()[host];
  const until = typeof row?.until === "number" ? row.until * 1000 : 0;
  if (until > now) return until - now;
  const hits = hitsOf(row, now).map((t) => t * 1000);
  const cfg = HOSTS[host] ?? { gapMs: 2_000, maxHits: 20 };
  let waitGap = 0;
  if (hits.length) waitGap = Math.max(0, Math.max(...hits) + cfg.gapMs - now);
  if (hits.length >= cfg.maxHits) {
    return Math.max(waitGap, WINDOW_MS - (now - Math.min(...hits)));
  }
  return waitGap;
}

export function noterHit(host: string, now = Date.now()): void {
  const data = load();
  const row = data[host];
  const hits = hitsOf(row, now);
  hits.push(now / 1000);
  data[host] = { hits, until: typeof row?.until === "number" ? row.until : 0 };
  save(data);
}

export function noterBlocage(host: string, waitMs: number, now = Date.now()): void {
  const data = load();
  const row = data[host];
  const until = Math.max(typeof row?.until === "number" ? row.until : 0, now / 1000 + Math.max(0.2, waitMs / 1000));
  data[host] = { hits: hitsOf(row, now), until };
  save(data);
}

export async function paceTaux(host: string, sleepCapMs = SLEEP_CAP_MS): Promise<number> {
  const wait = attenteTauxMs(host);
  if (wait <= 0) {
    noterHit(host);
    return 0;
  }
  if (wait <= sleepCapMs) {
    await new Promise((r) => setTimeout(r, wait));
    noterHit(host);
    return 0;
  }
  return wait;
}
