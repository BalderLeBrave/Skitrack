/**
 * Seconde passe hors collecteur : le widget ITEA publie le total du
 * séjour (loyer + taxe) pour les dates demandées. Sans ce devis, un
 * montant Gîtes figé n'est pas publié.
 */

import type { Listing } from "../listings.ts";
import { dateIngenie, nuitsEntre } from "../scrape/centrales/moteurs/ingenie.ts";
import { poserRefus } from "../scrape/gardeHote.ts";
import { gitesCodeOf, gitesWidgetUrl, lieuFromGitesHtml, retenirLieuGites } from "../scrape/gitesGps.server.ts";
import { pointPublie } from "./priseFiche.ts";
import {
  devisItea,
  estDevisGitesLive,
  ficheItea,
  poserDevis,
  type StayDates,
} from "./tarif.ts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX = 40;
const WORKERS = 4;
const HIT_MS = 6 * 60 * 60 * 1000;
const PAUSE_MS = 250;

type CacheEntry = { at: number; html: string };
const widgetCache = new Map<string, CacheEntry>();
const devisCache = new Map<string, CacheEntry>();
/** Un appel de `fillDevis` : un refus d'ITEA arrête ses ouvriers. */
type Etat = { refus: boolean };

function cleDevis(code: string, stay: StayDates): string {
  return `${code.toUpperCase()}|${stay.checkIn}|${stay.checkOut}|${stay.guests}`;
}

/**
 * La page ITEA déjà lue pour ce code, sans requête. La suite Gîtes
 * (`scrape/gites.server.ts`) lit la même page : l'une et l'autre partagent ce
 * cache, et un gîte n'est pas demandé deux fois.
 */
export function widgetIteaEnCache(code: string): string | null {
  const hit = widgetCache.get(code.toUpperCase());
  return hit && Date.now() - hit.at < HIT_MS ? hit.html : null;
}

export function noterWidgetItea(code: string, html: string): void {
  if (html.length > 400) widgetCache.set(code.toUpperCase(), { at: Date.now(), html });
}

/** Le tableau de prix ITEA déjà lu pour ce séjour, sans requête. */
export function tabIteaEnCache(code: string, stay: StayDates): string | null {
  const hit = devisCache.get(cleDevis(code, stay));
  return hit && Date.now() - hit.at < HIT_MS ? hit.html : null;
}

export function noterTabItea(code: string, stay: StayDates, tab: string): void {
  if (tab.length > 40) devisCache.set(cleDevis(code, stay), { at: Date.now(), html: tab });
}

function besoinDevis(l: Listing): boolean {
  if (l.source !== "Gîtes de France") return false;
  if (estDevisGitesLive(l.proven) && l.total > 0) return false;
  return Boolean(gitesCodeOf(l.id) || gitesCodeOf(l.url));
}

async function fetchTexte(url: string, until: number, etat: Etat, init?: RequestInit): Promise<string> {
  if (etat.refus || Date.now() >= until) return "";
  const ctrl = new AbortController();
  const wait = setTimeout(() => ctrl.abort(), Math.max(1_000, until - Date.now()));
  try {
    const headers: Record<string, string> = {
      Accept: "text/html,application/json,*/*",
      "Accept-Language": "fr-FR,fr;q=0.9",
      "User-Agent": UA,
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    };
    const res = await fetch(url, { ...init, headers, redirect: "follow", signal: ctrl.signal });
    // Un refus (403, 429, 503) ferme ITEA pour tous, Python compris, et
    // arrête cet appel : les ouvriers ne relancent rien.
    if (poserRefus(url, res.status, res.headers)) {
      etat.refus = true;
      await res.body?.cancel().catch(() => undefined);
      return "";
    }
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(wait);
  }
}

async function widgetDe(code: string, until: number, etat: Etat): Promise<string> {
  const hit = widgetIteaEnCache(code);
  if (hit) return hit;
  const html = await fetchTexte(gitesWidgetUrl(code), until, etat);
  noterWidgetItea(code, html);
  // Le lieu de la même page, pour `fillGitesGps` : il ne la relira pas.
  if (html.length > 400) retenirLieuGites(code, lieuFromGitesHtml(html));
  return html;
}

async function postResa(
  body: URLSearchParams,
  referer: string,
  until: number,
  etat: Etat,
): Promise<string> {
  return fetchTexte("https://widget-fngf.itea.fr/lib_2/ajax/gereResa.php", until, etat, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://widget-fngf.itea.fr",
      Referer: referer,
    },
    body,
  });
}

async function tabDevis(code: string, stay: StayDates, until: number, etat: Etat): Promise<string> {
  const hit = tabIteaEnCache(code, stay);
  if (hit) return hit;

  const widget = await widgetDe(code, until, etat);
  const fiche = ficheItea(widget);
  if (!fiche) return "";

  const referer = gitesWidgetUrl(code);
  const base = {
    nbAdultes: String(stay.guests),
    dateDeb: dateIngenie(stay.checkIn),
    dateFin: dateIngenie(stay.checkOut),
    instance: fiche.instance,
    ident: fiche.ident,
    exercice: fiche.exercice,
    estpresentsurfiche: "true",
  };
  let exercice = fiche.exercice;
  const exoRaw = await postResa(new URLSearchParams({ ...base, type: "getExerciceByDateFin" }), referer, until, etat);
  try {
    const exo = JSON.parse(exoRaw) as { exercice?: string };
    if (exo.exercice) exercice = String(exo.exercice);
  } catch {
    /* HTML */
  }
  const tab = await postResa(
    new URLSearchParams({ ...base, exercice, type: "getHTMLTabPrixFormulesSejour" }),
    referer,
    until,
    etat,
  );
  noterTabItea(code, stay, tab);
  return tab;
}

/**
 * Le GPS publié par la page ITEA déjà lue pour le devis, sans autre requête.
 * Il remplace un point triangulé (la carte de recherche), jamais un GPS de
 * fiche.
 */
function poserGpsItea(row: Listing, code: string): void {
  if (pointPublie(row)) return;
  const page = widgetIteaEnCache(code);
  if (!page) return;
  const lieu = lieuFromGitesHtml(page);
  if (lieu.lat == null || lieu.lon == null) return;
  row.lat = lieu.lat;
  row.lon = lieu.lon;
  row.gpsSource = undefined;
  if (!row.locality && lieu.locality) row.locality = lieu.locality;
  if (!/GPS ITEA/.test(row.proven)) row.proven = `${row.proven} · GPS ITEA`;
}

/**
 * Pour chaque Gîte sans devis live, lit le total publié par ITEA aux
 * dates demandées. Un échec laisse le prix non publié. Un refus d'ITEA
 * arrête l'appel.
 */
export async function fillDevis(listings: Listing[], stay: StayDates, budgetMs: number): Promise<number> {
  if (!(nuitsEntre(stay.checkIn, stay.checkOut) > 0)) return 0;
  const until = Date.now() + Math.max(0, budgetMs);
  const cibles = listings.filter(besoinDevis).slice(0, MAX);
  if (cibles.length === 0 || Date.now() >= until) return 0;

  let n = 0;
  let cursor = 0;
  const etat: Etat = { refus: false };
  const workers = Math.min(WORKERS, cibles.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        if (etat.refus || Date.now() >= until) return;
        const i = cursor++;
        if (i >= cibles.length) return;
        const row = cibles[i];
        const code = gitesCodeOf(row.id) || gitesCodeOf(row.url);
        if (!code) continue;
        try {
          const tab = await tabDevis(code, stay, until, etat);
          const devis = devisItea(tab);
          if (!devis) continue;
          const next = poserDevis(row, devis, stay);
          row.total = next.total;
          row.proven = next.proven;
          row.priceLabel = next.priceLabel;
          row.pricedCheckIn = next.pricedCheckIn;
          row.pricedCheckOut = next.pricedCheckOut;
          row.scannedAt = next.scannedAt;
          poserGpsItea(row, code);
          n += 1;
        } catch {
          /* widget injoignable : le prix reste non publié */
        }
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
    }),
  );
  if (n) console.info(`[devis] ${n} totaux ITEA live (${dateIngenie(stay.checkIn)}→${dateIngenie(stay.checkOut)})`);
  return n;
}
