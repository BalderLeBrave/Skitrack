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

import type { Listing } from "../listings.ts";
import { RELEVE_2A } from "../listings.ts";
import { gitesCodeOf, gitesWidgetUrl } from "../scrape/gitesGps.server.ts";
import { airbnbCircuitOpen, airbnbCircuitRestantMs, tripAirbnbCircuit } from "./airbnbCircuit.server.ts";
import { airbnbCookieHeader } from "./airbnbSession.server.ts";
import { noterBlocage, paceTaux } from "./taux.server.ts";
import { airbnbIdOf } from "./enrichir.ts";
import { PAUSE_MAX_MS, estHoteAirbnb, estStatutRalenti, htmlEstBloque, retryAfterMs } from "./http429.ts";
import { lectureFiche, type LectureFiche } from "./lectureFiche.ts";
import { poserReleve } from "./poserReleve.ts";
import { choisirFiches, disjoncteur, ecrireLaissees, hoteDe, plausible } from "./priseFiche.ts";
import { titreEstFichier, titreDepuisUrl } from "./titre.ts";
import {
  estPageGitesIntrouvable,
  marquerFicheIntrouvable,
  slugGites,
  slugUrlGites,
  urlGitesDepuisNom,
} from "./ficheGites.ts";

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

function cacheKey(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return `${CACHE_GEN}|${u.toString()}`;
  } catch {
    return `${CACHE_GEN}|${url}`;
  }
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

export function poserLecture(row: Listing, lect: LectureFiche, tag = "fiche"): boolean {
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
  if (
    lect.taxeSejour != null &&
    row.source === "Centrale" &&
    row.total > 0 &&
    !/taxe de s[ée]jour/i.test(row.proven)
  ) {
    row.total = Math.round((row.total + lect.taxeSejour) * 100) / 100;
    row.proven = `${row.proven} · taxe de séjour ${lect.taxeSejour} €`;
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

async function fillAdresses(listings: Listing[], until: number): Promise<number> {
  const cluster = clusterGps(listings);
  if (!cluster) return 0;
  let n = 0;
  for (const row of listings) {
    if (Date.now() >= until) break;
    if (plausible(row.lat, row.lon)) continue;
    const url = ficheUrlOf(row);
    if (!url) continue;
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
 * `limited` : l'hôte a refusé (429, 503, page de blocage). `rythme` : notre
 * limiteur (`taux`) a dit « trop tôt », et rien n'est parti — l'hôte n'a rien
 * refusé. `pause` : le coupe-circuit Airbnb s'est ouvert pendant l'attente du
 * créneau, et rien n'est parti.
 */
type FetchOutcome =
  | { kind: "html"; html: string }
  | { kind: "limited"; status: number; retryAfterMs: number }
  | { kind: "rythme"; waitMs: number }
  | { kind: "pause"; restantMs: number }
  | { kind: "empty" };

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

async function fetchHtml(url: string, until: number, compte: Compte): Promise<FetchOutcome> {
  if (Date.now() >= until) return { kind: "empty" };
  const host = hoteTaux(url);
  if (host) {
    const pause = await paceTaux(host, Math.min(5_000, Math.max(0, until - Date.now())));
    // Un refus arrivé pendant l'attente du créneau (Python, un autre relevé) :
    // la fiche ne part pas pendant la pause qu'il a ouverte.
    if (host === "airbnb" && airbnbCircuitOpen()) return { kind: "pause", restantMs: airbnbCircuitRestantMs() };
    if (pause > 0) return { kind: "rythme", waitMs: pause };
  }
  const ctrl = new AbortController();
  const wait = setTimeout(() => ctrl.abort(), Math.max(1_000, until - Date.now()));
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
    if (estStatutRalenti(res.status)) {
      // La pause demandée entière : le plafond de 12 s ne vaut que sur place.
      const pause = retryAfterMs(res.headers, 0, PAUSE_MAX_MS);
      if (host) noterBlocage(host, pause);
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
    return { kind: "empty" };
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

/**
 * Un hôte dont `SANS_PRISE_MAX` fiches trouées de suite ne comblent rien est
 * laissé pour la passe : sans cela, une page que le lecteur ne sait pas lire
 * coûtait jusqu'à `MAX_FICHES` requêtes à chaque recherche. Un ralentissement
 * (429, pause de `taux`) n'est pas compté : ce n'est pas le lecteur.
 */
async function fillPool(targets: Listing[], until: number, workers: number, compte: Compte): Promise<number> {
  let filled = 0;
  let cursor = 0;
  const n = Math.min(workers, targets.length);
  if (n <= 0) return 0;
  const disj = disjoncteur(SANS_PRISE_MAX);
  const laisses = new Map<string, number>();
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (;;) {
        if (Date.now() >= until) return;
        const i = cursor++;
        if (i >= targets.length) return;
        const row = targets[i];
        const url = ficheUrlOf(row);
        if (!url) continue;
        const hote = hoteDe(url) ?? url;
        // Une fiche Gîtes sans trou s'ouvre pour aligner le nom : elle ne
        // juge pas le lecteur, et le disjoncteur ne la coupe pas.
        const vise = trouee(row);
        if (vise && disj.coupe(hote)) {
          laisses.set(hote, (laisses.get(hote) ?? 0) + 1);
          continue;
        }
        let comble = false;
        try {
          const got = await fetchHtml(url, until, compte);
          if (got.kind === "limited" || got.kind === "rythme" || got.kind === "pause") continue;
          if (got.kind === "html") {
            const lect = lectureFiche(got.html);
            cache.set(cacheKey(url), { at: Date.now(), lect, hit: utile(lect) });
            comble = poserLecture(row, lect);
            if (comble) filled += 1;
          }
        } catch {
          /* fiche bloquée : les trous restent nommés */
        }
        if (vise && disj.noter(hote, comble)) {
          console.warn(`[fiche] ${hote} : ${SANS_PRISE_MAX} fiches de suite sans rien combler — hôte laissé`);
        }
      }
    }),
  );
  for (const [hote, k] of laisses) console.info(`[fiche] ${hote} : ${k} fiches non ouvertes`);
  return filled;
}

/**
 * Les fiches `rooms/`, une à une.
 *
 * Notre limiteur qui dit « trop tôt » arrête le lot sans toucher au
 * coupe-circuit partagé : celui-ci, le relevé Airbnb suivant le rapporte
 * « HTTP 429 » pendant 45 s, alors qu'Airbnb n'aurait rien refusé (même règle
 * que `RythmeLocal` côté Python). Un vrai refus ouvre le coupe-circuit et
 * arrête le lot, sans reprise : une seconde requête pendant la pause
 * qu'Airbnb vient de demander est le second 429 le plus probable.
 */
async function fillAirbnbSeq(targets: Listing[], until: number, compte: Compte): Promise<number> {
  let filled = 0;
  for (let i = 0; i < targets.length; i++) {
    if (Date.now() >= until) break;
    if (circuitOpen()) {
      console.warn(`[fiche] ${enPause()} — ${targets.length - i} fiches non lues`);
      break;
    }
    const row = targets[i];
    const url = ficheUrlOf(row);
    if (!url) continue;
    const got = await fetchHtml(url, until, compte);
    if (got.kind === "pause") {
      console.warn(`[fiche] ${enPause()} — ${targets.length - i} fiches non lues`);
      break;
    }
    if (got.kind === "rythme") {
      console.info(
        `[fiche] Airbnb : limiteur local, ${Math.round(got.waitMs / 1000)} s à attendre — ${targets.length - i} fiches remises`,
      );
      break;
    }
    if (got.kind === "limited") {
      cache.set(cacheKey(url), { at: Date.now(), lect: VIDE, hit: false, blocked: true });
      const holdMs = tripCircuit(got.retryAfterMs);
      console.warn(
        `[fiche] Airbnb HTTP ${got.status} — pause partagée ${Math.round(holdMs / 1000)} s, ${targets.length - i - 1} fiches non lues`,
      );
      break;
    }
    if (got.kind !== "html") continue;
    const lect = lectureFiche(got.html);
    cache.set(cacheKey(url), { at: Date.now(), lect, hit: utile(lect) });
    if (poserLecture(row, lect)) filled += 1;
    await new Promise((r) => setTimeout(r, 1_200));
  }
  return filled;
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
  const trous = listings.filter((l) => trouee(l) && ficheUrlOf(l));
  const gites = listings.filter((l) => l.source === "Gîtes de France" && ficheUrlOf(l));
  const seen = new Set(trous);
  const need = [...trous, ...gites.filter((l) => !seen.has(l))].sort((a, b) => trousN(b) - trousN(a));
  if (need.length === 0) {
    if (filled) console.info(`[fiche] ${filled} du relevé`);
    filled += await fillAdresses(listings, until);
    await verifierFichesGites(listings, until);
    return filled;
  }

  let cached = 0;
  const todo: Listing[] = [];
  for (const row of need) {
    const url = ficheUrlOf(row);
    if (!url) continue;
    const hit = lireCache(url);
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
  const { aLire, laissees } = choisirFiches(todo, ficheUrlOf);
  const compte: Compte = { lues: 0 };
  if (aLire.length > 0 && Date.now() < until) {
    const targets = aLire.slice(0, MAX_FICHES);
    // GPS déjà là : pas de rooms/, c'est ce fetch qui ouvre le 429. `choisirFiches` les a laissés.
    const airbnb = targets.filter((l) => l.source === "Airbnb" || estHoteAirbnb(ficheUrlOf(l) ?? ""));
    const autres = targets.filter((l) => !(l.source === "Airbnb" || estHoteAirbnb(ficheUrlOf(l) ?? "")));
    filled += await fillPool(autres, until, WORKERS, compte);
    if (airbnb.length && !circuitOpen()) {
      filled += await fillAirbnbSeq(airbnb, until, compte);
    } else if (airbnb.length && circuitOpen()) {
      console.warn(`[fiche] ${enPause()} — ${airbnb.length} fiches reportées`);
    }
  }
  console.info(
    `[fiche] ${filled}/${need.length} fiches · ${cached} cache · ${compte.lues} lues${ecrireLaissees(laissees)}`,
  );
  filled += await fillAdresses(listings, until);
  await verifierFichesGites(listings, until);
  return filled;
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
