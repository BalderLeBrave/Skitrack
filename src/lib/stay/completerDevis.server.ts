/**
 * Seconde passe hors collecteur : le widget ITEA publie le total du
 * séjour (loyer + taxe) pour les dates demandées. Sans ce devis, un
 * montant Gîtes figé n'est pas publié.
 */

import type { Listing } from "../listings.ts";
import { dateIngenie, nuitsEntre } from "../scrape/centrales/moteurs/ingenie.ts";
import { gitesCodeOf, gitesWidgetUrl } from "../scrape/gitesGps.server.ts";
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

function besoinDevis(l: Listing): boolean {
  if (l.source !== "Gîtes de France") return false;
  if (estDevisGitesLive(l.proven) && l.total > 0) return false;
  return Boolean(gitesCodeOf(l.id) || gitesCodeOf(l.url));
}

async function fetchTexte(url: string, until: number, init?: RequestInit): Promise<string> {
  if (Date.now() >= until) return "";
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
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(wait);
  }
}

async function widgetDe(code: string, until: number): Promise<string> {
  const hit = widgetCache.get(code);
  if (hit && Date.now() - hit.at < HIT_MS) return hit.html;
  const html = await fetchTexte(gitesWidgetUrl(code), until);
  if (html.length > 400) widgetCache.set(code, { at: Date.now(), html });
  return html;
}

async function postResa(
  body: URLSearchParams,
  referer: string,
  until: number,
): Promise<string> {
  return fetchTexte("https://widget-fngf.itea.fr/lib_2/ajax/gereResa.php", until, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://widget-fngf.itea.fr",
      Referer: referer,
    },
    body,
  });
}

async function tabDevis(code: string, stay: StayDates, until: number): Promise<string> {
  const key = `${code}|${stay.checkIn}|${stay.checkOut}|${stay.guests}`;
  const hit = devisCache.get(key);
  if (hit && Date.now() - hit.at < HIT_MS) return hit.html;

  const widget = await widgetDe(code, until);
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
  const exoRaw = await postResa(new URLSearchParams({ ...base, type: "getExerciceByDateFin" }), referer, until);
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
  );
  if (tab.length > 40) devisCache.set(key, { at: Date.now(), html: tab });
  return tab;
}

/**
 * Pour chaque Gîte sans devis live, lit le total publié par ITEA aux
 * dates demandées. Un échec laisse le prix non publié.
 */
export async function fillDevis(listings: Listing[], stay: StayDates, budgetMs: number): Promise<number> {
  if (!(nuitsEntre(stay.checkIn, stay.checkOut) > 0)) return 0;
  const until = Date.now() + Math.max(0, budgetMs);
  const cibles = listings.filter(besoinDevis).slice(0, MAX);
  if (cibles.length === 0 || Date.now() >= until) return 0;

  let n = 0;
  let cursor = 0;
  const workers = Math.min(WORKERS, cibles.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        if (Date.now() >= until) return;
        const i = cursor++;
        if (i >= cibles.length) return;
        const row = cibles[i];
        const code = gitesCodeOf(row.id) || gitesCodeOf(row.url);
        if (!code) continue;
        try {
          const tab = await tabDevis(code, stay, until);
          const devis = devisItea(tab);
          if (!devis) continue;
          const next = poserDevis(row, devis, stay);
          row.total = next.total;
          row.proven = next.proven;
          row.priceLabel = next.priceLabel;
          row.pricedCheckIn = next.pricedCheckIn;
          row.pricedCheckOut = next.pricedCheckOut;
          row.scannedAt = next.scannedAt;
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
