/** Tick silencieux : forfaits FR + fiches Skiinfo (mix / photo). */

import { FORFAIT_CATALOG } from "@/lib/forfaits/catalog";
import { getStored, refreshOne, forfaitTtlMs } from "@/lib/forfaits/refresh.server";
import { isStale as forfaitStale } from "@/lib/forfaits/store";
import { SKIINFO } from "@/lib/skiinfo";
import { getStoredSkiinfo, refreshSkiinfo } from "@/lib/skiinfoRefresh.server";
import { isStale as skiinfoStale } from "@/lib/skiinfoStore";
import { pickRoundRobin } from "./autoSync";

export type SyncTick = {
  idle: boolean;
  forfaits: string[];
  skiinfo: string[];
  remaining: boolean;
};

const PASS_IDS = FORFAIT_CATALOG.filter((d) => d.country === "FR").map((d) => d.slug);
const SKI_IDS = Object.keys(SKIINFO);
const RETRY_MS = 60 * 60 * 1000;

let passCursor = 0;
let skiCursor = 0;

export function syncQueues(): { forfaits: number; skiinfo: number } {
  return { forfaits: PASS_IDS.length, skiinfo: SKI_IDS.length };
}

function forfaitDue(slug: string, now = Date.now()): boolean {
  const row = getStored(slug);
  if (row.locked) return false;
  if (!forfaitStale(row, forfaitTtlMs(), now)) return false;
  if (row.lastAttemptAt) {
    const attempt = Date.parse(row.lastAttemptAt);
    const fetched = row.fetchedAt ? Date.parse(row.fetchedAt) : 0;
    if (
      Number.isFinite(attempt) &&
      now - attempt < RETRY_MS &&
      attempt >= fetched &&
      row.status !== "ok"
    ) {
      return false;
    }
  }
  return true;
}

function skiinfoDue(id: string, now = Date.now()): boolean {
  const row = getStoredSkiinfo(id);
  if (!skiinfoStale(row, undefined, now)) return false;
  if (row.status === "erreur" && row.fetchedAt) {
    const at = Date.parse(row.fetchedAt);
    if (Number.isFinite(at) && now - at < RETRY_MS) return false;
  }
  return true;
}

export async function tickAutoSync(): Promise<SyncTick> {
  const passPick = pickRoundRobin(PASS_IDS, passCursor, 2, forfaitDue);
  passCursor = passPick.next;
  const skiPick = pickRoundRobin(SKI_IDS, skiCursor, 1, skiinfoDue);
  skiCursor = skiPick.next;

  const forfaits: string[] = [];
  for (const slug of passPick.picked) {
    await refreshOne(slug, false);
    forfaits.push(slug);
  }
  const skiinfo: string[] = [];
  for (const id of skiPick.picked) {
    await refreshSkiinfo(id, false);
    skiinfo.push(id);
  }

  const stillPass = pickRoundRobin(PASS_IDS, passCursor, 1, forfaitDue).picked.length > 0;
  const stillSki = pickRoundRobin(SKI_IDS, skiCursor, 1, skiinfoDue).picked.length > 0;

  return {
    idle: forfaits.length === 0 && skiinfo.length === 0,
    forfaits,
    skiinfo,
    remaining: stillPass || stillSki,
  };
}
