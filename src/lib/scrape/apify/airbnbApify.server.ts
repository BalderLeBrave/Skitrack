/**
 * Airbnb par Apify, le réseau (voir `airbnbApify.ts`).
 *
 * Les annonces Airbnb que nos lectures laissent incomplètes partent par lots
 * chez l'acteur `tri_angle/airbnb-rooms-urls-scraper`, en tâche de fond : la
 * recherche ne l'attend pas, la relecture de l'écran pose ce qu'il a rendu.
 *
 * - **5 $ au plus par recherche** (station, dates, voyageurs) : le compte est
 *   réservé avant chaque lancement, puis remplacé par la dépense qu'Apify
 *   déclare ; et chaque lancement porte son propre plafond
 *   (`maxTotalChargeUsd`), qu'Apify fait respecter de son côté.
 * - Une annonce n'est demandée qu'une fois par séjour : ce qu'Apify rend, ou
 *   son silence, est gardé sept jours sur disque, à côté de la mémoire des
 *   fiches. Un redémarrage ne repaie rien.
 * - Un lancement à la fois ; les demandes arrivées entre-temps attendent le
 *   suivant, regroupées.
 * - Sans jeton (`apify` dans le registre des clés), rien ne part.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { valeurCle } from "../../cles/store.server.ts";
import {
  ACTEUR_APIFY,
  PLAFOND_RECHERCHE_USD,
  PRIX_ANNONCE_USD,
  PRIX_LANCEMENT_USD,
  annoncesDansLeBudget,
  entreeApify,
  lireSortieApify,
  type FicheApify,
  type SejourApify,
} from "./airbnbApify.ts";

const API = "https://api.apify.com/v2";
/** Les demandes d'une recherche se regroupent pendant ce temps avant de partir. */
const REGROUPEMENT_MS = 20_000;
const SONDAGE_MS = 10_000;
/** Un lancement ne dure pas plus ; Apify l'arrête de son côté (`timeout`). */
const LANCEMENT_MAX_S = 15 * 60;
const DUREE_MS = 7 * 24 * 60 * 60 * 1000;
const FICHES_MAX = 50_000;

type Gardee = { a: number; fiche: FicheApify | null };
type Etat = {
  fiches: Map<string, Gardee>;
  /** La dépense de chaque recherche, en dollars. */
  depenses: Map<string, number>;
  /** Le séjour que l'écran Logements a demandé en dernier pour chaque station. */
  sejours: Map<string, SejourApify>;
  /** Par recherche, les annonces à demander. */
  file: Map<string, { sejour: SejourApify; ids: Set<string> }>;
  enCours: boolean;
  minuterie: ReturnType<typeof setTimeout> | null;
  charge: boolean;
  /** Un refus d'Apify qui vaut pour tout le processus (jeton refusé, crédit épuisé). */
  arret: string | null;
};

const g = globalThis as typeof globalThis & { __skitrackApifyAirbnb__?: Etat };
function etat(): Etat {
  return (g.__skitrackApifyAirbnb__ ??= {
    fiches: new Map(),
    depenses: new Map(),
    sejours: new Map(),
    file: new Map(),
    enCours: false,
    minuterie: null,
    charge: false,
    arret: null,
  });
}

function chemin(): string {
  const p = platform();
  const base =
    process.env.SKITRACK_CONFIG_DIR?.trim() ||
    (p === "win32"
      ? join(process.env.APPDATA?.trim() || join(homedir(), "AppData", "Roaming"), "skitrack")
      : p === "darwin"
        ? join(homedir(), "Library", "Application Support", "skitrack")
        : join(process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"), "skitrack"));
  return join(base, "apify-airbnb.json");
}

function charger(): void {
  const e = etat();
  if (e.charge) return;
  e.charge = true;
  try {
    const brut = JSON.parse(readFileSync(chemin(), "utf8")) as { fiches?: Record<string, Gardee>; depenses?: Record<string, number> };
    const now = Date.now();
    for (const [k, v] of Object.entries(brut.fiches ?? {})) if (now - v.a <= DUREE_MS) e.fiches.set(k, v);
    for (const [k, v] of Object.entries(brut.depenses ?? {})) if (typeof v === "number" && v >= 0) e.depenses.set(k, v);
  } catch {
    /* pas encore de fichier */
  }
}

function ecrire(): void {
  const e = etat();
  if (e.fiches.size > FICHES_MAX) {
    for (const k of e.fiches.keys()) {
      if (e.fiches.size <= FICHES_MAX * 0.75) break;
      e.fiches.delete(k);
    }
  }
  try {
    const f = chemin();
    mkdirSync(dirname(f), { recursive: true });
    const temp = `${f}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify({ fiches: Object.fromEntries(e.fiches), depenses: Object.fromEntries(e.depenses) }), "utf8");
    renameSync(temp, f);
  } catch (err) {
    console.warn("[apify] mémoire non écrite :", (err as Error).message);
  }
}

export function cleRecherche(stationId: string, s: SejourApify): string {
  return `${stationId}|${s.checkIn}|${s.checkOut}|${Math.max(1, Math.trunc(s.guests))}`;
}

function cleFiche(id: string, s: SejourApify): string {
  return `${id}|${s.checkIn}|${s.checkOut}|${Math.max(1, Math.trunc(s.guests))}`;
}

/** Le jeton est posé : Apify peut servir. */
export function apifyDisponible(): boolean {
  return Boolean(valeurCle("apify")) && etat().arret == null;
}

/** L'écran Logements cherche ce séjour dans cette station : les relectures s'y rapportent. */
export function noterSejourApify(stationId: string, sejour: SejourApify): void {
  etat().sejours.set(stationId, sejour);
}

export function sejourApify(stationId: string): SejourApify | null {
  return etat().sejours.get(stationId) ?? null;
}

/**
 * Ce qu'Apify a rendu pour l'annonce et ce séjour : la fiche, `null` s'il n'a
 * rien rendu, `undefined` si elle n'a jamais été demandée.
 */
export function ficheApify(id: string, sejour: SejourApify): FicheApify | null | undefined {
  charger();
  const e = etat().fiches.get(cleFiche(id, sejour));
  if (!e) return undefined;
  if (Date.now() - e.a > DUREE_MS) {
    etat().fiches.delete(cleFiche(id, sejour));
    return undefined;
  }
  return e.fiche;
}

/** Met en file des annonces incomplètes ; rend le nombre de nouvelles demandes. */
export function demanderApify(stationId: string, sejour: SejourApify, ids: readonly string[]): number {
  if (!apifyDisponible()) return 0;
  charger();
  const e = etat();
  const k = cleRecherche(stationId, sejour);
  if (annoncesDansLeBudget(e.depenses.get(k) ?? 0) === 0) return 0;
  const lot = e.file.get(k) ?? { sejour, ids: new Set<string>() };
  let n = 0;
  for (const id of ids) {
    if (ficheApify(id, sejour) !== undefined || lot.ids.has(id)) continue;
    lot.ids.add(id);
    n += 1;
  }
  if (lot.ids.size > 0) e.file.set(k, lot);
  if (n > 0 && !e.enCours && !e.minuterie) {
    e.minuterie = setTimeout(() => {
      e.minuterie = null;
      void derouler();
    }, REGROUPEMENT_MS);
  }
  return n;
}

/** Pour le journal et le banc : la file, si un lancement tourne, la dépense par recherche. */
export function etatApify(): { file: number; enCours: boolean; depenses: Record<string, number>; arret: string | null } {
  const e = etat();
  return {
    file: [...e.file.values()].reduce((s, l) => s + l.ids.size, 0),
    enCours: e.enCours || e.minuterie != null,
    depenses: Object.fromEntries(e.depenses),
    arret: e.arret,
  };
}

async function api(chemin: string, init: RequestInit = {}): Promise<Response> {
  const jeton = valeurCle("apify");
  if (!jeton) throw new Error("jeton Apify absent");
  return fetch(`${API}${chemin}`, {
    ...init,
    // Le jeton dans l'en-tête, jamais dans l'adresse.
    headers: { authorization: `Bearer ${jeton}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(60_000),
  });
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function derouler(): Promise<void> {
  const e = etat();
  if (e.enCours) return;
  e.enCours = true;
  try {
    while (e.file.size > 0 && e.arret == null) {
      const [k, lot] = e.file.entries().next().value as [string, { sejour: SejourApify; ids: Set<string> }];
      e.file.delete(k);
      const depense = e.depenses.get(k) ?? 0;
      const n = annoncesDansLeBudget(depense);
      const ids = [...lot.ids].filter((id) => ficheApify(id, lot.sejour) === undefined);
      if (n === 0 || ids.length === 0) {
        if (ids.length > 0) console.info(`[apify] ${k} : plafond de ${PLAFOND_RECHERCHE_USD} $ atteint, ${ids.length} annonce(s) laissée(s)`);
        continue;
      }
      const pris = ids.slice(0, n);
      if (pris.length < ids.length) {
        console.info(`[apify] ${k} : ${ids.length - pris.length} annonce(s) au-delà du plafond de ${PLAFOND_RECHERCHE_USD} $`);
      }
      const plafond = Math.min(PLAFOND_RECHERCHE_USD - depense, pris.length * PRIX_ANNONCE_USD + PRIX_LANCEMENT_USD);
      e.depenses.set(k, depense + plafond);
      ecrire();
      const reel = await lancer(pris, lot.sejour, plafond);
      // La dépense déclarée remplace la réserve ; sans elle, la réserve reste.
      if (reel != null) e.depenses.set(k, depense + Math.min(reel, plafond));
      ecrire();
    }
  } catch (err) {
    console.warn("[apify] arrêt :", (err as Error).message);
  } finally {
    e.enCours = false;
    if (e.file.size > 0 && e.arret == null && !e.minuterie) {
      e.minuterie = setTimeout(() => {
        e.minuterie = null;
        void derouler();
      }, REGROUPEMENT_MS);
    }
  }
}

/** Un lancement : rend la dépense déclarée par Apify, ou `null`. */
async function lancer(ids: string[], sejour: SejourApify, plafondUsd: number): Promise<number | null> {
  const e = etat();
  const q = new URLSearchParams({ maxTotalChargeUsd: plafondUsd.toFixed(4), timeout: String(LANCEMENT_MAX_S) });
  const depart = await api(`/acts/${ACTEUR_APIFY}/runs?${q}`, { method: "POST", body: JSON.stringify(entreeApify(ids, sejour)) });
  if (depart.status === 401 || depart.status === 403) {
    e.arret = `jeton Apify refusé (HTTP ${depart.status})`;
    console.warn(`[apify] ${e.arret}`);
    return 0;
  }
  if (depart.status === 402) {
    e.arret = "crédit Apify épuisé (HTTP 402)";
    console.warn(`[apify] ${e.arret}`);
    return 0;
  }
  if (!depart.ok) {
    console.warn(`[apify] lancement refusé : HTTP ${depart.status}`);
    return 0;
  }
  const run = ((await depart.json()) as { data?: { id?: string; defaultDatasetId?: string } }).data;
  if (!run?.id || !run.defaultDatasetId) return null;
  console.info(`[apify] ${ids.length} annonce(s) Airbnb demandées (plafond ${plafondUsd.toFixed(2)} $)`);
  let statut = "RUNNING";
  let usage: number | null = null;
  const fin = Date.now() + (LANCEMENT_MAX_S + 60) * 1000;
  while (Date.now() < fin) {
    await dormir(SONDAGE_MS);
    const r = await api(`/actor-runs/${run.id}`).catch(() => null);
    if (!r?.ok) continue;
    const d = ((await r.json()) as { data?: { status?: string; usageTotalUsd?: number } }).data;
    statut = d?.status ?? statut;
    if (typeof d?.usageTotalUsd === "number") usage = d.usageTotalUsd;
    if (!["READY", "RUNNING"].includes(statut)) break;
  }
  const items = await api(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json`)
    .then((r) => (r.ok ? (r.json() as Promise<unknown[]>) : []))
    .catch(() => [] as unknown[]);
  const lues = new Map<string, FicheApify>();
  for (const brut of Array.isArray(items) ? items : []) {
    const f = lireSortieApify(brut);
    if (f) lues.set(f.id, f);
  }
  const now = Date.now();
  // Un lancement fini sans rendre une annonce : son silence se garde aussi.
  // Un lancement coupé (plafond, délai) ne garde que ce qu'il a rendu.
  const fini = statut === "SUCCEEDED";
  for (const id of ids) {
    const f = lues.get(id);
    if (f || fini) etat().fiches.set(cleFiche(id, sejour), { a: now, fiche: f ?? null });
  }
  console.info(`[apify] ${statut} : ${lues.size}/${ids.length} annonce(s) rendue(s), ${usage != null ? `${usage.toFixed(3)} $` : "dépense inconnue"}`);
  return usage;
}
