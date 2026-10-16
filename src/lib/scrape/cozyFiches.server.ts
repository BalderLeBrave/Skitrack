/**
 * Les fiches CozyCozy, une par une, en tâche de fond : description,
 * équipements, conditions, avis, salles de bain et galerie entière
 * (`cozyFiche.ts`).
 *
 * 1. La liste de chaque recherche dit de quoi demander chaque fiche (`uid`,
 *    `searchId`, nombre de photos) : `noterRefsCozy`, appelé par le relevé
 *    (`run.server.ts`) sur les pages que `collecterCozy` rend. Gardé une heure.
 *    La référence se relit au moment de lire : une recherche plus récente
 *    donne son `searchId`.
 * 2. Les annonces Cozy d'une réponse entrent en file (`demanderFichesCozy`),
 *    sauf celles qui ont déjà une fiche, gardée ou lue, qui sont tentées ou
 *    en cours de lecture. La dernière recherche passe devant les précédentes :
 *    c'est la station qu'on regarde ; au-delà de `FILE_MAX`, les demandes les
 *    plus anciennes partent. Une annonce qu'on ouvre passe devant tout, et
 *    l'écran l'attend (`lireFichesCozyMaintenant`) ; une ouverture plus
 *    récente libère l'attente de la précédente.
 * 3. Une fiche à la fois : `getDetails`, puis `getPhotos` quand la liste
 *    annonce plus de photos que l'annonce n'en porte (ou n'en dit pas le
 *    nombre), puis `getReviews` quand il y a des avis (Cozy n'en rend pas pour
 *    Abritel). Chaque requête passe par la file polie de l'hôte (`dansLaFile` :
 *    une à la fois, 2 s entre deux), et `PAUSE_FICHE_MS` sépare deux fiches.
 *    Au premier refus (403, 429, 503), la pause de l'hôte s'ouvre
 *    (`poserRefus`), ce qui est déjà lu est gardé, et la file se vide. Une
 *    recherche expirée chez Cozy (réponse vide) oublie ses références.
 *    Seule une fiche lue (gardée ou vide) est « tentée » : un refus, un délai
 *    ou une recherche expirée laissent la fiche à lire plus tard.
 * 4. Ce qui est lu se garde trente jours (`garderLectures` : la fiche dans la
 *    mémoire des fiches, la galerie et les salles de bain dans le contenu
 *    gardé, marqué `cozy`). Juste avant de lire, une fiche gardée entre-temps
 *    (page Booking, PDP Airbnb) fait passer son tour. L'écran pose ce qui est
 *    gardé sans réseau, par sa relecture (`relecture.ts`, `ficheCozyAPoser`).
 *
 * L'état tient sur `globalThis` : un rechargement à chaud du module, en
 * développement, ne vide ni le registre ni la file, et ne lance pas une
 * seconde boucle.
 */

import type { Listing } from "../listings.ts";
import { ficheGardee, garderLectures, type LectureAGarder } from "../stay/contenuFiches.server.ts";
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
/** Au plus tant de fiches de fond en attente ; les demandes les plus anciennes partent. */
export const FILE_MAX = 400;
/** Fiches de suite sans réponse (délai, réseau) : on n'insiste pas. */
export const ECHECS_DE_SUITE_MAX = 3;
/** Fiches de suite lues sans rien publier : la réponse a changé de forme. */
export const VIDES_DE_SUITE_MAX = 8;
/** Les avis demandés par fiche : ceux qu'une fiche garde (`EXTRAITS_MAX`). */
const AVIS_MAX = 5;
const DELAI_REQUETE_MS = 12_000;
const TENTEES_MAX = 20_000;

type Cible = { cle: string; row: Listing };

type Etat = {
  refs: Map<string, RefCozy & { at: number }>;
  /** L'annonce ouverte, avant tout le reste. */
  tete: Cible[];
  /** Les fiches de fond, la dernière recherche d'abord. */
  fond: Cible[];
  /** Les fiches lues dans ce processus, gardées ou vides : elles ne repartent pas. */
  tentees: Set<string>;
  /** La fiche que la boucle lit en ce moment. */
  enLecture: string | null;
  /** Qui attend la fin d'une fiche (`lireFichesCozyMaintenant`). */
  attentes: Map<string, (() => void)[]>;
  /** Chaque ouverture libère l'attente de la précédente. */
  ouverture: { n: number; liberer: (() => void) | null };
  boucle: Promise<void> | null;
  porte: PorteCozy | null;
};

const g = globalThis as typeof globalThis & { __skitrackFichesCozy__?: Etat };
const etat: Etat = (g.__skitrackFichesCozy__ ??= {
  refs: new Map(),
  tete: [],
  fond: [],
  tentees: new Set(),
  enLecture: null,
  attentes: new Map(),
  ouverture: { n: 0, liberer: null },
  boucle: null,
  porte: null,
});

/* ---------- Ce que la liste dit de chaque fiche ---------- */

/** Note, pour une heure, de quoi demander la fiche de chaque annonce de ces pages. */
export function noterRefsCozy(payloads: readonly unknown[], now: number = Date.now()): number {
  const lues = refsCozy(payloads);
  for (const r of lues) {
    etat.refs.delete(r.accommodationId);
    etat.refs.set(r.accommodationId, { ...r, at: now });
  }
  if (etat.refs.size > REFS_MAX) {
    for (const k of etat.refs.keys()) {
      if (etat.refs.size <= REFS_MAX * 0.75) break;
      etat.refs.delete(k);
    }
  }
  return lues.length;
}

/** De quoi demander la fiche de cette annonce, s'il en reste un d'il y a moins d'une heure. */
export function refCozy(l: Pick<Listing, "id" | "proven">, now: number = Date.now()): RefCozy | null {
  const id = hebergementCozy(l);
  const r = id ? etat.refs.get(id) : undefined;
  if (!r || now - r.at > REFS_DUREE_MS) return null;
  const { at: _at, ...ref } = r;
  return ref;
}

/** Une recherche que Cozy ne connaît plus : ses références ne servent plus. */
function oublierRecherche(searchId: string): void {
  for (const [k, r] of etat.refs) if (r.searchId === searchId) etat.refs.delete(k);
}

/** Pour les essais. */
export function oublierFichesCozy(): void {
  etat.refs.clear();
  etat.tete.length = 0;
  etat.fond.length = 0;
  etat.tentees.clear();
  etat.enLecture = null;
  for (const fins of etat.attentes.values()) for (const f of fins) f();
  etat.attentes.clear();
  etat.ouverture.liberer?.();
  etat.ouverture = { n: 0, liberer: null };
  etat.boucle = null;
  etat.porte = null;
}

/* ---------- Le réseau ---------- */

/** Une réponse de l'API : `statut` `null` quand rien n'a répondu. */
export type ReponseApi = { statut: number | null; json: unknown };

/** Ce que la lecture demande au monde : l'API, la mémoire, l'horloge. */
export type PorteCozy = {
  api: (methode: "getDetails" | "getPhotos" | "getReviews", corps: Record<string, unknown>) => Promise<ReponseApi>;
  garder: (lectures: readonly LectureAGarder[]) => number;
  /** Une fiche enrichie est déjà gardée pour cette clé (Cozy, Booking, PDP…). */
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
  dejaGardee: (cle) => ficheGardee(cle),
  fermee: () => porteFermee(`${ORIGINE}/`),
  dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/* ---------- Une fiche ---------- */

/**
 * `gardee` : quelque chose est gardé ; `vide` : lue, rien de publié ;
 * `perdue` : Cozy ne connaît plus la recherche ; `echec` : rien n'a répondu ;
 * `refus` : 403, 429, 503, ou la pause d'un refus (ce qui était lu avant est
 * gardé).
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
  let refus = false;
  let photos: unknown = null;
  if (ref.photos == null || ref.photos > galerieDe(row)) {
    const p = await porte.api("getPhotos", corps);
    if (estRefus(p.statut)) refus = true;
    else if (p.statut === 200) photos = p.json;
  }
  let avis: unknown = null;
  const nombre = details?.ratingCount;
  if (!refus && row.source !== "Abritel" && typeof nombre === "number" && nombre > 0) {
    const a = await porte.api("getReviews", {
      ...corps,
      maxCount: AVIS_MAX,
      maxCountPerProvider: AVIS_MAX,
      timeout: 3_000,
    });
    if (estRefus(a.statut)) refus = true;
    else if (a.statut === 200) avis = a.json;
  }
  // Ce qui est lu avant un refus se garde : les détails ne se redemandent pas pour rien.
  const lu = ficheCozy({ details, photos, avis }, { url: row.url, recupereLe: new Date().toISOString() });
  let gardees = 0;
  if (cle && (lu.fiche || lu.photos.length || lu.baths != null)) {
    const contenu =
      lu.photos.length || lu.baths != null
        ? { description: null, photos: lu.photos.length ? lu.photos : null, amenities: null, baths: lu.baths, origine: "cozy" as const }
        : null;
    gardees = porte.garder([{ cle, fiche: lu.fiche, contenu }]);
  }
  if (refus) return "refus";
  return gardees > 0 ? "gardee" : "vide";
}

/* ---------- La file ---------- */

function ficheLue(l: Listing): boolean {
  return l.fiche != null && l.fiche.indisponible !== true;
}

function finir(cle: string): void {
  const fins = etat.attentes.get(cle);
  etat.attentes.delete(cle);
  for (const f of fins ?? []) f();
}

function noterTentee(cle: string): void {
  etat.tentees.add(cle);
  if (etat.tentees.size > TENTEES_MAX) {
    for (const k of etat.tentees) {
      if (etat.tentees.size <= TENTEES_MAX * 0.75) break;
      etat.tentees.delete(k);
    }
  }
}

function retirer(liste: Cible[], cles: Set<string>): void {
  for (let i = liste.length - 1; i >= 0; i -= 1) if (cles.has(liste[i].cle)) liste.splice(i, 1);
}

/**
 * Ce qui reste à lire de ces annonces, sans requête : une annonce Cozy avec
 * une référence, sans fiche lue, ni gardée, ni tentée, ni en cours de lecture.
 */
function cibles(rows: readonly Listing[], porte: PorteCozy, now: number): Cible[] {
  const out: Cible[] = [];
  const vues = new Set<string>();
  for (const row of rows) {
    if (ficheLue(row) || !refCozy(row, now)) continue;
    const cle = cleListing(row);
    if (!cle || vues.has(cle) || etat.tentees.has(cle) || etat.enLecture === cle) continue;
    vues.add(cle);
    let gardee = false;
    try {
      gardee = porte.dejaGardee(cle);
    } catch {
      gardee = false;
    }
    if (!gardee) out.push({ cle, row });
  }
  return out;
}

/**
 * Met en file la fiche des annonces Cozy de ces annonces qui n'en ont pas.
 * `enTete` : avant toutes les autres (l'annonce qu'on ouvre). Sinon, devant
 * les demandes des recherches précédentes. Rend le nombre de fiches
 * demandées ; la lecture part si elle ne tournait pas.
 */
export function demanderFichesCozy(
  rows: readonly Listing[],
  opts: { enTete?: boolean; porte?: PorteCozy; now?: number } = {},
): number {
  const porte = opts.porte ?? PORTE;
  const nouvelles = cibles(rows, porte, opts.now ?? Date.now());
  if (!nouvelles.length) return 0;
  const cles = new Set(nouvelles.map((c) => c.cle));
  retirer(etat.fond, cles);
  if (opts.enTete) {
    retirer(etat.tete, cles);
    etat.tete.unshift(...nouvelles);
  } else {
    const enTete = new Set(etat.tete.map((c) => c.cle));
    etat.fond.unshift(...nouvelles.filter((c) => !enTete.has(c.cle)));
    while (etat.fond.length > FILE_MAX) etat.fond.pop();
  }
  lancer(porte);
  return nouvelles.length;
}

function lancer(porte: PorteCozy): void {
  etat.porte = porte;
  if (etat.boucle) return;
  const boucle = derouler().finally(() => {
    if (etat.boucle === boucle) etat.boucle = null;
    if ((etat.tete.length || etat.fond.length) && etat.porte && !etat.porte.fermee()) lancer(etat.porte);
  });
  etat.boucle = boucle;
}

function vider(raison: string): void {
  const n = etat.tete.length + etat.fond.length;
  if (n) console.info(`[cozy] fiches : ${n} en attente abandonnée(s) — ${raison}`);
  for (const c of [...etat.tete.splice(0), ...etat.fond.splice(0)]) finir(c.cle);
}

function suivante(): Cible | undefined {
  return etat.tete.shift() ?? etat.fond.shift();
}

async function derouler(): Promise<void> {
  let lues = 0;
  let gardees = 0;
  let echecs = 0;
  let vides = 0;
  let parties = 0;
  for (;;) {
    const porte = etat.porte ?? PORTE;
    if (!etat.tete.length && !etat.fond.length) break;
    const ferme = porte.fermee();
    if (ferme) return vider(ferme);
    if (parties > 0) await porte.dormir(PAUSE_FICHE_MS);
    const c = suivante();
    if (!c) break;
    const ref = refCozy(c.row);
    let gardeeAilleurs = false;
    try {
      gardeeAilleurs = porte.dejaGardee(c.cle);
    } catch {
      gardeeAilleurs = false;
    }
    // Plus de référence (recherche oubliée), ou une fiche gardée entre-temps : rien à lire.
    if (!ref || gardeeAilleurs) {
      finir(c.cle);
      continue;
    }
    etat.enLecture = c.cle;
    parties += 1;
    const issue = await lireFicheCozy(c.row, ref, porte).catch((): IssueFicheCozy => "echec");
    etat.enLecture = null;
    if (issue === "gardee" || issue === "vide") noterTentee(c.cle);
    finir(c.cle);
    lues += 1;
    if (lues % 25 === 0) {
      console.info(`[cozy] fiches : ${lues} lue(s), ${gardees} gardée(s), ${etat.tete.length + etat.fond.length} en attente`);
    }
    if (issue === "refus") return vider("refus de CozyCozy");
    if (issue === "perdue") {
      oublierRecherche(ref.searchId);
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
 * de leur lecture, `attenteMs` au plus. Rend quand chacune a été lue ou a
 * passé son tour, à l'échéance, ou dès qu'une autre annonce s'ouvre : feuilleter
 * ne laisse pas une attente par annonce. Ce qui est lu est gardé, l'appelant
 * le pose sans réseau (`reposerGardees`).
 */
export async function lireFichesCozyMaintenant(
  rows: readonly Listing[],
  attenteMs: number,
  opts: { porte?: PorteCozy; now?: number } = {},
): Promise<void> {
  const porte = opts.porte ?? PORTE;
  const now = opts.now ?? Date.now();
  // Une fiche déjà en cours de lecture s'attend sans repartir en file.
  const enCours = rows.map((r) => cleListing(r)).filter((k): k is string => k != null && k === etat.enLecture);
  const a = cibles(rows, porte, now);
  const cles = [...new Set([...enCours, ...a.map((c) => c.cle)])];
  if (!cles.length) return;
  etat.ouverture.liberer?.();
  const n = ++etat.ouverture.n;
  const fins = cles.map(
    (cle) =>
      new Promise<void>((resolve) => {
        etat.attentes.set(cle, [...(etat.attentes.get(cle) ?? []), resolve]);
      }),
  );
  demanderFichesCozy(
    a.map((c) => c.row),
    { enTete: true, porte, now },
  );
  let minuterie: ReturnType<typeof setTimeout> | null = null;
  await Promise.race([
    Promise.all(fins),
    new Promise<void>((r) => {
      minuterie = setTimeout(r, Math.max(0, attenteMs));
    }),
    new Promise<void>((r) => {
      etat.ouverture.liberer = r;
    }),
  ]);
  if (minuterie) clearTimeout(minuterie);
  if (etat.ouverture.n === n) etat.ouverture.liberer = null;
}

/** Pour les essais : la lecture en cours, s'il y en a une. */
export function lectureCozyEnCours(): Promise<void> {
  return etat.boucle ?? Promise.resolve();
}
