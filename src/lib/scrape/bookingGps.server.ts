import type { Page } from "playwright";
import type { Listing } from "@/lib/listings";
import { garderLectures, reposerGardees, type LectureAGarder } from "@/lib/stay/contenuFiches.server";
import { noterPageTentee, type PageBooking } from "@/lib/stay/fichesBooking.server";
import { cleListing } from "@/lib/stay/poserReleve";
import { allowsPath } from "./robots";
import { robotsAutorise } from "./centrales/robots.ts";
import { ficheDepuisPageBooking } from "./bookingFiche";
import { poserRefus, respecterCadence } from "./gardeHote.ts";
import { texteRobots, UA_AGENT } from "./politesse.ts";

/**
 * Pages établissement Booking.com. Ne touche ni aux prix ni aux titres.
 *
 * - `fillBookingGps` : pendant le relevé, le GPS des annonces qui n'en ont
 *   pas ; la page chargée donne aussi sa fiche (`bookingFiche.ts`), gardée
 *   trente jours. Une fiche déjà gardée revient d'abord, sans requête.
 * - `lireFicheBooking` : après la réponse et la suite de pages, la fiche
 *   seule, une page à la fois, pour la lecture de fond
 *   (`stay/fichesBooking.server.ts`), qui choisit les pages et s'arrête au
 *   premier défi ou refus.
 */

const MAX_FICHES = 12;
/** Une page à la fois : quatre navigateurs en parallèle essuyaient le défi. */
const WORKERS = 1;
const BUDGET_MS = 14_000;

function plausible(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function hotelPageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (!/(^|\.)booking\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/hotel\/[a-z]{2}\/[^/]+/i);
    if (!m) return null;
    u.hostname = "www.booking.com";
    u.pathname = m[0].replace(/\/$/, "");
    if (!/\.html$/i.test(u.pathname)) u.pathname += ".html";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

export function atlasFromHtml(html: string): { lat: number; lon: number } | null {
  const atlas = html.match(/data-atlas-latlng="\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*"/i);
  if (atlas) {
    const lat = Number(atlas[1]);
    const lon = Number(atlas[2]);
    if (plausible(lat, lon)) return { lat, lon };
  }
  const geo = html.match(
    /"geo"\s*:\s*\{[^}]{0,240}"latitude"\s*:\s*"?(-?\d+\.\d+)"?[^}]{0,80}"longitude"\s*:\s*"?(-?\d+\.\d+)"?/i,
  );
  if (geo) {
    const lat = Number(geo[1]);
    const lon = Number(geo[2]);
    if (plausible(lat, lon)) return { lat, lon };
  }
  const bmap = html.match(
    /b_map_center_latitude["'\s:=]+(-?\d+\.\d+)[\s\S]{0,160}b_map_center_longitude["'\s:=]+(-?\d+\.\d+)/i,
  );
  if (bmap) {
    const lat = Number(bmap[1]);
    const lon = Number(bmap[2]);
    if (plausible(lat, lon)) return { lat, lon };
  }
  return null;
}

/**
 * `garde` : le limiteur local ou une pause de refus a tenu la page, rien n'est
 * parti ; son `statut` 429 n'est pas une réponse de Booking.
 */
type PageLue = { gps: { lat: number; lon: number } | null; html: string | null; statut: number | null; garde?: string };

async function gpsOnPage(page: Page, url: string, until: number, carte = true): Promise<PageLue> {
  if (Date.now() >= until) return { gps: null, html: null, statut: null };
  const garde = await respecterCadence(url, Math.max(0, Math.min(5_000, until - Date.now() - 1_000)));
  if (garde) return { gps: null, html: null, statut: 429, garde };
  const rep = await page.goto(url, { waitUntil: "domcontentloaded", timeout: Math.max(3_000, until - Date.now()) });
  const statut = rep?.status() ?? null;
  if (statut === 403 || statut === 429 || statut === 503) poserRefus(url, statut);
  if (statut === 202 || statut === 403 || statut === 429 || statut === 503) return { gps: null, html: null, statut };
  // Le HTML de la page chargée : pour la fiche, et pour le GPS si la carte
  // ne le donne pas. Aucune navigation de plus.
  const html = await page.content().catch(() => null);
  // Venue pour la fiche seule (`carte` faux) : la carte ne s'attend pas.
  if (!carte) return { gps: html ? atlasFromHtml(html) : null, html, statut };
  const left = Math.max(1_000, until - Date.now());
  const atlas = await page
    .locator("[data-atlas-latlng]")
    .first()
    .getAttribute("data-atlas-latlng", { timeout: Math.min(8_000, left) })
    .catch(() => null);
  if (atlas && atlas.includes(",")) {
    const [a, b] = atlas.split(",");
    const lat = Number(a);
    const lon = Number(b);
    if (plausible(lat, lon)) return { gps: { lat, lon }, html, statut };
  }
  return { gps: html ? atlasFromHtml(html) : null, html, statut };
}

/** Ce que le remplissage a fait, et s'il s'est arrêté sur un défi (202) ou un refus (403, 429, 503). */
export type BilanGpsBooking = { remplies: number; arret?: "defi" | "refus" };

/**
 * Remplit lat/lon des fiches Booking encore vides, via la carte de la fiche Booking.com.
 * Les totaux, titres et URLs restent ceux du relevé déjà fait. Les fiches déjà
 * gardées se posent d'abord, sans requête (`reposerGardees`) ; celles que les
 * pages ouvertes donnent se gardent, en une écriture (`garderLectures`).
 */
export async function fillBookingGps(host: Page, listings: Listing[]): Promise<BilanGpsBooking> {
  reposerGardees(listings.filter((l) => l.source === "Booking"));
  const need = listings.filter(
    (l) => l.source === "Booking" && !plausible(l.lat, l.lon) && hotelPageUrl(l.url),
  );
  if (need.length === 0) return { remplies: 0 };
  await allowsPath("https://www.booking.com", "/");
  const targets = need.slice(0, MAX_FICHES);
  const until = Date.now() + BUDGET_MS;
  const ctx = host.context();
  const pages: Page[] = [];
  const workers = Math.min(WORKERS, targets.length);
  const lues: LectureAGarder[] = [];
  let arret: BilanGpsBooking["arret"];
  try {
    for (let i = 0; i < workers; i += 1) {
      const p = await ctx.newPage();
      p.setDefaultTimeout(10_000);
      pages.push(p);
    }
    let cursor = 0;
    let filled = 0;
    await Promise.all(
      pages.map(async (p) => {
        for (;;) {
          if (Date.now() >= until) return;
          const i = cursor++;
          if (i >= targets.length) return;
          const row = targets[i];
          const url = hotelPageUrl(row.url);
          if (!url) continue;
          try {
            const { gps, html, statut, garde } = await gpsOnPage(p, url, until);
            if (statut != null && !garde) noterPageTentee(url);
            const fiche = ficheDepuisPageBooking(row, html, statut);
            // Un défi ne remplace pas une fiche lue (gardée, reposée plus haut).
            if (fiche && (fiche.indisponible !== true || row.fiche == null)) row.fiche = fiche;
            if (statut === 200 && fiche && fiche.indisponible !== true) lues.push({ cle: cleListing(row), fiche });
            if (statut === 202 || statut === 403 || statut === 429 || statut === 503) {
              if (!garde) arret = statut === 202 ? "defi" : "refus";
              return;
            }
            if (!gps) continue;
            row.lat = gps.lat;
            row.lon = gps.lon;
            if (!/GPS Booking/.test(row.proven)) {
              row.proven = `${row.proven} · GPS Booking`;
            }
            filled += 1;
          } catch {
            /* fiche bloquée : on laisse non mesurée */
          }
        }
      }),
    );
    console.info(`[booking-gps] ${filled}/${need.length} fiches`);
    return { remplies: filled, ...(arret ? { arret } : {}) };
  } finally {
    if (lues.length) garderLectures(lues);
    await Promise.all(pages.map((p) => p.close().catch(() => undefined)));
  }
}

/** Une page de la lecture de fond, chargement compris : une page lente n'arrête pas la suite. */
const FICHE_MS = 20_000;

/**
 * robots.txt de Booking pour cette page, lu et respecté : la lecture de fond
 * ajoute des pages que personne n'attend, elle ne part que là où le fichier
 * le permet. `null` : permis ; sinon la règle, ou « robots.txt illisible »
 * (on ne sait pas : on ne part pas).
 */
async function interditParRobots(url: string): Promise<string | null> {
  try {
    const u = new URL(url);
    const v = robotsAutorise(await texteRobots(u.origin), u.pathname + u.search, UA_AGENT);
    return v.autorise === true ? null : v.regle;
  } catch {
    return "URL illisible";
  }
}

/**
 * La fiche d'une annonce, pour la lecture de fond (`stay/fichesBooking.server.ts`) :
 * robots.txt d'abord, puis la page par `gpsOnPage` (cadence du journal
 * « booking », refus posé sur 403, 429, 503), sans attendre la carte, lue
 * par `ficheDepuisPageBooking`.
 * L'onglet quitte ensuite la page : ses scripts ne tournent pas pendant la
 * pause. Ne réessaie rien : c'est l'appelant qui s'arrête.
 */
export async function lireFicheBooking(page: Page, row: Listing, url: string): Promise<PageBooking> {
  const interdit = await interditParRobots(url);
  if (interdit) return { statut: null, interdit };
  try {
    const { html, statut, garde } = await gpsOnPage(page, url, Date.now() + FICHE_MS, false);
    if (garde) return { statut: null, attente: garde };
    const fiche = ficheDepuisPageBooking(row, html, statut);
    return { statut, ...(fiche ? { fiche } : {}) };
  } catch {
    // Délai, onglet fermé : partie, sans réponse lisible.
    return { statut: null };
  } finally {
    await page.goto("about:blank").catch(() => undefined);
  }
}
