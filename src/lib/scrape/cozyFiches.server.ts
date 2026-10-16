/**
 * Les fiches CozyCozy, une par une, en tâche de fond : description,
 * équipements, conditions, avis et galerie entière (`cozyFiche.ts`).
 *
 * 1. La liste de chaque recherche dit de quoi demander chaque fiche (`uid`,
 *    `searchId`, nombre de photos) : `noterRefsCozy`, appelé par le relevé
 *    (`run.server.ts`) sur les pages que `collecterCozy` rend. Gardé une heure.
 * 2. Les annonces Cozy de la réponse entrent en file (`demanderFichesCozy`),
 *    sauf celles dont la fiche est déjà gardée, lue ou tentée. Une annonce
 *    qu'on ouvre passe en tête et l'écran l'attend
 *    (`lireFichesCozyMaintenant`).
 * 3. Une fiche à la fois : `getDetails`, puis `getPhotos` quand la liste
 *    annonce plus de photos que l'annonce n'en porte (ou n'en dit pas le
 *    nombre), puis `getReviews` quand
 *    il y a des avis (Cozy n'en rend pas pour Abritel). Chaque requête passe
 *    par la file polie de l'hôte (`dansLaFile` : une à la fois, 2 s entre
 *    deux), et `PAUSE_FICHE_MS` sépare deux fiches. Au premier refus (403,
 *    429, 503), la pause de l'hôte s'ouvre (`poserRefus`) et la file se vide.
 *    Une recherche expirée chez Cozy (réponse vide) retire les fiches de
 *    cette recherche.
 * 4. Ce qui est lu se garde trente jours (`garderLectures` : la fiche dans la
 *    mémoire des fiches, la galerie dans le contenu gardé). L'écran le pose
 *    sans réseau, par sa relecture (`relecture.ts`, `ficheCozyAPoser`).
 */

import type { Listing } from "../listings.ts";
import { dejaGardee as dejaGardeeMemoire, garderLectures, type LectureAGarder } from "../stay/contenuFiches.server.ts";
import { cleListing } from "../stay/poserReleve.ts";
import { ficheCozy, hebergementCozy, refsCozy, type RefCozy } from "./cozyFiche.ts";
import { porteFermee, poserRefus } from "./gardeHote.ts";
import { dansLaFile, UA_RELEVE } from "./politesse.ts";

const ORIGINE = "https://www.cozycozy.com";
/** Un `searchId` vit plus de 40 minutes chez Cozy : on ne s'en sert pas au-delà d'une heure. */
export const REFS_DUREE_MS = 60 * 60_000;
const REFS_MAX = 20_000;
/** Entre deux fiches, en plus des 2 s de la file de l'hôte entre deux requêtes. */
export const PAUSE_FICHE_MS = 1_000;
/** Au plus tant de fiches en attente ; les plus anciennes demandes partent. */
export const FILE_MAX = 400;
/** Fiches de suite sans réponse (délai, réseau) : on n'insiste pas. */
export const ECHECS_DE_SUITE_MAX = 3;
/** Fiches de suite lues sans rien publier : la réponse a changé de forme. */
export const VIDES_DE_SUITE_MAX = 8;
/** Les avis demandés par fiche : ceux qu'une fiche garde (`EXTRAITS_MAX`). */
const AVIS_MAX = 5;
const DELAI_REQUETE_MS = 12_000;

/* ---------- Ce que la liste dit de chaque fiche ---------- */

const refs = new Map<string, RefCozy & { at: number }>();

/** Note, pour une heure, de quoi demander la fiche de chaque annonce de ces pages. */
export function noterRefsCozy(payloads: readonly unknown[], now: number = Date.now()): number {
  const lues = refsCozy(payloads);
  for (const r of lues) {
    refs.delete(r.accommodationId);
    refs.set(r.accommodationId, { ...r, at: now });
  }
  if (refs.size > REFS_MAX) {
    for (const k of refs.keys()) {
      if (refs.size <= REFS_MAX * 0.75) break;
      refs.delete(k);
    }
  }
  return lues.length;
}

/** De quoi demander la fiche de cette annonce, s'il en reste un d'il y a moins d'une heure. */
export function refCozy(l: Pick<Listing, "id">, now: number = Date.now()): RefCozy | null {
  const id = hebergementCozy(l);
  const r = id ? refs.get(id) : undefined;
  if (!r || now - r.at > REFS_DUREE_MS) return null;
  const { at: _at, ...ref } = r;
  return ref;
}

/** Pour les essais. */
export function oublierFichesCozy(): void {
  refs.clear();
  file.length = 0;
  enFile.clear();
  tentees.clear();
  for (const fins of attentes.values()) for (const f of fins) f();
  attentes.clear();
}

/* ---------- Le réseau ---------- */

/** Une réponse de l'API : `statut` `null` quand rien n'a répondu. */
export type ReponseApi = { statut: number | null; json: unknown };

/** Ce que la lecture demande au monde : l'API, la mémoire, l'horloge. */
export type PorteCozy = {
  api: (methode: "getDetails" | "getPhotos" | "getReviews", corps: Record<string, unknown>) => Promise<ReponseApi>;
  garder: (lectures: readonly LectureAGarder[]) => number;
  dejaGardee: (cle: string) => boolean;
  fermee: () => string | null;
  dormir: (ms: number) => Promise<void>;
};

async function apiCozy(methode: string, corps: Record<string, unknown>): Promise<ReponseApi> {
  const url = `${ORIGINE}/api/${methode}`;
  try {
    return await dansLaFile(
      url,
      async (signal) => {
        if (porteFermee(url)) return { statut: 429, json: null };
        const res = await fetch(url, {
          method: "POST",
          headers: { "user-agent": UA_RELEVE, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(corps),
          signal,
        });
        if (poserRefus(url, res.status, res.headers)) {
          await res.body?.cancel().catch(() => undefined);
          return { statut: res.status, json: null };
        }
        const json = res.ok ? await res.json().catch(() => null) : null;
        return { statut: res.status, json };
      },
      { timeoutMs: DELAI_REQUETE_MS },
    );
  } catch {
    return { statut: null, json: null };
  }
}

const PORTE: PorteCozy = {
  api: apiCozy,
  garder: (l) => garderLectures(l),
  dejaGardee: (cle) => dejaGardeeMemoire(cle),
  fermee: () => porteFermee(`${ORIGINE}/`),
  dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/* ---------- Une fiche ---------- */

/**
 * `gardee` : quelque chose est gardé ; `vide` : lue, rien de publié ;
 * `perdue` : Cozy ne connaît plus la recherche ; `echec` : rien n'a répondu ;
 * `refus` : 403, 429, 503, ou la pause d'un refus.
 */
export type IssueFicheCozy = "gardee" | "vide" | "perdue" | "echec" | "refus";

function estRefus(statut: number | null): boolean {
  return statut === 403 || statut === 429 || statut === 503;
}

function vide(json: unknown): boolean {
  return json == null || (typeof json === "object" && Object.keys(json as object).length === 0);
}

function galerieDe(l: Pick<Listing, "photo" | "photos">): number {
  return new Set([...(l.photo ? [l.photo] : []), ...(l.photos ?? [])]).size;
}

/** Lit la fiche d'une annonce et la garde. Voir l'en-tête du module. */
export async function lireFicheCozy(
  row: Listing,
  ref: RefCozy,
  porte: PorteCozy = PORTE,
): Promise<IssueFicheCozy> {
  const cle = cleListing(row);
  const corps = { uid: ref.uid, searchId: ref.searchId };
  const d = await porte.api("getDetails", corps);
  if (estRefus(d.statut)) return "refus";
  if (d.statut == null) return "echec";
  if (d.statut !== 200) return "vide";
  const details = d.json as Record<string, unknown> | null;
  if (vide(details) || (details && "missingSearchId" in details)) return "perdue";
  let photos: unknown = null;
  if (ref.photos == null || ref.photos > galerieDe(row)) {
    const p = await porte.api("getPhotos", corps);
    if (estRefus(p.statut)) return "refus";
    if (p.statut === 200) photos = p.json;
  }
  let avis: unknown = null;
  const nombre = details?.ratingCount;
  if (row.source !== "Abritel" && typeof nombre === "number" && nombre > 0) {
    const a = await porte.api("getReviews", {
      ...corps,
      maxCount: AVIS_MAX,
      maxCountPerProvider: AVIS_MAX,
      timeout: 3_000,
    });
    if (estRefus(a.statut)) return "refus";
    if (a.statut === 200) avis = a.json;
  }
  const lu = ficheCozy({ details, photos, avis }, { url: row.url, recupereLe: new Date().toISOString() });
  if (!cle || (!lu.fiche && lu.photos.length === 0)) return "vide";
  const gardees = porte.garder([
    { cle, fiche: lu.fiche, contenu: lu.photos.length ? { description: null, photos: lu.photos, amenities: null } : null },
  ]);
  return gardees > 0 ? "gardee" : "vide";
}

/* ---------- La file ---------- */

type Cible = { cle: string; row: Listing; ref: RefCozy };

const file: Cible[] = [];
const enFile = new Set<string>();
/** Les fiches tentées dans ce processus, lues ou non : aucune ne repart avant un redémarrage. */
const tentees = new Set<string>();
const TENTEES_MAX = 20_000;
/** Qui attend qu'une fiche soit tentée (`lireFichesCozyMaintenant`). */
const attentes = new Map<string, (() => void)[]>();
let enCours: Promise<void> | null = null;
let porteFile: PorteCozy = PORTE;

function ficheLue(l: Listing): boolean {
  return l.fiche != null && l.fiche.indisponible !== true;
}

function noterTentee(cle: string): void {
  tentees.add(cle);
  if (tentees.size > TENTEES_MAX) {
    for (const k of tentees) {
      if (tentees.size <= TENTEES_MAX * 0.75) break;
      tentees.delete(k);
    }
  }
  const fins = attentes.get(cle);
  attentes.delete(cle);
  for (const f of fins ?? []) f();
}

/** Ce qui reste à lire de ces annonces, sans requête : une annonce Cozy, sans fiche lue, ni gardée, ni tentée. */
function cibles(rows: readonly Listing[], porte: PorteCozy, now: number): Cible[] {
  const out: Cible[] = [];
  const vues = new Set<string>();
  for (const row of rows) {
    if (ficheLue(row)) continue;
    const ref = refCozy(row, now);
    const cle = ref ? cleListing(row) : null;
    if (!ref || !cle || vues.has(cle) || tentees.has(cle)) continue;
    vues.add(cle);
    let gardee = false;
    try {
      gardee = porte.dejaGardee(cle);
    } catch {
      gardee = false;
    }
    if (!gardee) out.push({ cle, row, ref });
  }
  return out;
}

/**
 * Met en file la fiche des annonces Cozy de ces annonces qui n'en ont pas.
 * `enTete` : avant toutes les autres (l'annonce qu'on ouvre). Rend le nombre
 * de fiches ajoutées ; la lecture part si elle ne tournait pas.
 */
export function demanderFichesCozy(
  rows: readonly Listing[],
  opts: { enTete?: boolean; porte?: PorteCozy; now?: number } = {},
): number {
  const porte = opts.porte ?? PORTE;
  const nouvelles = cibles(rows, porte, opts.now ?? Date.now());
  if (opts.enTete) {
    for (const c of nouvelles) {
      if (!enFile.has(c.cle)) continue;
      const i = file.findIndex((x) => x.cle === c.cle);
      if (i >= 0) file.splice(i, 1);
    }
    file.unshift(...nouvelles);
  } else {
    file.push(...nouvelles.filter((c) => !enFile.has(c.cle)));
  }
  for (const c of nouvelles) enFile.add(c.cle);
  while (file.length > FILE_MAX) {
    const partie = file.pop()!;
    enFile.delete(partie.cle);
  }
  if (nouvelles.length) lancer(porte);
  return nouvelles.length;
}

function lancer(porte: PorteCozy): void {
  porteFile = porte;
  if (enCours) return;
  enCours = derouler().finally(() => {
    enCours = null;
    if (file.length && !porteFile.fermee()) lancer(porteFile);
  });
}

function vider(raison: string): void {
  if (file.length) console.info(`[cozy] fiches : ${file.length} en attente abandonnée(s) — ${raison}`);
  for (const c of file.splice(0)) {
    enFile.delete(c.cle);
    const fins = attentes.get(c.cle);
    attentes.delete(c.cle);
    for (const f of fins ?? []) f();
  }
}

async function derouler(): Promise<void> {
  let lues = 0;
  let gardees = 0;
  let echecs = 0;
  let vides = 0;
  let premiere = true;
  while (file.length) {
    const porte = porteFile;
    const ferme = porte.fermee();
    if (ferme) return vider(ferme);
    if (!premiere) await porte.dormir(PAUSE_FICHE_MS);
    premiere = false;
    const c = file.shift();
    if (!c) break;
    enFile.delete(c.cle);
    const issue = await lireFicheCozy(c.row, c.ref, porte).catch((): IssueFicheCozy => "echec");
    noterTentee(c.cle);
    lues += 1;
    if (lues % 25 === 0) console.info(`[cozy] fiches : ${lues} lue(s), ${gardees} gardée(s), ${file.length} en attente`);
    if (issue === "refus") return vider("refus de CozyCozy");
    if (issue === "perdue") {
      // La recherche n'existe plus chez Cozy : ses autres fiches non plus.
      for (let i = file.length - 1; i >= 0; i -= 1) {
        if (file[i].ref.searchId !== c.ref.searchId) continue;
        const [partie] = file.splice(i, 1);
        enFile.delete(partie.cle);
        noterTentee(partie.cle);
      }
      continue;
    }
    if (issue === "echec") {
      echecs += 1;
      if (echecs >= ECHECS_DE_SUITE_MAX) return vider("fiches sans réponse");
      continue;
    }
    echecs = 0;
    if (issue === "gardee") {
      gardees += 1;
      vides = 0;
      continue;
    }
    vides += 1;
    if (vides >= VIDES_DE_SUITE_MAX) return vider("fiches sans contenu lisible");
  }
  if (lues) console.info(`[cozy] fiches : ${lues} lue(s), ${gardees} gardée(s)`);
}

/**
 * La fiche des annonces qu'on vient d'ouvrir, en tête de file, et l'attente
 * de leur lecture, `attenteMs` au plus. Rend quand chacune a été tentée, ou
 * à l'échéance ; ce qui est lu est gardé, l'appelant le pose sans réseau
 * (`reposerGardees`).
 */
export async function lireFichesCozyMaintenant(
  rows: readonly Listing[],
  attenteMs: number,
  opts: { porte?: PorteCozy; now?: number } = {},
): Promise<void> {
  const porte = opts.porte ?? PORTE;
  const a = cibles(rows, porte, opts.now ?? Date.now());
  if (!a.length) return;
  const fins = a.map(
    (c) =>
      new Promise<void>((resolve) => {
        attentes.set(c.cle, [...(attentes.get(c.cle) ?? []), resolve]);
      }),
  );
  demanderFichesCozy(
    a.map((c) => c.row),
    { enTete: true, porte, now: opts.now },
  );
  let minuterie: ReturnType<typeof setTimeout> | null = null;
  await Promise.race([
    Promise.all(fins),
    new Promise<void>((r) => {
      minuterie = setTimeout(r, Math.max(0, attenteMs));
    }),
  ]);
  if (minuterie) clearTimeout(minuterie);
}

/** Pour les essais : la lecture en cours, s'il y en a une. */
export function lectureCozyEnCours(): Promise<void> {
  return enCours ?? Promise.resolve();
}
