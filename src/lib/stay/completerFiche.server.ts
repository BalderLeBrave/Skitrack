/**
 * Seconde passe hors collecteur : télécharge la fiche déjà liée et y lit
 * capacité, chambres, GPS. Les collecteurs restent inchangés.
 *
 * Airbnb 429 : les fiches `rooms/` partent une à une. Un 429 d'Airbnb ouvre
 * le coupe-circuit partagé avec le sidecar Python (`skitrack-airbnb-429`, dans
 * le dossier temporaire)
 * — Relancer pendant la pause ne martèle pas. Une attente de notre propre
 * limiteur ne l'ouvre pas.
 */

import { montantCents } from "../devises.ts";
import type { Listing } from "../listings.ts";
import { RELEVE_2A } from "../listings.ts";
import { gitesCodeOf, gitesWidgetUrl } from "../scrape/gitesGps.server.ts";
import { airbnbCircuitOpen, airbnbCircuitRestantMs, tripAirbnbCircuit } from "./airbnbCircuit.server.ts";
import { airbnbCookieHeader } from "./airbnbSession.server.ts";
import { noterBlocage, paceTaux } from "./taux.server.ts";
import { airbnbIdOf } from "./enrichir.ts";
import { PAUSE_MAX_MS, estHoteAirbnb, estRefus, estStatutRalenti, htmlEstBloque, retryAfterMs } from "./http429.ts";
import { lectureFiche, type LectureFiche } from "./lectureFiche.ts";
import { PAR_HOTE, parHote, RythmeHotes, semaphore } from "./limiteHotes.ts";
import { horsFraisSejour } from "./tarif.ts";
import { poserReleve } from "./poserReleve.ts";
import {
  choisirFiches,
  clePage,
  disjoncteur,
  ecrireLaissees,
  hoteDe,
  plausible,
  raisonDeLaisser,
  urlPropre,
  urlsPartagees,
} from "./priseFiche.ts";
import { titreEstFichier, titreDepuisUrl } from "./titre.ts";
import {
  estPageGitesIntrouvable,
  marquerFicheIntrouvable,
  slugGites,
  slugUrlGites,
  urlGitesDepuisNom,
} from "./ficheGites.ts";
import type {
  LectureCourte,
  OptionsPages,
  PagesAirbnbProfond,
  PagesProfond,
} from "../prix/completion.server.ts";

const MAX_FICHES = 160;
const WORKERS = 10;
/** Fiches de suite sans rien combler, après quoi l'hôte est laissé pour la passe. */
const SANS_PRISE_MAX = 5;
const BUDGET_MS = 36_000;
const HIT_MS = 24 * 60 * 60 * 1000;
const MISS_MS = 30 * 60 * 1000;
const BLOCK_MS = 5 * 60 * 1000;
const CACHE_GEN = "f5";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type CacheEntry = { at: number; lect: LectureFiche; hit: boolean; blocked?: boolean };
const cache = new Map<string, CacheEntry>();

function trouee(l: Listing): boolean {
  if (l.guests == null) return true;
  if (l.bedrooms == null && (l.rooms == null || l.rooms <= 0)) return true;
  if (titreEstFichier(l.title)) return true;
  if (l.source === "Gîtes de France") return false;
  if (!plausible(l.lat, l.lon)) return true;
  return false;
}

function trousN(l: Listing): number {
  let n = 0;
  if (l.guests == null) n += 1;
  if (l.bedrooms == null && (l.rooms == null || l.rooms <= 0)) n += 1;
  if (!plausible(l.lat, l.lon)) n += 1;
  return n;
}

export function ficheUrlOf(l: Listing): string | null {
  if (l.source === "Airbnb") {
    const id = airbnbIdOf(l);
    if (id) return `https://www.airbnb.fr/rooms/${id}`;
  }
  if (l.source === "Gîtes de France") {
    const code = gitesCodeOf(l.id) || gitesCodeOf(l.url);
    if (code) return gitesWidgetUrl(code);
  }
  if (!l.url) return null;
  try {
    const u = new URL(l.url);
    if (/(^|\.)booking\.com$/i.test(u.hostname)) {
      const m = u.pathname.match(/\/hotel\/[a-z]{2}\/[^/]+/i);
      if (!m) return u.toString();
      u.hostname = "www.booking.com";
      u.pathname = m[0].replace(/\/$/, "");
      if (!/\.html$/i.test(u.pathname)) u.pathname += ".html";
      u.search = "";
      u.hash = "";
      return u.toString();
    }
    return l.url;
  } catch {
    return l.url;
  }
}

/**
 * La page, requête comprise, dates ôtées (`clePage`) : chez iResa, deux fiches
 * ne diffèrent que par `?package=`, et la lecture de l'une se posait sur
 * l'autre, puis passait trente jours dans la mémoire des fiches de Prix.
 */
function cacheKey(url: string): string {
  return `${CACHE_GEN}|${clePage(url)}`;
}

function lireCache(url: string): LectureFiche | null {
  const e = cache.get(cacheKey(url));
  if (!e) return null;
  const ttl = e.blocked ? BLOCK_MS : e.hit ? HIT_MS : MISS_MS;
  if (Date.now() - e.at > ttl) {
    cache.delete(cacheKey(url));
    return null;
  }
  return e.lect;
}

/** Une lecture en cache, hors pause après un refus : celle-là n'a rien lu. */
function lectureEnCache(url: string): LectureFiche | null {
  const e = cache.get(cacheKey(url));
  if (!e || e.blocked) return null;
  return lireCache(url);
}

function utile(lect: LectureFiche): boolean {
  return (
    lect.guests != null ||
    lect.bedrooms != null ||
    lect.rooms != null ||
    plausible(lect.lat, lect.lon) ||
    Boolean(lect.street && /\d/.test(lect.street)) ||
    Boolean(lect.title && !titreEstFichier(lect.title))
  );
}

/**
 * Pose sur `row` ce que la fiche publie et que l'annonce tait. `taxe` :
 * ajoute au loyer seul d'une centrale la taxe de séjour que la fiche publie
 * (Logements). L'écran Prix ne la pose pas : sa complétion ne comble que des
 * trous, et une médiane ne mêle pas des totaux avec et sans taxe.
 */
export function poserLecture(
  row: Listing,
  lect: LectureFiche,
  tag = "fiche",
  opts: { taxe?: boolean } = {},
): boolean {
  let changed = false;
  if (row.guests == null && lect.guests != null) {
    row.guests = lect.guests;
    changed = true;
  }
  if (row.bedrooms == null && lect.bedrooms != null) {
    row.bedrooms = lect.bedrooms;
    changed = true;
  }
  if ((row.rooms == null || row.rooms <= 0) && lect.rooms != null) {
    row.rooms = lect.rooms;
    changed = true;
  }
  if (!plausible(row.lat, row.lon) && plausible(lect.lat, lect.lon)) {
    row.lat = lect.lat;
    row.lon = lect.lon;
    changed = true;
  }
  if (!row.locality && lect.locality) {
    row.locality = lect.locality;
    changed = true;
  }
  if (lect.title && !titreEstFichier(lect.title)) {
    const slug = titreDepuisUrl(row.url);
    const gitesRenomme = row.source === "Gîtes de France" && row.title !== lect.title;
    if (titreEstFichier(row.title) || (slug != null && row.title === slug) || gitesRenomme) {
      row.title = lect.title;
      changed = true;
    }
  }
  // Pas sur un total de panier (loyer et taxe) ni sur une taxe déjà posée :
  // la même garde que `fillTarifs` (`horsFraisSejour`).
  if (lect.taxeSejour != null && (opts.taxe ?? true) && horsFraisSejour(row)) {
    row.total = Math.round((row.total + lect.taxeSejour) * 100) / 100;
    row.proven = `${row.proven} · taxe de séjour ${montantCents(lect.taxeSejour)}`;
    changed = true;
  }
  if (changed && tag && !new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(row.proven)) {
    row.proven = `${row.proven} · ${tag}`;
  }
  return changed;
}

function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function clusterGps(listings: Listing[]): { lat: number; lon: number } | null {
  const pts = listings.filter((l) => plausible(l.lat, l.lon)) as Array<Listing & { lat: number; lon: number }>;
  if (pts.length < 3) return null;
  return {
    lat: pts.reduce((s, l) => s + l.lat, 0) / pts.length,
    lon: pts.reduce((s, l) => s + l.lon, 0) / pts.length,
  };
}

const geoCache = new Map<string, { at: number; lat: number | null; lon: number | null }>();

/** « LES 2 ALPES » n'est pas un toponyme OSM ; « Les Deux Alpes, 38860 » l'est. */
function lieuPourAdresse(locality: string | null): string {
  const t = (locality ?? "").trim();
  if (/les\s*2\s*alpes/i.test(t) || /les\s*deux[\s-]*alpes/i.test(t)) return "Les Deux Alpes, 38860, France";
  if (t) return `${t}, France`;
  return "France";
}

/**
 * Localise une rue numérotée déjà publiée, jamais une commune.
 * Le point OSM n'est retenu que s'il tombe près des autres GPS du relevé.
 */
async function geocodeRue(street: string, locality: string | null): Promise<{ lat: number; lon: number } | null> {
  if (!/\d/.test(street)) return null;
  const q = [street.replace(/,\s*$/, "").trim(), lieuPourAdresse(locality)].join(", ");
  const hit = geoCache.get(q);
  if (hit && Date.now() - hit.at < HIT_MS) {
    return plausible(hit.lat, hit.lon) ? { lat: hit.lat as number, lon: hit.lon as number } : null;
  }
  try {
    const u = new URL("https://nominatim.openstreetmap.org/search");
    u.searchParams.set("format", "json");
    u.searchParams.set("limit", "1");
    u.searchParams.set("q", q);
    const res = await fetch(u, {
      headers: { Accept: "application/json", "User-Agent": "Skitrack/1.0 (+https://skitrack.local)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ lat?: string; lon?: string; class?: string; type?: string }>;
    const row = rows[0];
    const kind = `${row?.class ?? ""}:${row?.type ?? ""}`;
    if (/place:(city|town|village|municipality|hamlet)|boundary:administrative/i.test(kind)) {
      geoCache.set(q, { at: Date.now(), lat: null, lon: null });
      return null;
    }
    const lat = Number(row?.lat);
    const lon = Number(row?.lon);
    if (!plausible(lat, lon)) {
      geoCache.set(q, { at: Date.now(), lat: null, lon: null });
      return null;
    }
    geoCache.set(q, { at: Date.now(), lat, lon });
    return { lat, lon };
  } catch {
    return null;
  }
}

async function fillAdresses(listings: Listing[], until: number, communes: ReadonlySet<string>): Promise<number> {
  const cluster = clusterGps(listings);
  if (!cluster) return 0;
  let n = 0;
  for (const row of listings) {
    if (Date.now() >= until) break;
    if (plausible(row.lat, row.lon)) continue;
    const url = ficheUrlOf(row);
    if (!url) continue;
    // La rue d'une page commune est celle de l'office ou de l'agence.
    if (raisonDeLaisser(row, url, communes) === "URL commune") continue;
    const lect = lireCache(url);
    const street = lect?.street;
    if (!street || !/\d/.test(street)) continue;
    const geo = await geocodeRue(street, lect?.locality ?? row.locality ?? null);
    if (!geo) continue;
    if (kmBetween(geo, cluster) > 15) continue;
    row.lat = geo.lat;
    row.lon = geo.lon;
    if (!/adresse/.test(row.proven)) row.proven = `${row.proven} · adresse`;
    n += 1;
    await new Promise((r) => setTimeout(r, 1100));
  }
  if (n) console.info(`[fiche] ${n} GPS d'adresse`);
  return n;
}

function circuitOpen(): boolean {
  return airbnbCircuitOpen();
}

/** Le coupe-circuit ouvert, dit comme tel : aucune requête n'est partie, ce n'est pas un 429 de plus. */
function enPause(): string {
  return `Airbnb en pause après un refus (coupe-circuit, encore ${Math.round(airbnbCircuitRestantMs() / 1000)} s)`;
}

/** Ouvre le coupe-circuit et pose la même pause au journal de taux, comme `throttle.refus` en Python. */
function tripCircuit(waitMs: number): number {
  const holdMs = tripAirbnbCircuit(waitMs);
  noterBlocage("airbnb", holdMs);
  return holdMs;
}

/**
 * `limited` : l'hôte a refusé (429, 503, 403, page de blocage). `rythme` :
 * notre limiteur (`taux`) a dit « trop tôt », et rien n'est parti — l'hôte
 * n'a rien refusé. `pause` : le coupe-circuit Airbnb s'est ouvert pendant
 * l'attente du créneau, et rien n'est parti. `delai` : le temps de la passe
 * était écoulé avant le départ, ou la page, partie tard, a été coupée avant
 * `SILENCE_MS` ; elle n'est pas lue, et reste à lire (l'écran Prix la
 * redemande à la tranche suivante). `muet` : la page est partie, et l'hôte
 * n'a rien rendu en `SILENCE_MS` ou plus, jusqu'à la coupure ; la redemander
 * à chaque tranche le solliciterait sans fin.
 */
type FetchOutcome =
  | { kind: "html"; html: string }
  | { kind: "limited"; status: number; retryAfterMs: number }
  | { kind: "rythme"; waitMs: number }
  | { kind: "pause"; restantMs: number }
  | { kind: "delai" }
  | { kind: "muet" }
  | { kind: "empty" };

/** Une page sans réponse au bout de ce temps : l'hôte ne répond pas. */
const SILENCE_MS = 15_000;

function hoteTaux(url: string): "airbnb" | "gites" | null {
  if (estHoteAirbnb(url)) return "airbnb";
  try {
    if (/gites-de-france\.com$/i.test(new URL(url).hostname)) return "gites";
  } catch {
    /* URL illisible : pas de file d'attente */
  }
  return null;
}

/** Les fiches réellement demandées au réseau pendant une passe. */
type Compte = { lues: number };

async function fetchHtml(
  url: string,
  until: number,
  compte: Compte,
  attenteMaxMs = 5_000,
): Promise<FetchOutcome> {
  if (Date.now() >= until) return { kind: "delai" };
  const host = hoteTaux(url);
  if (host) {
    const pause = await paceTaux(host, Math.min(attenteMaxMs, Math.max(0, until - Date.now())));
    // Un refus arrivé pendant l'attente du créneau (Python, un autre relevé) :
    // la fiche ne part pas pendant la pause qu'il a ouverte.
    if (host === "airbnb" && airbnbCircuitOpen()) return { kind: "pause", restantMs: airbnbCircuitRestantMs() };
    if (pause > 0) return { kind: "rythme", waitMs: pause };
  }
  const ctrl = new AbortController();
  const wait = setTimeout(() => ctrl.abort(), Math.max(1_000, until - Date.now()));
  const depart = Date.now();
  try {
    const cookie = host === "airbnb" ? airbnbCookieHeader() : "";
    compte.lues += 1;
    const res = await fetch(url, {
      headers: {
        "Accept-Language": "fr-FR,fr;q=0.9",
        Accept: "text/html",
        "User-Agent": UA,
        ...(cookie ? { cookie } : {}),
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (estRefus(res.status)) {
      // La pause demandée entière : le plafond de 12 s ne vaut que sur place.
      const pause = retryAfterMs(res.headers, 0, PAUSE_MAX_MS);
      // Un 403 d'Airbnb est un refus comme un 429 (protocole du 23 septembre
      // 2026) : il passait pour une page vide, et la fiche suivante partait.
      // Ailleurs, un 403 arrête l'hôte (`fillPool`) sans pause partagée.
      if (host && (host === "airbnb" || estStatutRalenti(res.status))) noterBlocage(host, pause);
      return { kind: "limited", status: res.status, retryAfterMs: pause };
    }
    // 202 : un défi anti-robot (AWS WAF chez Booking), pas la fiche. Lu comme
    // une fiche, il rendait le titre « JavaScript is disabled », gardé 24 h.
    if (!res.ok || res.status === 202) return { kind: "empty" };
    const html = await res.text();
    if (html.length < 400) return { kind: "empty" };
    if (htmlEstBloque(html)) {
      const waitMs = retryAfterMs(res.headers, 0, PAUSE_MAX_MS);
      if (host) noterBlocage(host, waitMs);
      return { kind: "limited", status: 429, retryAfterMs: waitMs };
    }
    return { kind: "html", html };
  } catch {
    if (!ctrl.signal.aborted) return { kind: "empty" };
    return Date.now() - depart >= SILENCE_MS ? { kind: "muet" } : { kind: "delai" };
  } finally {
    clearTimeout(wait);
  }
}

const VIDE: LectureFiche = {
  guests: null,
  bedrooms: null,
  rooms: null,
  lat: null,
  lon: null,
  locality: null,
  street: null,
  title: null,
  taxeSejour: null,
};

/** Ce qu'une passe de pages a fait, fiche par fiche. */
type BilanPages = {
  filled: number;
  /** Fiches ouvertes : la réponse est arrivée, pleine ou vide (`lect` à `null`). */
  ouvertes: Array<{ row: Listing; lect: LectureFiche | null }>;
  /** Laissées en route : hôte qui a refusé, ou disjoncteur. */
  laissees: Listing[];
};

/**
 * Le prochain départ permis vers chaque hôte, pour tout le processus :
 * l'écart d'une seconde tient d'une tranche de Prix à la suivante, et d'un
 * écran à l'autre (même rôle que `derniereRooms` pour Airbnb).
 */
const departsHotes = new Map<string, number>();

/**
 * Les pages de fiche hors Airbnb, hôte par hôte (`limiteHotes.ts`) : deux
 * lectures en vol au plus par hôte, une seconde entre deux départs, et
 * l'hôte laissé au premier 429, 403 ou 503, ou quand il ne répond pas
 * (`muet`), pour le reste de la passe. `workers` borne les lectures de tous
 * les hôtes réunis ; la place se prend avant de réserver le départ, pour que
 * l'écart se compte entre deux départs réels.
 *
 * Un hôte dont `SANS_PRISE_MAX` fiches trouées de suite ne comblent rien est
 * laissé pour la passe : sans cela, une page que le lecteur ne sait pas lire
 * coûtait jusqu'à `MAX_FICHES` requêtes à chaque recherche. Un ralentissement
 * (pause de `taux`) n'est pas compté : ce n'est pas le lecteur.
 */
async function fillPool(
  targets: Listing[],
  until: number,
  workers: number,
  compte: Compte,
  opts: { rythme?: RythmeHotes; taxe?: boolean } = {},
): Promise<BilanPages> {
  const rythme = opts.rythme ?? new RythmeHotes({ departs: departsHotes });
  const bilan: BilanPages = { filled: 0, ouvertes: [], laissees: [] };
  if (targets.length === 0) return bilan;
  const disj = disjoncteur(SANS_PRISE_MAX);
  const places = semaphore(workers);
  const laisses = new Map<string, number>();
  const laisser = (hote: string, row: Listing) => {
    laisses.set(hote, (laisses.get(hote) ?? 0) + 1);
    bilan.laissees.push(row);
  };
  const files = parHote(targets, (row) => {
    const url = ficheUrlOf(row);
    return url ? (hoteDe(url) ?? url) : null;
  });
  const lire = async (hote: string, file: Listing[]): Promise<void> => {
    for (let row = file.shift(); row; row = file.shift()) {
      if (Date.now() >= until) return;
      const url = ficheUrlOf(row);
      if (!url) continue;
      // Une fiche Gîtes sans trou s'ouvre pour aligner le nom : elle ne
      // juge pas le lecteur, et le disjoncteur ne la coupe pas.
      const vise = trouee(row);
      if (rythme.aRefuse(hote) || (vise && disj.coupe(hote))) {
        laisser(hote, row);
        continue;
      }
      let comble = false;
      await places.prendre();
      try {
        // Réservé une fois la place prise : quand les places manquent, deux
        // lecteurs d'un même hôte ne partent plus ensemble à leur libération.
        const attente = rythme.reserver(hote);
        if (attente > 0) {
          if (Date.now() + attente >= until) return;
          await new Promise((r) => setTimeout(r, attente));
          if (rythme.aRefuse(hote)) {
            laisser(hote, row);
            continue;
          }
        }
        const got = await fetchHtml(url, until, compte);
        if (got.kind === "limited") {
          rythme.refuser(hote);
          laisser(hote, row);
          console.warn(`[fiche] ${hote} : HTTP ${got.status}, hôte laissé pour la suite`);
          continue;
        }
        if (got.kind === "muet") {
          // Partie, et rien en retour : essayée, et l'hôte laissé.
          rythme.refuser(hote);
          bilan.ouvertes.push({ row, lect: null });
          console.warn(`[fiche] ${hote} : aucune réponse en ${SILENCE_MS / 1000} s, hôte laissé pour la suite`);
          continue;
        }
        if (got.kind === "rythme" || got.kind === "pause" || got.kind === "delai") continue;
        if (got.kind === "html") {
          const lect = lectureFiche(got.html);
          cache.set(cacheKey(url), { at: Date.now(), lect, hit: utile(lect) });
          comble = poserLecture(row, lect, "fiche", { taxe: opts.taxe });
          if (comble) bilan.filled += 1;
          bilan.ouvertes.push({ row, lect });
        } else {
          bilan.ouvertes.push({ row, lect: null });
        }
      } catch {
        // Page illisible : les trous restent nommés, et la fiche ne se
        // redemande pas à la tranche suivante.
        bilan.ouvertes.push({ row, lect: null });
      } finally {
        places.rendre();
      }
      if (vise && disj.noter(hote, comble)) {
        console.warn(`[fiche] ${hote} : ${SANS_PRISE_MAX} fiches de suite sans rien combler — hôte laissé`);
      }
    }
  };
  await Promise.all(
    [...files].flatMap(([hote, file]) =>
      Array.from({ length: Math.min(PAR_HOTE, file.length) }, () => lire(hote, file)),
    ),
  );
  for (const [hote, k] of laisses) console.info(`[fiche] ${hote} : ${k} fiches non ouvertes`);
  return bilan;
}

/** Le rythme des pages `rooms/` : l'écart entre deux pages, et l'attente du créneau acceptée. */
type RythmeRooms = { ecartMs: number; attenteMaxMs: number };
/** Logements : l'écran attend, 5 s d'attente du créneau au plus. */
const ROOMS_LOGEMENTS: RythmeRooms = { ecartMs: 1_200, attenteMaxMs: 5_000 };
/**
 * Prix, en arrière-plan : personne n'attend, le créneau peut prendre 30 s ;
 * mais 6 s au moins entre deux pages `rooms/`, dont le rythme soutenu est le
 * déclencheur connu du 429 et n'a jamais été mesuré.
 */
const ROOMS_PROFOND: RythmeRooms = { ecartMs: 6_000, attenteMaxMs: 30_000 };

/**
 * Le départ de la dernière page `rooms/` du processus, tous appels confondus :
 * l'écart court d'une tranche de Prix à la suivante, et d'un écran à l'autre.
 */
let derniereRooms = 0;

type SuiteAirbnb = {
  filled: number;
  ouvertes: Array<{ row: Listing; lect: LectureFiche | null }>;
  arret: "refus" | "coupe-circuit" | "rythme" | null;
  attenteMs?: number;
};

/**
 * Les fiches `rooms/`, une à une, `rythme.ecartMs` au moins entre deux.
 *
 * Notre limiteur qui dit « trop tôt » arrête le lot sans toucher au
 * coupe-circuit partagé : celui-ci, le relevé Airbnb suivant le rapporte
 * « HTTP 429 » pendant 45 s, alors qu'Airbnb n'aurait rien refusé (même règle
 * que `RythmeLocal` côté Python). Un vrai refus (429, 503, 403, page de
 * blocage) ouvre le coupe-circuit et arrête le lot, sans reprise : une
 * seconde requête pendant la pause qu'Airbnb vient de demander est le second
 * 429 le plus probable.
 */
async function fillAirbnbSeq(
  targets: Listing[],
  until: number,
  compte: Compte,
  rythme: RythmeRooms = ROOMS_LOGEMENTS,
): Promise<SuiteAirbnb> {
  const suite: SuiteAirbnb = { filled: 0, ouvertes: [], arret: null };
  for (let i = 0; i < targets.length; i++) {
    if (Date.now() >= until) break;
    if (circuitOpen()) {
      console.warn(`[fiche] ${enPause()} — ${targets.length - i} fiches non lues`);
      suite.arret = "coupe-circuit";
      break;
    }
    const row = targets[i];
    const url = ficheUrlOf(row);
    if (!url) continue;
    const ecart = derniereRooms + rythme.ecartMs - Date.now();
    if (ecart > 0) {
      if (Date.now() + ecart >= until) break;
      await new Promise((r) => setTimeout(r, ecart));
    }
    const got = await fetchHtml(url, until, compte, rythme.attenteMaxMs);
    if (got.kind === "pause") {
      console.warn(`[fiche] ${enPause()} — ${targets.length - i} fiches non lues`);
      suite.arret = "coupe-circuit";
      break;
    }
    if (got.kind === "rythme") {
      console.info(
        `[fiche] Airbnb : limiteur local, ${Math.round(got.waitMs / 1000)} s à attendre — ${targets.length - i} fiches remises`,
      );
      suite.arret = "rythme";
      suite.attenteMs = got.waitMs;
      break;
    }
    derniereRooms = Date.now();
    if (got.kind === "delai") break;
    if (got.kind === "muet") {
      // Partie, et rien en retour : essayée ; la suivante attendra la tranche.
      suite.ouvertes.push({ row, lect: null });
      break;
    }
    if (got.kind === "limited") {
      cache.set(cacheKey(url), { at: Date.now(), lect: VIDE, hit: false, blocked: true });
      const holdMs = tripCircuit(got.retryAfterMs);
      console.warn(
        `[fiche] Airbnb HTTP ${got.status} — pause partagée ${Math.round(holdMs / 1000)} s, ${targets.length - i - 1} fiches non lues`,
      );
      suite.arret = "refus";
      break;
    }
    if (got.kind !== "html") {
      suite.ouvertes.push({ row, lect: null });
      continue;
    }
    const lect = lectureFiche(got.html);
    cache.set(cacheKey(url), { at: Date.now(), lect, hit: utile(lect) });
    if (poserLecture(row, lect)) suite.filled += 1;
    suite.ouvertes.push({ row, lect });
  }
  return suite;
}

/**
 * Remplit capacité, chambres et GPS encore vides, via la page de fiche que
 * l'annonce porte déjà. Pour Gîtes, on aligne aussi le nom et l'URL
 * publics : un ancien slug n'est plus la fiche.
 *
 * `budgetMs` borne le réseau : un délai épuisé n'efface pas ce que le relevé
 * ou le cache ont déjà posé.
 */
export async function fillFiches(listings: Listing[], budgetMs = BUDGET_MS): Promise<number> {
  let filled = poserReleve(listings, RELEVE_2A);
  const until = Date.now() + Math.max(0, budgetMs);
  // Une page que portent plusieurs annonces n'est la fiche d'aucune : ni
  // ouverte, ni lue dans le cache pour l'une d'elles (`priseFiche.ts`).
  const communes = urlsPartagees(listings, urlPropre);
  const trous = listings.filter((l) => trouee(l) && ficheUrlOf(l));
  const gites = listings.filter((l) => l.source === "Gîtes de France" && ficheUrlOf(l));
  const seen = new Set(trous);
  const need = [...trous, ...gites.filter((l) => !seen.has(l))].sort((a, b) => trousN(b) - trousN(a));
  if (need.length === 0) {
    if (filled) console.info(`[fiche] ${filled} du relevé`);
    filled += await fillAdresses(listings, until, communes);
    await verifierFichesGites(listings, until);
    return filled;
  }

  let cached = 0;
  const todo: Listing[] = [];
  for (const row of need) {
    const url = ficheUrlOf(row);
    if (!url) continue;
    const hit = raisonDeLaisser(row, url, communes) === "URL commune" ? null : lireCache(url);
    if (hit) {
      if (poserLecture(row, hit)) filled += 1;
      cached += 1;
      continue;
    }
    todo.push(row);
  }
  // Ce que la fiche ne peut pas combler n'est pas ouvert (voir priseFiche.ts),
  // et le tri précède la borne : un Airbnb à GPS, qu'on n'ouvre jamais, ne
  // prend plus la place d'une fiche qu'on ouvrirait.
  const { aLire, laissees } = choisirFiches(todo, ficheUrlOf, communes);
  const compte: Compte = { lues: 0 };
  if (aLire.length > 0 && Date.now() < until) {
    const targets = aLire.slice(0, MAX_FICHES);
    // GPS déjà là : pas de rooms/, c'est ce fetch qui ouvre le 429. `choisirFiches` les a laissés.
    const airbnb = targets.filter((l) => l.source === "Airbnb" || estHoteAirbnb(ficheUrlOf(l) ?? ""));
    const autres = targets.filter((l) => !(l.source === "Airbnb" || estHoteAirbnb(ficheUrlOf(l) ?? "")));
    filled += (await fillPool(autres, until, WORKERS, compte)).filled;
    if (airbnb.length && !circuitOpen()) {
      filled += (await fillAirbnbSeq(airbnb, until, compte)).filled;
    } else if (airbnb.length && circuitOpen()) {
      console.warn(`[fiche] ${enPause()} — ${airbnb.length} fiches reportées`);
    }
  }
  console.info(
    `[fiche] ${filled}/${need.length} fiches · ${cached} cache · ${compte.lues} lues${ecrireLaissees(laissees)}`,
  );
  filled += await fillAdresses(listings, until, communes);
  await verifierFichesGites(listings, until);
  return filled;
}

/* ---------- Écran Prix : complétion par tranches ---------- */

function courte(lect: LectureFiche | null): LectureCourte | null {
  if (!lect) return null;
  return { guests: lect.guests, bedrooms: lect.bedrooms, rooms: lect.rooms, lat: lect.lat, lon: lect.lon };
}

/**
 * Les annonces hors Airbnb qu'aucune page ne complétera : pas de fiche, une
 * fiche qui ne publie pas ce qui leur manque (`priseFiche.ts`), une URL
 * commune, ou un hôte qui a refusé plus tôt dans la course.
 */
export function laisseesProfond(rows: Listing[], opts: Omit<OptionsPages, "until">): string[] {
  const communes = new Set([...opts.urlsCommunes, ...urlsPartagees(rows, urlPropre)]);
  const exclus = new Set(opts.hotesExclus);
  const out: string[] = [];
  for (const row of rows) {
    if (row.source === "Airbnb") continue;
    const url = ficheUrlOf(row);
    if (!url || raisonDeLaisser(row, url, communes) || exclus.has(hoteDe(url) ?? url)) out.push(row.id);
  }
  return out;
}

/**
 * Une tranche de pages hors Airbnb pour l'écran Prix (`completerProfond`) :
 * les annonces reçues sont comblées sur place, taxe de séjour à part (le prix
 * relevé ne change pas). Même lecture et même rythme par hôte que Logements ;
 * les hôtes qui ont refusé plus tôt dans la course, ou qui n'ont pas
 * répondu, ne reçoivent rien.
 */
export async function lirePagesProfond(rows: Listing[], opts: OptionsPages): Promise<PagesProfond> {
  const laissees = new Set(laisseesProfond(rows, opts));
  const essayees: string[] = [];
  const lectures: Record<string, LectureCourte> = {};
  const todo: Listing[] = [];
  for (const row of rows) {
    if (row.source === "Airbnb" || laissees.has(row.id)) continue;
    const hit = lectureEnCache(ficheUrlOf(row) as string);
    if (hit) {
      poserLecture(row, hit, "fiche", { taxe: false });
      essayees.push(row.id);
      lectures[row.id] = courte(hit) as LectureCourte;
      continue;
    }
    todo.push(row);
  }
  const compte: Compte = { lues: 0 };
  const rythme = new RythmeHotes({ refus: opts.hotesExclus, departs: departsHotes });
  const bilan = await fillPool(todo, opts.until, WORKERS, compte, { rythme, taxe: false });
  for (const { row, lect } of bilan.ouvertes) {
    essayees.push(row.id);
    const l = courte(lect);
    if (l) lectures[row.id] = l;
  }
  for (const row of bilan.laissees) laissees.add(row.id);
  const hotesRefus = rythme.refuses().filter((h) => !opts.hotesExclus.includes(h));
  // Les annonces d'un hôte qui a refusé en route : plus rien vers lui.
  const faites = new Set(essayees);
  for (const row of todo) {
    const url = ficheUrlOf(row);
    if (url && !faites.has(row.id) && hotesRefus.includes(hoteDe(url) ?? url)) laissees.add(row.id);
  }
  return { essayees, laissees: [...laissees], hotesRefus, lectures, lues: compte.lues };
}

/**
 * Les pages `rooms/` des annonces Airbnb, repli de l'écran Prix quand la
 * requête PDP n'est plus connue d'Airbnb (`lireFichesAirbnb` rend `hash`).
 * Une à une, 6 s au moins entre deux, arrêt au premier refus.
 */
export async function lirePagesAirbnbProfond(rows: Listing[], until: number): Promise<PagesAirbnbProfond> {
  const essayees: string[] = [];
  const lectures: Record<string, LectureCourte> = {};
  const todo: Listing[] = [];
  for (const row of rows) {
    const url = ficheUrlOf(row);
    if (!url) continue;
    const hit = lectureEnCache(url);
    if (hit) {
      poserLecture(row, hit, "fiche Airbnb");
      essayees.push(row.id);
      lectures[row.id] = courte(hit) as LectureCourte;
      continue;
    }
    todo.push(row);
  }
  const compte: Compte = { lues: 0 };
  const suite = await fillAirbnbSeq(todo, until, compte, ROOMS_PROFOND);
  for (const { row, lect } of suite.ouvertes) {
    essayees.push(row.id);
    const l = courte(lect);
    if (l) lectures[row.id] = l;
  }
  return {
    essayees,
    arret: suite.arret,
    ...(suite.attenteMs != null ? { attenteMs: suite.attenteMs } : {}),
    lectures,
    lues: compte.lues,
  };
}

/**
 * Une URL publique en 404 n'est pas un gîte. Cloudflare n'en est pas la preuve.
 * On ne retire que ce que la page dit introuvable.
 */
function gitesAVerifier(l: Listing): boolean {
  if (l.source !== "Gîtes de France" || !l.url || !/gites-de-france\.com/i.test(l.url)) return false;
  const a = slugUrlGites(l.url);
  const b = slugGites(l.title);
  return Boolean(a && b && a !== b);
}

async function verifierFichesGites(listings: Listing[], until: number): Promise<void> {
  const cibles = listings.filter(gitesAVerifier);
  if (cibles.length === 0 || Date.now() >= until) return;
  try {
    const { withBrowser } = await import("../scrape/browser.server.ts");
    await withBrowser(async (open) => {
      const page = await open();
      for (const row of cibles) {
        if (Date.now() >= until) return;
        const url = row.url;
        if (!url) continue;
        try {
          const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12_000 });
          const status = res?.status() ?? 0;
          const html = await page.content();
          if (estPageGitesIntrouvable(html, status)) {
            const next = row.title ? urlGitesDepuisNom(url, row.title) : null;
            if (next && next !== url) {
              const res2 = await page.goto(next, { waitUntil: "domcontentloaded", timeout: 12_000 });
              const html2 = await page.content();
              const st2 = res2?.status() ?? 0;
              if (!estPageGitesIntrouvable(html2, st2)) {
                row.url = next;
                if (!/fiche/.test(row.proven)) row.proven = `${row.proven} · fiche`;
                if (st2 === 200) poserLecture(row, lectureFiche(html2));
                continue;
              }
            }
            const marked = marquerFicheIntrouvable(row);
            row.proven = marked.proven;
            continue;
          }
          if (status === 200) {
            const lect = lectureFiche(html);
            poserLecture(row, lect);
          }
        } catch {
          /* réseau : on garde l'URL alignée, on ne déclare pas l'absence */
        }
      }
    });
  } catch {
    /* navigateur injoignable : l'alignement widget reste */
  }
}
