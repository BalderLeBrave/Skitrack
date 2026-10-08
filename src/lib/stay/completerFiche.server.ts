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
import { lectureAirbnb, lectureFiche, pageAirbnbLisible, type LectureFiche } from "./lectureFiche.ts";
import { contenuDeFiche, type ContenuDeFiche } from "./contenuFiche.ts";
import { contenuFiches } from "./contenuFiches.server.ts";
import { adressePourBan, BAN_URL, pointBan, requeteBan, type FeatureBan, type SourceGps } from "./repliGps.ts";
import { stationById } from "../stations.ts";
import { MARQUE_MEMOIRE, poserValeur, qualifierLogement, valeurDuTexte } from "./logement.ts";
import { PAR_HOTE, parHote, RythmeHotes, semaphore } from "./limiteHotes.ts";
import { horsFraisSejour } from "./tarif.ts";
import { cleListing, poserReleve } from "./poserReleve.ts";
import { comblerDepuisMemoire, memoireFiches, type ValeursFiche } from "./memoireFiches.server.ts";
import {
  choisirFiches,
  airbnbComplet,
  clePage,
  cleUrl,
  disjoncteur,
  ecrireLaissees,
  hoteDe,
  plausible,
  raisonDeLaisser,
  urlPropre,
  urlsPartagees,
} from "./priseFiche.ts";
import { titreEstFichier, titreDepuisUrl } from "./titre.ts";
import { NOTE_COUCHAGES } from "./couchages.ts";
import { completerParApify } from "./completerApify.server.ts";
import { demanderApify, ficheApify, sejourApify } from "../scrape/apify/airbnbApify.server.ts";
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

/**
 * L'annonce a un trou que sa fiche peut combler : une valeur absente, ou que
 * seul le texte ou le type a donnée (`text_regex`, `derived_from_type`). Un
 * champ structuré de la page de détail passe devant le texte
 * (`logement.ts`) ; `raisonDeLaisser` ne l'ouvre pour une valeur du texte que
 * chez un hôte dont la fiche la publie, et la politique de lecture reste
 * celle-ci : deux fiches au plus en vol par hôte, une seconde entre deux
 * départs (`limiteHotes.ts`), un hôte laissé après cinq fiches qui ne
 * comblent rien.
 */
function trouee(l: Listing): boolean {
  // Airbnb : les trois champs, toujours. Des chambres absentes sont un trou
  // même avec des pièces, 0 personne n'est pas une capacité (`airbnbComplet`).
  // Des chambres lues dans le titre de partage de sa page n'en sont pas un :
  // Airbnb ne les publie pas autrement (`qualifierAirbnb`).
  if (l.source === "Airbnb") return !airbnbComplet(l);
  if (l.capacity == null) return true;
  if (l.bedrooms == null && (l.rooms == null || l.rooms <= 0)) return true;
  if (valeurDuTexte(l, "capacity") || valeurDuTexte(l, "bedrooms")) return true;
  if (titreEstFichier(l.title)) return true;
  if (l.source === "Gîtes de France") return false;
  if (!plausible(l.lat, l.lon)) return true;
  return false;
}

/** Les vrais trous d'abord, toujours : une valeur absente pèse dix fois une
 *  valeur lue dans le texte, si bien qu'aucune annonce qui n'a que des
 *  valeurs du texte ne passe devant une annonce muette. */
function trousN(l: Listing): number {
  const airbnb = l.source === "Airbnb";
  let n = 0;
  if (l.capacity == null || (airbnb && !(l.capacity > 0))) n += 10;
  else if (valeurDuTexte(l, "capacity")) n += 1;
  if (l.bedrooms == null && (airbnb || l.rooms == null || l.rooms <= 0)) n += 10;
  else if (valeurDuTexte(l, "bedrooms")) n += 1;
  if (!plausible(l.lat, l.lon)) n += 10;
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
    lect.capacity != null ||
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
/** La capacité posée est la somme des couchages décrits : `proven` le dit. */
function noterCouchages(row: Listing): void {
  if (!row.proven.includes(NOTE_COUCHAGES)) row.proven = `${row.proven} · ${NOTE_COUCHAGES}`;
}

export function poserLecture(
  row: Listing,
  lect: LectureFiche,
  tag = "fiche",
  opts: { taxe?: boolean } = {},
): boolean {
  let changed = false;
  // Un champ structuré de la page de détail passe devant le texte, jamais
  // devant celui de la plateforme ; les chambres dérivées suivent ensuite.
  let logement = false;
  // Airbnb : la page lue, ce qu'elle ne publie pas y manque vraiment ; une
  // capacité absente devient celle du titre (`capaciteIntrouvable`).
  const pageNeuve = Boolean(lect.pageLue) && row.source === "Airbnb" && row.pdpLue !== true;
  if (pageNeuve) row.pdpLue = true;
  if (poserValeur(row, "capacity", lect.capacity, lect.capacitySource ?? "structured")) {
    logement = true;
    if (lect.capaciteCouchages) noterCouchages(row);
  }
  if (poserValeur(row, "bedrooms", lect.bedrooms, lect.bedroomsSource ?? "structured")) logement = true;
  if (poserValeur(row, "rooms", lect.rooms, "structured")) logement = true;
  if (logement) {
    Object.assign(row, qualifierLogement(row));
    changed = true;
  } else if (pageNeuve && row.capacity == null) {
    Object.assign(row, qualifierLogement(row));
    if (row.capacity != null) changed = true;
  }
  if (!plausible(row.lat, row.lon) && plausible(lect.lat, lect.lon)) {
    row.lat = lect.lat;
    row.lon = lect.lon;
    // Airbnb : le point dit d'où il vient (`repliGps.ts`). Un point de la
    // liste n'est jamais touché : on n'arrive ici que sans lui.
    if (lect.gpsSource) row.gpsSource = lect.gpsSource;
    changed = true;
  }
  if (!row.locality && lect.locality) {
    row.locality = lect.locality;
    changed = true;
  }
  // Les lits de l'aperçu Airbnb (« 4 lits ») : à part de la capacité, dans un vide.
  if (row.beds == null && lect.beds != null) {
    row.beds = lect.beds;
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

/** Les réponses BAN déjà reçues, par requête : une adresse ne se redemande pas. */
const banCache = new Map<string, { at: number; features: FeatureBan[] | null }>();

/**
 * La Base Adresse Nationale, pour une adresse déjà publiée par une page
 * Airbnb lue. `null` si le service ne répond pas : le point reste un trou.
 */
async function geocoderBan(q: string): Promise<FeatureBan[] | null> {
  const deja = banCache.get(q);
  if (deja && Date.now() - deja.at < HIT_MS) return deja.features;
  try {
    const u = new URL(BAN_URL);
    u.searchParams.set("q", q);
    u.searchParams.set("limit", "5");
    const res = await fetch(u, {
      headers: { Accept: "application/json", "User-Agent": "Skitrack/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const corps = (await res.json()) as { features?: FeatureBan[] };
    const features = Array.isArray(corps?.features) ? corps.features : [];
    banCache.set(q, { at: Date.now(), features });
    return features;
  } catch {
    return null;
  }
}

/**
 * Le repli d'une page Airbnb lue sans `listingLat` / `listingLng`, dans
 * l'ordre : coordonnées déjà écrites dans la page (`page`), puis l'adresse de
 * voie qu'elle publie, géocodée par la BAN et jugée par `pointBan` (`ban`).
 * Le jumelage vient après, sur le relevé entier (`recopie.ts`). `null` : la
 * page ne dit rien de plus, le trou reste nommé.
 */
async function repliGpsAirbnb(
  html: string,
  row: Listing,
): Promise<{ lat: number; lon: number; source: SourceGps } | null> {
  // Ce que la page écrit en nombres : JSON-LD, attributs, paires lat/lng.
  const page = lectureFiche(html);
  if (plausible(page.lat, page.lon)) return { lat: page.lat as number, lon: page.lon as number, source: "page" };
  const adresse = adressePourBan(page.street, page.postcode, page.locality ?? row.locality ?? null);
  if (!adresse) return null;
  const station = stationById(row.stationId);
  if (!station) return null;
  const point = pointBan(await geocoderBan(requeteBan(adresse)), adresse, { lat: station.lat, lon: station.lon });
  return point ? { ...point, source: "ban" } : null;
}

async function fillAdresses(listings: Listing[], until: number, communes: ReadonlySet<string>): Promise<number> {
  const cluster = clusterGps(listings);
  if (!cluster) return 0;
  let n = 0;
  for (const row of listings) {
    if (Date.now() >= until) break;
    if (plausible(row.lat, row.lon)) continue;
    // Airbnb : la BAN seule, jugée par `pointBan` (`repliGpsAirbnb`), jamais
    // ce géocodage-ci, qui ne juge le point qu'au centre des autres.
    if (row.source === "Airbnb") continue;
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
  capacity: null,
  capacitySource: null,
  bedrooms: null,
  bedroomsSource: null,
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

/** Une pause posée sur un hôte de fiche qui a refusé, au moins ce temps. */
const PAUSE_HOTE_MS = 10 * 60_000;
/**
 * Les hôtes de fiche (hors Airbnb) qui ont refusé (429, 403, 503, page de
 * blocage), et jusqu'à quand on les laisse, pour tout le processus : leur
 * `Retry-After`, et 10 minutes au moins. Le refus ne valait que pour la passe :
 * chaque recherche redemandait l'hôte et essuyait un nouveau refus (douze de
 * suite chez fr.locationlesmenuires.com le 2 octobre 2026, une par recherche).
 */
const pausesHotes = new Map<string, number>();

function hotesEnPause(now = Date.now()): string[] {
  const out: string[] = [];
  for (const [hote, jusqua] of pausesHotes) {
    if (jusqua > now) out.push(hote);
    else pausesHotes.delete(hote);
  }
  return out;
}

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
/**
 * La description et les équipements qu'une fiche lue publie (`contenuFiche.ts`),
 * posés sur l'annonce sans rien remplacer de ce que la recherche a donné.
 */
function poserContenu(row: Listing, c: ContenuDeFiche | null): void {
  if (!c) return;
  if (!row.description && c.description) row.description = c.description;
  if (!row.amenities && c.amenities) row.amenities = c.amenities;
}

async function fillPool(
  targets: Listing[],
  until: number,
  workers: number,
  compte: Compte,
  opts: { rythme?: RythmeHotes; taxe?: boolean } = {},
): Promise<BilanPages> {
  const rythme = opts.rythme ?? new RythmeHotes({ refus: hotesEnPause(), departs: departsHotes });
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
  // Le contenu des pages lues, gardé en une écriture à la fin : la page ne
  // se rouvre pas pour lui (`contenuFiches.server.ts`).
  const contenus: { cle: string | null; contenu: ContenuDeFiche }[] = [];
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
          pausesHotes.set(hote, Date.now() + Math.max(got.retryAfterMs, PAUSE_HOTE_MS));
          laisser(hote, row);
          console.warn(`[fiche] ${hote} : HTTP ${got.status}, hôte laissé pour ${Math.round(Math.max(got.retryAfterMs, PAUSE_HOTE_MS) / 60_000)} min`);
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
          const contenu = contenuDeFiche(url, got.html);
          if (contenu) {
            poserContenu(row, contenu);
            contenus.push({ cle: cleListing(row), contenu });
          }
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
  if (contenus.length) contenuFiches().noter(contenus);
  return bilan;
}

/** Le rythme des pages `rooms/` : l'écart entre deux pages, et l'attente du créneau acceptée. */
type RythmeRooms = { ecartMs: number; attenteMaxMs: number };
/** Logements : l'écran attend, 5 s d'attente du créneau au plus. */
const ROOMS_LOGEMENTS: RythmeRooms = { ecartMs: 1_200, attenteMaxMs: 5_000 };
/**
 * En arrière-plan (la suite de Logements, les pages de repli de Prix) :
 * personne n'attend, le créneau peut prendre 30 s. 5 s entre deux pages, et
 * la suite s'efface pendant un relevé de liste (`pendantReleveAirbnb`).
 *
 * Choisi le 2 octobre 2026 par simulation, en temps virtuel, sur les vraies
 * fonctions du limiteur (`taux.server.ts`, 2 s et 18 appels par minute) et la
 * règle du worker Python (5 s d'attente au plus, 3 essais, échéance 40 s,
 * 12 pages), pour un relevé lancé pendant la suite (réponses de 1,6 s, pages
 * de 0,7 s) :
 * - l'ancien réglage (6 s, sans pause) : 10,5 pages sur 12, 33,4 s, relevé
 *   coupé 40 fois sur 40 ; suite à 8,9 pages par minute ;
 * - 5 s et pause : 12 sur 12, 25,4 s, aucun coupé ; suite à 10,3 par minute ;
 * - 3,5 s et pause : 12 sur 12 mais 34,7 s ; suite à 13,8. Écarté : la
 *   recherche concurrente y attend ses créneaux plus longtemps qu'avant.
 * Mesuré le même jour aux 2 Alpes, recherche concurrente : 282 annonces,
 * coupée, avec l'ancien réglage ; 290 et complète à 3,5 s et pause (291
 * seule) ; à 2 s, 283, coupée.
 */
const ROOMS_PROFOND: RythmeRooms = { ecartMs: 5_000, attenteMaxMs: 30_000 };
/**
 * Quand la suite de Logements et une course Prix lisent ensemble, chacune
 * reprend l'ancien réglage, 6 s. À 5 s, la suite prenait 12 des 18 places de
 * la minute et n'en laissait que 6 au worker PDP de Prix, contre 8 avant ; et
 * les pages de repli de Prix, à 5 s contre 6 pour la suite, lui auraient pris
 * toutes les places. Ensemble, rien ne change donc par rapport à avant ; seul,
 * chacun lit à 5 s.
 */
const ROOMS_PARTAGE: RythmeRooms = { ecartMs: 6_000, attenteMaxMs: 30_000 };

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
 * Les fiches `rooms/`, une à une, `ecartMs` du rythme au moins entre deux (relu à chaque page).
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
  rythme: RythmeRooms | (() => RythmeRooms) = ROOMS_LOGEMENTS,
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
    // Relu à chaque page : une suite qui démarre, ou une course Prix qui
    // s'arrête, change le rythme en route.
    const r = typeof rythme === "function" ? rythme() : rythme;
    const ecart = derniereRooms + r.ecartMs - Date.now();
    if (ecart > 0) {
      if (Date.now() + ecart >= until) break;
      await new Promise((ok) => setTimeout(ok, ecart));
    }
    const got = await fetchHtml(url, until, compte, r.attenteMaxMs);
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
      // Une réponse vide ou non lisible (404, défi 202, page trop courte) se
      // garde comme un échec ordinaire (30 min) : la recherche ou la
      // relecture suivante ne la redemande pas tout de suite.
      if (got.kind === "empty") cache.set(cacheKey(url), { at: Date.now(), lect: VIDE, hit: false });
      suite.ouvertes.push({ row, lect: null });
      continue;
    }
    // La page Airbnb ne rattrape que ce qu'elle publie en champs : capacité,
    // chambres, point (`lectureAirbnb`). Ni titre ni texte. Lue sans point,
    // et seulement lue : le repli de la page elle-même (`repliGpsAirbnb`).
    if (!pageAirbnbLisible(got.html)) {
      // Une coquille sans les données du logement n'est pas une page lue :
      // pas de repli, et elle se relira dans une demi-heure.
      cache.set(cacheKey(url), { at: Date.now(), lect: VIDE, hit: false });
      suite.ouvertes.push({ row, lect: null });
      continue;
    }
    let lect: LectureFiche = { ...lectureAirbnb(got.html), pageLue: true };
    if (!plausible(row.lat, row.lon) && !plausible(lect.lat, lect.lon)) {
      const repli = await repliGpsAirbnb(got.html, row);
      if (repli) lect = { ...lect, lat: repli.lat, lon: repli.lon, gpsSource: repli.source };
    }
    // Lue : ce qu'elle publie, ou ne publie pas, vaut pour la journée.
    cache.set(cacheKey(url), { at: Date.now(), lect, hit: true });
    if (poserLecture(row, lect)) suite.filled += 1;
    suite.ouvertes.push({ row, lect });
  }
  return suite;
}

/** Une annonce à moins de cette distance d'une remontée est « dans la station ». */
const DANS_LA_STATION_M = 2_000;

/**
 * L'ordre de lecture des pages Airbnb : celles que l'écran montre en premier
 * d'abord. Hors « autre domaine » (l'écran ne les montre pas, et le point de
 * la page est celui de la tuile : sa lecture ne change pas le verdict), puis
 * dans la station (à moins de 2 km d'une remontée), puis avec un prix pour ces
 * dates, puis la moins chère. Aucune n'est retirée : l'ordre seul change, et
 * les autres domaines sont lus après, pour les stations voisines et Prix.
 * Stable : à égalité, l'ordre reçu.
 *
 * À Abondance, le 2 octobre 2026 : 325 annonces sur 413 de la liste directe
 * sont « autre domaine » ; la dernière annonce affichable passe du rang 408 au
 * rang 88 de la file.
 */
export function ordreDeLecture<T extends Pick<Listing, "total" | "distToLiftM" | "domainFit">>(
  rows: readonly T[],
): T[] {
  const cle = (l: T): [number, number, number, number] => [
    l.domainFit === "other" ? 1 : 0,
    l.distToLiftM != null && l.distToLiftM <= DANS_LA_STATION_M ? 0 : 1,
    l.total > 0 ? 0 : 1,
    l.total > 0 ? l.total : 0,
  ];
  return rows
    .map((l, i) => ({ l, i, k: cle(l) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.k[3] - b.k[3] || a.i - b.i)
    .map((x) => x.l);
}

/* ---------- La mémoire des fiches (30 jours, partagée avec l'écran Prix) ---------- */

/** La raison de laisser une page Airbnb lue il y a moins de trente jours. */
export const PAGE_DEJA_LUE = "page Airbnb lue (mémoire)";

type Note = { cle: string } & Partial<ValeursFiche>;

/**
 * Ce qu'une page lue a publié, à noter dans la mémoire des fiches : les
 * valeurs et leur source. Airbnb : seulement une page lisible (`pageLue`), et
 * son point seulement s'il est celui de la page (`listingLat`, provenance
 * `pdp`) — un repli (adresse géocodée, jumelage) ne se mémorise pas. `null` :
 * rien à noter.
 */
export function noteDeLecture(row: Listing, lect: LectureFiche | null): Note | null {
  const cle = cleListing(row);
  if (!cle || !lect) return null;
  const airbnb = row.source === "Airbnb";
  // Airbnb : seulement une page dont on a reconnu le format, c'est-à-dire qui
  // publie `personCapacity`. Un conteneur vide ou une page d'un autre format
  // ne se note pas « lue » : elle se relira, et son silence ne fait pas
  // accepter la capacité du titre pendant trente jours.
  if (airbnb && (lect.pageLue !== true || lect.capacitySource !== "structured")) return null;
  const point = plausible(lect.lat, lect.lon) && (!airbnb || lect.gpsSource === "pdp");
  const note: Note = {
    cle,
    capacity: lect.capacity,
    capacitySource: lect.capacity != null ? (lect.capacitySource ?? "structured") : null,
    ...(lect.capacity != null && lect.capaciteCouchages ? { capaciteCouchages: true } : {}),
    bedrooms: lect.bedrooms,
    bedroomsSource: lect.bedrooms != null ? (lect.bedroomsSource ?? "structured") : null,
    rooms: lect.rooms,
    // Les lits de l'aperçu Airbnb : la mémoire les repose après un redémarrage.
    ...(lect.beds != null ? { beds: lect.beds } : {}),
    lat: point ? lect.lat : null,
    lon: point ? lect.lon : null,
    // Une page `rooms/`, pas la fiche PDP (`page`, et non `lue`) : l'écran Prix
    // lit encore la fiche PDP, seule à porter le signal hôtel. Une chambre ou
    // un hébergement insolite que la page montre (`ecarteeAirbnb`) se note
    // écarté.
    ...(airbnb ? { page: true, ...(lect.ecartee === true ? { ecartee: true } : {}) } : {}),
  };
  return note;
}

function noter(notes: readonly Note[]): void {
  if (notes.length === 0) return;
  try {
    memoireFiches().noter(notes);
  } catch (err) {
    // Une mémoire illisible ou un disque refusé ne coupe pas la recherche.
    console.warn("[fiche] mémoire des fiches non écrite :", (err as Error).message);
  }
}

/**
 * Pose sur les annonces trouées ce que la mémoire des fiches sait d'elles, sans
 * réseau : une page lue il y a moins de trente jours, par Logements ou par
 * Prix, ne se relit pas après un redémarrage, et son annonce s'affiche
 * complète tout de suite. Rien n'est estimé : chaque valeur garde la source
 * de sa lecture (`comblerDepuisMemoire`, `poserValeur`), et ne comble qu'un
 * trou. Rend le nombre d'annonces comblées, et les identifiants des annonces
 * Airbnb dont la page a été lue et ne publie pas ce qui leur manque encore :
 * la redemander coûterait une requête pour rien. Pour l'écran Prix
 * (`fichePdpSeule`), aussi celles que la mémoire sait écartées (`ecartees`) :
 * rien ne s'y pose.
 */
export function poserMemoire(
  rows: Listing[],
  opts: { fichePdpSeule?: boolean } = {},
): { posees: number; dejaLues: Set<string>; ecartees: Set<string> } {
  let posees = 0;
  const dejaLues = new Set<string>();
  const ecartees = new Set<string>();
  let memoire: ReturnType<typeof memoireFiches>;
  try {
    memoire = memoireFiches();
  } catch {
    return { posees, dejaLues, ecartees };
  }
  for (const row of rows) {
    // Airbnb seulement : ailleurs, ouvrir la page pose aussi ce que la mémoire
    // ne garde pas (la taxe de séjour d'une centrale ajoutée au loyer), et une
    // annonce comblée par la mémoire ne l'ouvrirait plus.
    if (row.source !== "Airbnb") continue;
    if (!trouee(row)) {
      // Complète : seule la fiche enrichie de sa page, si la mémoire en garde
      // une (lue par la complétion Prix sur PdpPlatformSections) ; rien
      // d'autre ne change, et aucune page n'est relue.
      if (row.fiche == null) {
        try {
          const f = memoire.lire(cleListing(row))?.fiche;
          if (f) row.fiche = f;
        } catch {
          return { posees, dejaLues, ecartees };
        }
      }
      continue;
    }
    let lu: ReturnType<typeof memoire.lire>;
    try {
      lu = memoire.lire(cleListing(row));
    } catch {
      return { posees, dejaLues, ecartees };
    }
    if (!lu) continue;
    // L'écran Prix ne pose rien sur une annonce que sa fiche a écartée (tente,
    // chambre d'hôtel, chambre privée) : restée trouée, elle reste candidate,
    // et la tranche « mémoire » de la complétion la retire (`trancheProfonde`).
    // Comblée ici, elle n'était plus candidate et entrait dans la médiane.
    if (opts.fichePdpSeule && lu.ecartee === true) {
      ecartees.add(row.id);
      continue;
    }
    // Pour l'écran Prix, une entrée que seule une page `rooms/` de Logements a
    // écrite ne pose rien : elle n'a pas le signal hôtel de la fiche PDP, et
    // l'annonce comblée par elle n'aurait plus été candidate à sa fiche.
    if (opts.fichePdpSeule && lu.page === true && lu.lue !== true) continue;
    // Seules les valeurs dont la source est écrite : une entrée d'un fichier
    // plus ancien, sans source, n'est pas prise pour un champ structuré. Pas
    // de point : celui d'une annonce Airbnb vient de la liste ou de sa page,
    // jamais d'un repli gardé ailleurs.
    // Lue : sa fiche PDP (Prix), ou sa page `rooms/` (Logements). Pour l'écran
    // Prix (`fichePdpSeule`), la page seule ne compte pas : il lit la fiche,
    // qui porte en plus le signal hôtel.
    const lue = lu.lue === true || (!opts.fichePdpSeule && lu.page === true);
    const m = {
      ...lu,
      lue,
      capacity: lu.capacitySource ? lu.capacity : null,
      bedrooms: lu.bedroomsSource ? lu.bedrooms : null,
      lat: null,
      lon: null,
    };
    // La page a été lue : ce qui y manque y manque vraiment, et les mots de la
    // page (chambres du titre de partage, voyageurs de l'aperçu) tiennent.
    // Avant de combler : `poserValeur` le lit.
    if (m.lue) row.pdpLue = true;
    const capaciteAvant = row.capacity;
    if (comblerDepuisMemoire(row, m)) {
      Object.assign(row, qualifierLogement(row));
      if (!row.proven.includes(MARQUE_MEMOIRE)) row.proven = `${row.proven} · ${MARQUE_MEMOIRE}`;
      if (m.capaciteCouchages && row.capacity !== capaciteAvant && row.capacity === m.capacity) noterCouchages(row);
      posees += 1;
    } else if (m.lue && row.capacity == null) {
      // Sans personCapacity : la capacité du titre (`capaciteIntrouvable`).
      Object.assign(row, qualifierLogement(row));
    }
    // Sans point, la page se relit encore : elle donne un point de repli
    // (adresse géocodée) que la mémoire ne garde pas (`repliGps.ts`).
    if (m.lue && trouee(row) && plausible(row.lat, row.lon)) dejaLues.add(row.id);
  }
  return { posees, dejaLues, ecartees };
}

/**
 * Les annonces Airbnb que la mémoire des fiches sait écartées (tente, chambre
 * d'hôtel, chambre privée) : l'écran Prix n'y pose rien, ni du cache ni de la
 * mémoire, pour que sa complétion les retire (`poserMemoire`).
 */
function ecarteesDeLaMemoire(rows: readonly Listing[]): Set<string> {
  const out = new Set<string>();
  try {
    const memoire = memoireFiches();
    for (const row of rows) {
      if (row.source === "Airbnb" && trouee(row) && memoire.lire(cleListing(row))?.ecartee === true) out.add(row.id);
    }
  } catch {
    // Une mémoire illisible ne retire rien : `poserMemoire` ne lira rien non plus.
  }
  return out;
}

/**
 * Un gîte labellisé Gîtes de France que distribue une centrale ou une agence
 * (« Le Cerf ( 73G132308 ) », photos « …-73G34159.jpg ») : quand sa fiche ne
 * chiffre ni sa capacité ni ses chambres (Arêches, Les Saisies, 2 octobre
 * 2026), on lit la fiche officielle du même gîte, celle du widget Gîtes de
 * France, par son code. Elle ne comble que les trous, jamais la taxe de séjour
 * ni le loyer. Rend le nombre d'annonces comblées.
 */
async function repliGitesDeFrance(
  rows: readonly Listing[],
  until: number,
  compte: Compte,
): Promise<{ filled: number; notes: Note[] }> {
  const vrais = new Map<Listing, Listing>();
  for (const row of rows) {
    if (row.source === "Airbnb" || row.source === "Gîtes de France") continue;
    const sansChambres = row.bedrooms == null && (row.rooms == null || row.rooms <= 0);
    if (row.capacity != null && !sansChambres) continue;
    const code = gitesCodeOf(row.id) || gitesCodeOf(row.url) || gitesCodeOf(row.title) || gitesCodeOf(row.photo);
    if (!code) continue;
    const relais: Listing = {
      ...row,
      id: `gdf-${code}`,
      source: "Gîtes de France",
      url: gitesWidgetUrl(code),
      capacity: null,
      bedrooms: null,
      rooms: null,
    };
    vrais.set(relais, row);
  }
  if (vrais.size === 0 || Date.now() >= until) return { filled: 0, notes: [] };
  const bilan = await fillPool([...vrais.keys()], until, WORKERS, compte, { taxe: false });
  let filled = 0;
  const notes: Note[] = [];
  for (const { row: relais, lect } of bilan.ouvertes) {
    const row = vrais.get(relais);
    if (!row || !lect) continue;
    if (poserLecture(row, lect, "fiche Gîtes de France", { taxe: false })) {
      filled += 1;
      const n = noteDeLecture(row, lect);
      if (n) notes.push(n);
    }
  }
  if (vrais.size > 0) console.info(`[fiche] Gîtes de France par leur code : ${filled}/${vrais.size} annonce(s) comblée(s)`);
  return { filled, notes };
}

/* ---------- Fiches hors Airbnb : la suite en tâche de fond ---------- */

/** Par page (`cleUrl`) : le verdict de la dernière recherche, `true` si plusieurs annonces la portaient. */
const verdictsPages = new Map<string, boolean>();
const VERDICTS_MAX = 50_000;

function retenirVerdicts(listings: readonly Listing[], communes: ReadonlySet<string>): void {
  for (const l of listings) {
    const u = urlPropre(l);
    if (!u) continue;
    const cle = cleUrl(u);
    verdictsPages.delete(cle);
    verdictsPages.set(cle, communes.has(cle));
  }
  if (verdictsPages.size <= VERDICTS_MAX) return;
  for (const cle of verdictsPages.keys()) {
    if (verdictsPages.size <= VERDICTS_MAX * 0.75) break;
    verdictsPages.delete(cle);
  }
}

/** Les fiches hors Airbnb à lire, une fois chacune (clé de page). */
const suiteAutres = new Map<string, { row: Listing; essais: number }>();
let suiteAutresEnCours = false;
/** Une suite ne dure pas plus ; ce qui reste attend la recherche suivante. */
const SUITE_AUTRES_MAX_MS = 20 * 60_000;
/** Les fiches d'un tour de la suite, et le temps qu'il se donne. */
const LOT_AUTRES = 40;
const TOUR_AUTRES_MS = 90_000;

/**
 * Met en file les fiches hors Airbnb qu'une recherche n'a pas eu le temps
 * d'ouvrir : aux 2 Alpes, le 2 octobre 2026, 216 annonces de la centrale pour
 * 160 fiches au plus en 36 s, et rien ne lisait le reste ; elles gardaient la
 * capacité du titre et pas de chambres. La suite les lit par lots, au même
 * rythme par hôte que la recherche (`fillPool` : deux fiches en vol, une
 * seconde entre deux départs, pause après un refus, hôte laissé après cinq
 * fiches qui ne comblent rien), avec moins de lecteurs. Ce qu'elle lit va
 * dans le cache et la mémoire des fiches. Rend le nombre de fiches ajoutées.
 */
function lancerSuiteAutres(rows: readonly Listing[]): number {
  let ajoutees = 0;
  for (const row of rows) {
    const url = ficheUrlOf(row);
    if (!url || lectureEnCache(url)) continue;
    const k = cacheKey(url);
    if (suiteAutres.has(k)) continue;
    suiteAutres.set(k, { row: { ...row }, essais: 0 });
    ajoutees += 1;
  }
  if (!suiteAutresEnCours && suiteAutres.size > 0) void deroulerSuiteAutres();
  return ajoutees;
}

async function deroulerSuiteAutres(): Promise<void> {
  suiteAutresEnCours = true;
  const fin = Date.now() + SUITE_AUTRES_MAX_MS;
  const compte: Compte = { lues: 0 };
  let comblees = 0;
  try {
    while (suiteAutres.size > 0 && Date.now() < fin) {
      const lot: Array<[string, { row: Listing; essais: number }]> = [];
      const enPauseAvant = new Set(hotesEnPause());
      for (const [k, v] of suiteAutres) {
        const url = ficheUrlOf(v.row);
        if (!url || lectureEnCache(url)) {
          suiteAutres.delete(k);
          continue;
        }
        // Un hôte en pause après un refus attend son tour ; les autres passent.
        if (enPauseAvant.has(hoteDe(url) ?? "")) continue;
        lot.push([k, v]);
        if (lot.length >= LOT_AUTRES) break;
      }
      if (lot.length === 0) {
        // Plus que des hôtes en pause : on attend la fin de la première.
        if (suiteAutres.size > 0 && enPauseAvant.size > 0) {
          await new Promise((r) => setTimeout(r, 60_000));
          continue;
        }
        break;
      }
      const bilan = await fillPool(
        lot.map(([, v]) => v.row),
        Math.min(fin, Date.now() + TOUR_AUTRES_MS),
        4,
        compte,
      );
      comblees += bilan.filled;
      noter(bilan.ouvertes.map((o) => noteDeLecture(o.row, o.lect)).filter((n): n is Note => n != null));
      const ouvertes = new Set(bilan.ouvertes.map((o) => o.row.id));
      const laissees = new Set(bilan.laissees.map((r) => r.id));
      const enPause = new Set(hotesEnPause());
      for (const [k, v] of lot) {
        const hote = hoteDe(ficheUrlOf(v.row) ?? "");
        // Laissée parce que son hôte a refusé (429, 503) : elle attend la fin
        // de la pause, sans compter d'essai — Les Menuires, 2 octobre 2026.
        if (!ouvertes.has(v.row.id) && hote && enPause.has(hote)) continue;
        // Ouverte, ou laissée (refus durable, lecteur qui ne comble rien) :
        // elle a eu sa chance. Pas partie à temps : trois tours au plus.
        if (ouvertes.has(v.row.id) || laissees.has(v.row.id) || ++v.essais >= 3) suiteAutres.delete(k);
      }
      // Rien n'a bougé dans ce tour (tous les hôtes en pause) : on attend.
      if (bilan.ouvertes.length === 0) await new Promise((r) => setTimeout(r, 60_000));
    }
  } catch {
    /* une page illisible n'arrête pas la suite d'une autre recherche */
  } finally {
    suiteAutresEnCours = false;
    console.info(
      `[fiche] fiches hors Airbnb en tâche de fond : ${compte.lues} lues, ${comblees} annonce(s) complétée(s), ${suiteAutres.size} restante(s)`,
    );
  }
}

/** Pour les tests : la file des fiches hors Airbnb, et si elle tourne. */
export function etatSuiteAutres(): { file: number; enCours: boolean } {
  return { file: suiteAutres.size, enCours: suiteAutresEnCours };
}

/* ---------- Fiches Airbnb : la suite en tâche de fond ---------- */

/** Une suite ne dure pas plus ; ce qui reste attend la recherche suivante. */
const SUITE_AIRBNB_MAX_MS = 45 * 60_000;
/** Une fiche de la suite, attente du créneau comprise, ne dure pas plus. */
const FICHE_SUITE_MS = 60_000;
/** Pauses de coupe-circuit de suite qu'une suite attend, après quoi elle s'arrête. Une seule : la relecture de l'écran ne relance pas le catalogue. */
const REFUS_SUITE_MAX = 1;
/** Les annonces Airbnb dont la page reste à lire, une fois chacune (clé de page). */
const suiteAirbnb = new Map<string, Listing>();
let suiteAirbnbEnCours = false;
/** La dernière suite s'est arrêtée sur des refus d'Airbnb : ses pages non lues peuvent partir chez Apify. */
let suiteArreteeParRefus = false;

/**
 * Les pages Airbnb d'une recherche, toutes : la recherche ne les attend pas
 * (`fillFiches`).
 *
 * Une recherche n'a que quelques dizaines de secondes, et Airbnb pas plus de
 * dix-huit appels par minute : à Abondance, le 1er octobre 2026, 226 annonces
 * à GPS attendaient leur page et aucune n'était lue (« 0/226 »). La suite
 * les lit ensuite, une à une, 5 s au moins entre deux, en s'effaçant pendant
 * un relevé de liste
 * (`ROOMS_PROFOND`), par le même limiteur et
 * le même coupe-circuit : après un refus (429, 503, 403, page de blocage),
 * elle attend la pause demandée, puis reprend la même page ; une pause de
 * suite, elle s'arrête. La relecture de l'écran ne la relance pas. Un refus n'est pas un
 * échec de GPS : rien ne passe au repli. Ce qu'elle lit entre dans le cache des fiches, et la
 * recherche suivante le pose sans rien redemander. Aucune annonce n'est
 * retirée : ce que la page ne publie pas reste un trou, nommé au journal.
 * Rend le nombre d'annonces ajoutées à la file.
 */
/**
 * La station que l'écran Logements a demandée en dernier (`noterVue`, à
 * l'entrée de la recherche). Seules ses pages passent en tête de la suite :
 * une recherche abandonnée (station B, puis retour à A) finit souvent après
 * celle qu'on regarde, et ses pages passaient devant.
 */
let vueCourante: string | null = null;

/** L'écran Logements demande cette station : ses pages passeront en tête. */
export function noterVue(vue: string): void {
  vueCourante = vue;
}

function lancerSuiteAirbnb(rows: readonly Listing[], enTete = false): number {
  // Un refus d'Airbnb a arrêté le catalogue : la relecture ne le remet pas en
  // route. Une recherche nouvelle lève cet arrêt avant d'appeler, si le
  // coupe-circuit est fermé. L'annonce ouverte passe par `prioriserSuiteAirbnb`.
  if (suiteArreteeParRefus) return 0;
  let ajoutees = 0;
  const lot = new Map<string, Listing>();
  for (const row of rows) {
    const url = ficheUrlOf(row);
    // Déjà lue, ou coquille relue il y a peu : le cache le dit. Une page
    // refusée, elle, reste à lire : la suite attendra la pause.
    if (!url || lectureEnCache(url)) continue;
    const k = cacheKey(url);
    if (lot.has(k)) continue;
    if (!suiteAirbnb.has(k)) ajoutees += 1;
    lot.set(k, suiteAirbnb.get(k) ?? { ...row });
  }
  if (enTete) {
    // La recherche qu'on regarde passe devant ce qui reste d'une recherche
    // précédente (une autre station, d'autres dates), sans rien en retirer.
    const reste = [...suiteAirbnb].filter(([k]) => !lot.has(k));
    suiteAirbnb.clear();
    for (const [k, row] of [...lot, ...reste]) suiteAirbnb.set(k, row);
  } else {
    for (const [k, row] of lot) if (!suiteAirbnb.has(k)) suiteAirbnb.set(k, row);
  }
  if (!suiteAirbnbEnCours && suiteAirbnb.size > 0) void deroulerSuiteAirbnb();
  return ajoutees;
}

/** Les relevés de liste Airbnb en cours dans le processus (`pendantReleveAirbnb`). */
let relevesAirbnbEnCours = 0;
/** Génération du dernier relevé de liste : une suite de pages plus ancienne s'arrête. */
let generationReleve = 0;
/** Pagination de suite et fiches PDP lentes : la suite HTML leur laisse le limiteur. */
let pagesAirbnbEnCours = 0;
let pdpAirbnbEnCours = 0;
/** Jusqu'à quand un relevé attend son créneau (`demanderCreneauAirbnb`). */
let creneauDemandeJusqua = 0;

/**
 * Un relevé attend que le limiteur lui laisse ses places : l'écran Prix, avant
 * chaque station, attend qu'il ne reste que 6 appels Airbnb dans la minute
 * (`etatAirbnb`, 12 places). La suite, qui lit 10 pages par minute, tenait la
 * fenêtre au-dessus : la course attendait la fin de la file, jusqu'à trois
 * quarts d'heure. Tant que la demande est renouvelée (Prix la relit toutes les
 * 5 s), la suite s'efface ; la fenêtre se vide en une minute au plus, puis le
 * relevé la tient lui-même (`pendantReleveAirbnb`).
 */
export function demanderCreneauAirbnb(dureeMs = 15_000): void {
  creneauDemandeJusqua = Math.max(creneauDemandeJusqua, Date.now() + dureeMs);
}

/**
 * Tient la tâche de fond à l'écart pendant un relevé de liste Airbnb : elle ne
 * réserve plus de créneau tant qu'il court. Le relevé (worker Python, une
 * douzaine d'appels StaysSearch en 40 s) passe par le même limiteur, 18 appels
 * par minute glissante. Si la suite le remplissait à côté, le relevé
 * s'arrêtait à mi-chemin (« limiteur local ») : la moitié des annonces Airbnb
 * de la recherche manquait (simulation de la revue du 2 octobre 2026 : 6
 * pages sur 12 à 2 s d'écart, 10 à 11 à 6 s). Suspendue, la suite rend ses
 * créneaux au rythme où ils sortent de la fenêtre, un toutes les 3,3 s : de
 * quoi tenir les douze appels du relevé.
 */
export async function pendantReleveAirbnb<T>(f: () => Promise<T>): Promise<T> {
  relevesAirbnbEnCours += 1;
  generationReleve += 1;
  try {
    return await f();
  } finally {
    relevesAirbnbEnCours -= 1;
  }
}

/** Vrai pendant un relevé de liste, ou tant que l'écran Prix a demandé le créneau. */
export function airbnbListePrioritaire(): boolean {
  return relevesAirbnbEnCours > 0 || Date.now() < creneauDemandeJusqua;
}

/** Le relevé de liste en cours, pour qu'une suite plus ancienne s'arrête. */
export function generationReleveAirbnb(): number {
  return generationReleve;
}

/**
 * La pagination de suite tient le limiteur. Synchrone : le drapeau est posé
 * avant le premier await de l'appelant, donc avant que la suite HTML ne parte.
 */
export function tenirPagesAirbnb(): () => void {
  pagesAirbnbEnCours += 1;
  return () => {
    pagesAirbnbEnCours = Math.max(0, pagesAirbnbEnCours - 1);
  };
}

/** Les fiches PDP lentes, après la pagination. Même contrat que `tenirPagesAirbnb`. */
export function tenirPdpAirbnb(): () => void {
  pdpAirbnbEnCours += 1;
  return () => {
    pdpAirbnbEnCours = Math.max(0, pdpAirbnbEnCours - 1);
  };
}

/** Un refus de fiche ou de page : la suite HTML ne reprend pas le catalogue. */
export function marquerRefusFichesAirbnb(): void {
  suiteArreteeParRefus = true;
}

/** Les tranches de Prix qui lisent des fiches Airbnb en ce moment (`pendantTranchePrix`). */
let tranchesPrixEnCours = 0;
/** Jusqu'à quand la tranche suivante de la même course est attendue. */
let tranchePrixJusqua = 0;
/**
 * Entre deux tranches, Prix attend au plus 60 s le limiteur
 * (`ATTENTE_FICHES_MAX_MS` de `releve.ts`), puis fait l'aller-retour : la
 * course compte encore comme lisant 90 s après la fin d'une tranche.
 */
const TRAINE_PRIX_MS = 90_000;

/**
 * Une tranche de complétion de Prix lit des fiches Airbnb (worker PDP, puis
 * pages de repli) : tant qu'elle court, et un moment après, la suite et ces
 * pages se partagent le limiteur à l'ancien rythme (`ROOMS_PARTAGE`).
 */
export async function pendantTranchePrix<T>(f: () => Promise<T>): Promise<T> {
  tranchesPrixEnCours += 1;
  try {
    return await f();
  } finally {
    tranchesPrixEnCours -= 1;
    tranchePrixJusqua = Math.max(tranchePrixJusqua, Date.now() + TRAINE_PRIX_MS);
  }
}

/** Le rythme de la suite : l'ancien tant qu'une course Prix lit aussi. */
function rythmeSuite(): RythmeRooms {
  return tranchesPrixEnCours > 0 || Date.now() < tranchePrixJusqua ? ROOMS_PARTAGE : ROOMS_PROFOND;
}

/** Le rythme des pages de repli de Prix : l'ancien tant que la suite a des pages à lire. */
function rythmeRepliPrix(): RythmeRooms {
  return suiteAirbnbEnCours && suiteAirbnb.size > 0 ? ROOMS_PARTAGE : ROOMS_PROFOND;
}

async function deroulerSuiteAirbnb(opts?: { uneFiche?: boolean }): Promise<void> {
  const uneFiche = opts?.uneFiche === true;
  suiteAirbnbEnCours = true;
  // Une annonce ouverte pendant un arrêt ne rouvre pas le catalogue.
  if (!uneFiche) suiteArreteeParRefus = false;
  const fin = Date.now() + SUITE_AIRBNB_MAX_MS;
  const compte: Compte = { lues: 0 };
  const essais = new Map<string, number>();
  const dormir = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  let comblees = 0;
  let refus = 0;
  let arret: string | null = null;
  // Ce que la suite lit va aussi dans la mémoire des fiches, par paquets de
  // dix pages : une page lue ne se relit plus après un redémarrage.
  const notes: Note[] = [];
  const vider = () => noter(notes.splice(0));
  try {
    while (suiteAirbnb.size > 0) {
      if (!uneFiche && suiteArreteeParRefus) {
        arret = "refus Airbnb, la suite ne reprend pas le catalogue";
        break;
      }
      if (Date.now() >= fin) {
        arret = "échéance";
        break;
      }
      // Un relevé de liste, sa suite de pages ou les fiches PDP tiennent le
      // limiteur : la suite HTML attend, elle ne parle pas à Airbnb à côté.
      if (
        relevesAirbnbEnCours > 0 ||
        pagesAirbnbEnCours > 0 ||
        pdpAirbnbEnCours > 0 ||
        Date.now() < creneauDemandeJusqua
      ) {
        await dormir(1_000);
        continue;
      }
      // Un refus d'Airbnb (429, 503, 403, page de blocage) a ouvert le
      // coupe-circuit : la pause qu'il demande d'abord, puis la même page.
      // Ce n'est pas un échec de GPS : rien ne passe au repli.
      if (circuitOpen()) {
        refus += 1;
        if (refus > REFUS_SUITE_MAX) {
          arret = "refus répétés d'Airbnb, la recherche suivante reprendra";
          suiteArreteeParRefus = true;
          break;
        }
        await dormir(Math.min(airbnbCircuitRestantMs() + 5_000, fin - Date.now()));
        continue;
      }
      const [k, row] = suiteAirbnb.entries().next().value as [string, Listing];
      // Déjà lue depuis sa mise en file (une recherche, une annonce ouverte) :
      // le cache la tient, elle ne se redemande pas.
      const urlSuite = ficheUrlOf(row);
      if (urlSuite && lectureEnCache(urlSuite)) {
        suiteAirbnb.delete(k);
        if (uneFiche) break;
        continue;
      }
      // Lue entre-temps ailleurs, et gardée dans la mémoire des fiches (la
      // fiche PDP d'une course Prix) : rien à redemander.
      const copie: Listing = { ...row };
      const parMemoire = poserMemoire([copie]);
      if (!trouee(copie) || parMemoire.dejaLues.has(copie.id)) {
        suiteAirbnb.delete(k);
        if (uneFiche) break;
        continue;
      }
      const until = Math.min(fin, Date.now() + FICHE_SUITE_MS);
      const s = await fillAirbnbSeq([row], until, compte, rythmeSuite);
      for (const o of s.ouvertes) {
        const n = noteDeLecture(o.row, o.lect);
        if (n) notes.push(n);
      }
      if (notes.length >= 10) vider();
      if (s.arret === "refus" || s.arret === "coupe-circuit") {
        if (!circuitOpen()) await dormir(rythmeSuite().ecartMs);
        continue;
      }
      if (s.arret === "rythme") {
        // Le créneau n'est pas venu : la même page attend son tour.
        await dormir(Math.min(Math.max(s.attenteMs ?? 0, 1_000), FICHE_SUITE_MS));
        continue;
      }
      if (s.ouvertes.length === 0 && until >= fin) {
        // L'échéance de la suite l'a retenue, pas la page : elle reste en
        // file, en tête, pour la relance suivante (une recherche, la relecture
        // de l'écran). Comptée comme un essai, toute la file était jetée en
        // quelques millisecondes.
        arret = "échéance";
        break;
      }
      suiteAirbnb.delete(k);
      if (s.ouvertes.length > 0) {
        // Lue (pleine ou non), ou partie sans réponse : la page a eu sa chance.
        comblees += s.filled;
        refus = 0;
        if (uneFiche) break;
        continue;
      }
      // Pas partie à temps : en fin de file, trois essais au plus.
      // L'annonce ouverte n'entraîne pas le reste du catalogue.
      const n = (essais.get(k) ?? 0) + 1;
      if (n < 3 && !uneFiche) {
        essais.set(k, n);
        suiteAirbnb.set(k, row);
      }
      if (uneFiche) break;
    }
  } catch (err) {
    arret = err instanceof Error ? err.message : String(err);
  } finally {
    vider();
    suiteAirbnbEnCours = false;
    if (uneFiche) suiteArreteeParRefus = true;
    console.info(
      `[fiche] Airbnb en tâche de fond : ${compte.lues} pages lues, ${comblees} annonce(s) complétée(s), ${suiteAirbnb.size} restante(s)${arret ? `, arrêt : ${arret}` : ""}`,
    );
  }
}

/**
 * Met en tête de la file les annonces Airbnb qu'on vient d'ouvrir, et lance la
 * suite si elle ne tourne pas. Leur page part à la prochaine place de la
 * suite, au même rythme et derrière le même limiteur : juste après une
 * recherche, celui-ci est plein (la liste vient de consommer ses appels), et
 * une lecture tentée à côté était refusée par lui. Une page déjà lue (cache,
 * ou mémoire des fiches : `pdpLue`, avec un point) n'est pas remise en file.
 * Rend le nombre d'annonces mises en tête.
 */
export function prioriserSuiteAirbnb(rows: readonly Listing[]): number {
  const tete = new Map<string, Listing>();
  for (const row of rows) {
    // Lue et à point : ce qui manque, sa page ne le publie pas. Sans point, sa
    // page donne encore un point de repli (`poserMemoire`).
    if (row.source !== "Airbnb" || (row.pdpLue === true && plausible(row.lat, row.lon))) continue;
    const url = ficheUrlOf(row);
    if (!url || lectureEnCache(url)) continue;
    tete.set(cacheKey(url), { ...row });
  }
  if (tete.size === 0) return 0;
  // Après un refus, seule l'annonce ouverte part. Le catalogue reste arrêté.
  if (suiteArreteeParRefus) {
    suiteAirbnb.clear();
    for (const [k, row] of tete) suiteAirbnb.set(k, row);
    if (!suiteAirbnbEnCours) void deroulerSuiteAirbnb({ uneFiche: true });
    return tete.size;
  }
  const reste = [...suiteAirbnb].filter(([k]) => !tete.has(k));
  suiteAirbnb.clear();
  for (const [k, row] of [...tete, ...reste]) suiteAirbnb.set(k, row);
  if (!suiteAirbnbEnCours) void deroulerSuiteAirbnb();
  return tete.size;
}

/** Pour les tests : la file de la suite Airbnb, et si elle tourne. */
export function etatSuiteAirbnb(): { file: number; enCours: boolean } {
  return { file: suiteAirbnb.size, enCours: suiteAirbnbEnCours };
}

/**
 * Remplit capacité, chambres et GPS encore vides, via la page de fiche que
 * l'annonce porte déjà. Pour Gîtes, on aligne aussi le nom et l'URL
 * publics : un ancien slug n'est plus la fiche.
 *
 * `budgetMs` borne le réseau : un délai épuisé n'efface pas ce que le relevé
 * ou le cache ont déjà posé.
 */
/**
 * `pour: "prix"` : la passe d'un relevé de l'écran Prix. Elle ne met aucune
 * page Airbnb en tâche de fond (Prix lit ses candidates par leur fiche PDP,
 * `trancheProfonde`) : la suite lisait sinon jusqu'à 352 pages par station
 * pour 23 candidates, et tenait le limiteur pendant la course. Et la mémoire
 * ne la comble que de fiches PDP lues (`fichePdpSeule`).
 *
 * Ses pages `rooms/`, elle les lit au premier plan, comme avant, dans ce que
 * le limiteur laisse après la liste : sans elles, une station dont la fiche
 * PDP tombait en panne, était refusée ou périmée dès la première tranche
 * gardait jusqu'à deux fois moins d'annonces Airbnb, et la requête périmée
 * rendait chaque station deux à trois fois plus lente (revue du 2 octobre 2026).
 *
 * `vue` : la station de l'écran Logements qui demande (`noterVue`). Les pages
 * d'une recherche ne passent en tête de la suite que si l'écran regarde
 * encore cette station ; sinon elles vont en fin de file.
 *
 * `relecture` : la relecture de l'écran (`completerAnnonces`), sans budget.
 * Rien ne part d'elle. Ce qui reste à lire retourne en fin de file, sauf si
 * un refus a arrêté le catalogue : la relecture ne le relance pas.
 */
export type OptionsFiches = {
  pour?: "logements" | "prix";
  vue?: string;
  relecture?: boolean;
};

export async function fillFiches(
  listings: Listing[],
  budgetMs = BUDGET_MS,
  opts: OptionsFiches = {},
): Promise<number> {
  const prix = opts.pour === "prix";
  let filled = poserReleve(listings, RELEVE_2A);
  // Le contenu des fiches lues lors des recherches précédentes, sans réseau.
  const contenus = contenuFiches();
  for (const row of listings) poserContenu(row, contenus.lire(cleListing(row)));
  const until = Date.now() + Math.max(0, budgetMs);
  // Une page que portent plusieurs annonces n'est la fiche d'aucune : ni
  // ouverte, ni lue dans le cache pour l'une d'elles (`priseFiche.ts`).
  const communes = urlsPartagees(listings, urlPropre);
  // Une recherche voit la liste entière : son verdict sur chaque page (portée
  // par une annonce ou par plusieurs) vaut pour les relectures, qui n'en
  // renvoient qu'une partie et y verraient propre une page de résidence.
  if (budgetMs > 0) retenirVerdicts(listings, communes);
  else for (const l of listings) {
    const u = urlPropre(l);
    if (u && verdictsPages.get(cleUrl(u)) === true) communes.add(cleUrl(u));
  }
  // Le cache d'abord : il tient la lecture entière d'une page lue il y a
  // moins d'un jour (les lits de l'aperçu, le point de repli), la mémoire
  // seulement une partie. Pour l'écran Prix, pas une annonce que la mémoire
  // sait écartée (`poserMemoire`).
  let cached = 0;
  const servies = new Set<string>();
  const ecarteesPrix = prix ? ecarteesDeLaMemoire(listings) : new Set<string>();
  for (const row of listings) {
    if (row.source !== "Airbnb" || !trouee(row) || ecarteesPrix.has(row.id)) continue;
    const url = ficheUrlOf(row);
    if (!url || raisonDeLaisser(row, url, communes) === "URL commune") continue;
    const hit = lireCache(url);
    if (!hit) continue;
    if (poserLecture(row, hit)) filled += 1;
    cached += 1;
    servies.add(row.id);
  }
  // Ce que la mémoire des fiches sait déjà, sans réseau (`poserMemoire`). Elle
  // est rangée par annonce (`cleListing`), pas par URL : une page commune n'y
  // a jamais rien écrit pour l'une d'elles.
  const memoire = poserMemoire(listings, { fichePdpSeule: prix });
  filled += memoire.posees;
  if (memoire.posees) console.info(`[fiche] ${memoire.posees} annonce(s) comblée(s) par la mémoire des fiches`);
  const trous = listings.filter(
    (l) => trouee(l) && ficheUrlOf(l) && !memoire.dejaLues.has(l.id) && !memoire.ecartees.has(l.id),
  );
  const gites = listings.filter((l) => l.source === "Gîtes de France" && ficheUrlOf(l));
  const seen = new Set(trous);
  const need = [...trous, ...gites.filter((l) => !seen.has(l))].sort((a, b) => trousN(b) - trousN(a));
  if (need.length === 0) {
    if (filled) console.info(`[fiche] ${filled} du relevé`);
    filled += await fillAdresses(listings, until, communes);
    await verifierFichesGites(listings, until);
    return filled;
  }

  const todo: Listing[] = [];
  for (const row of need) {
    const url = ficheUrlOf(row);
    if (!url) continue;
    // Déjà posée depuis le cache, plus haut : la même lecture ne comble rien de plus.
    if (servies.has(row.id)) continue;
    const hit = raisonDeLaisser(row, url, communes) === "URL commune" ? null : lireCache(url);
    if (hit) {
      if (poserLecture(row, hit)) filled += 1;
      cached += 1;
      continue;
    }
    todo.push(row);
  }
  // Ce que la fiche ne peut pas combler n'est pas ouvert (voir priseFiche.ts),
  // et le tri précède la borne : un Airbnb complet à GPS, qu'on n'ouvre
  // jamais, ne prend plus la place d'une fiche qu'on ouvrirait.
  const { aLire, laissees } = choisirFiches(todo, ficheUrlOf, communes);
  const compte: Compte = { lues: 0 };
  const estAirbnb = (l: Listing) => l.source === "Airbnb" || estHoteAirbnb(ficheUrlOf(l) ?? "");
  // Les pages Airbnb partent toutes en tâche de fond, tout de suite, dans
  // l'ordre où l'écran les montre (`ordreDeLecture`) : la recherche ne les
  // attend plus. Mesuré le 2 octobre 2026 aux 2 Alpes : juste après la liste,
  // le limiteur partagé est plein (la liste vient d'y passer), et la lecture
  // au premier plan retenait la réponse 12 à 23 s pour 6 pages, que la suite
  // lit au même rythme. L'écran les reçoit par sa relecture.
  const airbnbALire = ordreDeLecture(aLire.filter(estAirbnb));
  // Une recherche met ses pages en file : en tête si l'écran regarde encore
  // sa station (`vue`). La relecture remet en fin de file ce qui manque, sans
  // relancer un catalogue arrêté sur un refus. Sans l'une ni l'autre, rien
  // n'est mis en file.
  const enTete = budgetMs > 0 && opts.vue != null && opts.vue === vueCourante;
  // Une recherche nouvelle reprend les pages si Airbnb n'est pas en pause.
  // La relecture, elle, ne relance pas un catalogue arrêté sur un refus.
  if (budgetMs > 0 && opts.relecture !== true && !circuitOpen()) suiteArreteeParRefus = false;
  const enFond =
    airbnbALire.length > 0 && !prix && (budgetMs > 0 || opts.relecture === true)
      ? lancerSuiteAirbnb(airbnbALire, enTete)
      : 0;
  const autres = aLire.filter((l) => !estAirbnb(l));
  // Prix : ses pages `rooms/` au premier plan, une à une, au rythme de
  // Logements, comme avant ; rien pendant une pause d'Airbnb.
  const airbnbPremier = prix && !circuitOpen() ? aLire.filter(estAirbnb).slice(0, MAX_FICHES) : [];
  if (prix && airbnbALire.length > 0 && airbnbPremier.length === 0) {
    console.warn(`[fiche] ${enPause()} — ${airbnbALire.length} fiches reportées`);
  }
  const ouvertesAutres = new Set<string>();
  if ((autres.length > 0 || airbnbPremier.length > 0) && Date.now() < until) {
    const [pool, seq] = await Promise.all([
      autres.length > 0 ? fillPool(autres.slice(0, MAX_FICHES), until, WORKERS, compte) : null,
      airbnbPremier.length > 0 ? fillAirbnbSeq(airbnbPremier, until, compte) : null,
    ]);
    for (const o of pool?.ouvertes ?? []) ouvertesAutres.add(o.row.id);
    filled += (pool?.filled ?? 0) + (seq?.filled ?? 0);
    // Ce que cette passe a lu va dans la mémoire des fiches.
    noter(
      [...(pool?.ouvertes ?? []), ...(seq?.ouvertes ?? [])]
        .map((o) => noteDeLecture(o.row, o.lect))
        .filter((n): n is Note => n != null),
    );
  }
  // Ce que la fiche de la centrale n'a pas donné, la fiche Gîtes de France du
  // même gîte, par son code.
  if (Date.now() < until) {
    const gdf = await repliGitesDeFrance(listings, until, compte);
    filled += gdf.filled;
    noter(gdf.notes);
  }
  // Logements : les fiches hors Airbnb que la passe n'a pas ouvertes (au-delà
  // de `MAX_FICHES`, ou passé son échéance) se lisent en tâche de fond ; la
  // relecture de l'écran les pose depuis le cache.
  // Une relecture ne met en file qu'une page qu'une recherche a vue portée par
  // cette seule annonce.
  const pagePropre = (l: Listing) => {
    const u = urlPropre(l);
    return u == null || verdictsPages.get(cleUrl(u)) === false;
  };
  const autresRestants = autres.filter(
    (l) => !ouvertesAutres.has(l.id) && trouee(l) && (budgetMs > 0 || pagePropre(l)),
  );
  const autresEnFond =
    !prix && (budgetMs > 0 || opts.relecture === true) && autresRestants.length > 0
      ? lancerSuiteAutres(autresRestants)
      : 0;
  // Logements : ce qu'Apify a rendu pour les annonces Airbnb encore
  // incomplètes, et la demande du reste, en tâche de fond.
  if (!prix) {
    try {
      const apify = completerParApify(
        listings,
        { sejour: sejourApify, fiche: ficheApify, demander: demanderApify },
        circuitOpen() || suiteArreteeParRefus,
      );
      filled += apify.posees;
      if (apify.posees || apify.demandees) {
        console.info(`[fiche] Apify : ${apify.posees} annonce(s) Airbnb complétée(s), ${apify.demandees} demandée(s)`);
      }
    } catch (err) {
      console.warn("[fiche] Apify :", (err as Error).message);
    }
  }
  if (memoire.dejaLues.size > 0) laissees.set(PAGE_DEJA_LUE, memoire.dejaLues.size);
  console.info(
    `[fiche] ${filled}/${need.length} fiches · ${cached} cache · ${compte.lues} lues${ecrireLaissees(laissees)}` +
      (enFond > 0 ? ` · ${enFond} Airbnb à lire en tâche de fond` : "") +
      (autresEnFond > 0 ? ` · ${autresEnFond} autres fiches à lire en tâche de fond` : ""),
  );
  filled += await fillAdresses(listings, until, communes);
  await verifierFichesGites(listings, until);
  return filled;
}

/* ---------- Écran Prix : complétion par tranches ---------- */

/**
 * Ce qu'une page lue par l'écran Prix a publié, pour sa mémoire : chaque valeur
 * avec sa source (sans elle, la mémoire tenait un texte pour un champ
 * structuré), et, pour Airbnb, le point seulement s'il est celui de la page
 * (`listingLat`, provenance `pdp`) : un repli (adresse géocodée, coordonnées
 * de la page) ne se mémorise pas (`repliGps.ts`).
 */
function courte(row: Listing, lect: LectureFiche | null): LectureCourte | null {
  if (!lect) return null;
  const point = plausible(lect.lat, lect.lon) && (row.source !== "Airbnb" || lect.gpsSource === "pdp");
  return {
    capacity: lect.capacity,
    bedrooms: lect.bedrooms,
    rooms: lect.rooms,
    lat: point ? lect.lat : null,
    lon: point ? lect.lon : null,
    capacitySource: lect.capacity != null ? (lect.capacitySource ?? "structured") : null,
    bedroomsSource: lect.bedrooms != null ? (lect.bedroomsSource ?? "structured") : null,
  };
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
      lectures[row.id] = courte(row, hit) as LectureCourte;
      continue;
    }
    todo.push(row);
  }
  const compte: Compte = { lues: 0 };
  const enPause = hotesEnPause();
  const rythme = new RythmeHotes({ refus: [...opts.hotesExclus, ...enPause], departs: departsHotes });
  const bilan = await fillPool(todo, opts.until, WORKERS, compte, { rythme, taxe: false });
  for (const { row, lect } of bilan.ouvertes) {
    essayees.push(row.id);
    const l = courte(row, lect);
    if (l) lectures[row.id] = l;
  }
  for (const row of bilan.laissees) laissees.add(row.id);
  // Les refus de cette tranche, pas les pauses déjà posées par une autre.
  const hotesRefus = rythme.refuses().filter((h) => !opts.hotesExclus.includes(h) && !enPause.includes(h));
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
 * Une à une, 5 s au moins entre deux (6 s quand la suite de Logements lit
 * aussi : `rythmeRepliPrix`), arrêt au premier refus.
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
      lectures[row.id] = courte(row, hit) as LectureCourte;
      continue;
    }
    todo.push(row);
  }
  const compte: Compte = { lues: 0 };
  const suite = await fillAirbnbSeq(todo, until, compte, rythmeRepliPrix);
  for (const { row, lect } of suite.ouvertes) {
    essayees.push(row.id);
    const l = courte(row, lect);
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
