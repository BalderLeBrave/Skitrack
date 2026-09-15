/**
 * Seconde passe hors collecteur : le panier de la centrale publie le loyer
 * et la taxe de séjour. On les lit, on les additionne. Sans ce relevé, le
 * total reste le loyer, marqué hors frais.
 */

import type { Listing } from "../listings.ts";
import { cidDepuisPage, dateIngenie, nuitsEntre, urlIngenie } from "../scrape/centrales/moteurs/ingenie.ts";
import {
  cidDepuisUrl,
  moteurIngenie,
  poserRecap,
  prestationIngenie,
  tarifRecap,
} from "./tarif.ts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX = 40;
const WORKERS = 5;
const HIT_MS = 6 * 60 * 60 * 1000;

export type StayTarif = { checkIn: string; checkOut: string; guests: number };

type Session = { cookie: string; cid: string };

const recapCache = new Map<string, { at: number; html: string }>();
const cidCache = new Map<string, { at: number; cid: string | null }>();

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function mixCookie(current: string, setCookie: string[]): string {
  const map = new Map<string, string>();
  for (const part of current.split(";")) {
    const t = part.trim();
    const i = t.indexOf("=");
    if (i > 0) map.set(t.slice(0, i), t.slice(i + 1));
  }
  for (const sc of setCookie) {
    const nv = sc.split(";")[0] ?? "";
    const i = nv.indexOf("=");
    if (i > 0) map.set(nv.slice(0, i).trim(), nv.slice(i + 1).trim());
  }
  return [...map].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function fetchTexte(
  url: string,
  cookie: string,
  until: number,
): Promise<{ html: string; cookie: string }> {
  if (Date.now() >= until) return { html: "", cookie };
  const ctrl = new AbortController();
  const wait = setTimeout(() => ctrl.abort(), Math.max(1_000, until - Date.now()));
  try {
    const headers: Record<string, string> = {
      Accept: "text/html,application/json",
      "Accept-Language": "fr-FR,fr;q=0.9",
      "User-Agent": UA,
    };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(url, { headers, redirect: "follow", signal: ctrl.signal });
    const set = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    const next = mixCookie(cookie, set);
    if (!res.ok) return { html: "", cookie: next };
    const html = await res.text();
    return { html, cookie: next };
  } catch {
    return { html: "", cookie };
  } finally {
    clearTimeout(wait);
  }
}

async function cidDe(origin: string, until: number): Promise<string | null> {
  const hit = cidCache.get(origin);
  if (hit && Date.now() - hit.at < HIT_MS) return hit.cid;
  const { html } = await fetchTexte(`${origin}/`, "", until);
  const cid = cidDepuisPage(html);
  cidCache.set(origin, { at: Date.now(), cid });
  return cid;
}

async function sessionDe(origin: string, stay: StayTarif, cidHint: string | null, until: number): Promise<Session | null> {
  const cid = cidHint ?? (await cidDe(origin, until));
  if (!cid) return null;
  const url = urlIngenie(origin, cid, stay);
  const { html, cookie } = await fetchTexte(url, "", until);
  if (!html || html.length < 400) return null;
  return { cookie, cid };
}

function prestationDe(row: Listing): string | null {
  return prestationIngenie(row.id) ?? prestationIngenie(row.platformId ?? "") ?? prestationIngenie(row.url ?? "");
}

async function recapDe(
  origin: string,
  sess: Session,
  prestation: string,
  stay: StayTarif,
  until: number,
): Promise<string> {
  const debut = stay.checkIn.replace(/-/g, "");
  const fin = stay.checkOut.replace(/-/g, "");
  const key = `${origin}|${prestation}|${debut}|${fin}|${stay.guests}`;
  const hit = recapCache.get(key);
  if (hit && Date.now() - hit.at < HIT_MS) return hit.html;
  const u = new URL(`${origin}/booking`);
  u.searchParams.set("action", "detailTarifsPrestationAjax");
  u.searchParams.set("cid", sess.cid);
  u.searchParams.set("prestation", prestation);
  u.searchParams.set("new_dateDebut", debut);
  u.searchParams.set("new_dateFin", fin);
  const { html } = await fetchTexte(u.toString(), sess.cookie, until);
  if (html.length > 200) recapCache.set(key, { at: Date.now(), html });
  return html;
}

/**
 * Pour chaque loyer de centrale, lit le panier daté et y ajoute la taxe
 * de séjour publiée. Un échec laisse le loyer, hors frais.
 */
export async function fillTarifs(listings: Listing[], stay: StayTarif, budgetMs: number): Promise<number> {
  if (!(nuitsEntre(stay.checkIn, stay.checkOut) > 0)) return 0;
  const until = Date.now() + Math.max(0, budgetMs);
  const cibles = listings.filter((l) => l.source === "Centrale" && l.total > 0 && l.url && !/taxe de s[ée]jour/i.test(l.proven));
  if (cibles.length === 0 || Date.now() >= until) return 0;

  const parOrigine = new Map<string, Listing[]>();
  for (const row of cibles.slice(0, MAX)) {
    const origin = originOf(row.url ?? "");
    if (!origin) continue;
    const lot = parOrigine.get(origin) ?? [];
    lot.push(row);
    parOrigine.set(origin, lot);
  }

  let n = 0;
  for (const [origin, lot] of parOrigine) {
    if (Date.now() >= until) break;
    const cidHint = lot.map((l) => cidDepuisUrl(l.url ?? "")).find(Boolean) ?? null;
    const sess = await sessionDe(origin, stay, cidHint, until);
    if (!sess) continue;

    let cursor = 0;
    const workers = Math.min(WORKERS, lot.length);
    await Promise.all(
      Array.from({ length: workers }, async () => {
        for (;;) {
          if (Date.now() >= until) return;
          const i = cursor++;
          if (i >= lot.length) return;
          const row = lot[i];
          let prestation = prestationDe(row);
          if (!prestation && row.url) {
            const fiche = await fetchTexte(row.url, sess.cookie, until);
            const mot = moteurIngenie(fiche.html);
            if (mot) {
              prestation = mot.prestation;
              if (mot.cid && mot.cid !== sess.cid) sess.cid = mot.cid;
            }
          }
          if (!prestation) continue;
          const html = await recapDe(origin, sess, prestation, stay, until);
          const recap = tarifRecap(html);
          if (!recap || !(recap.taxeSejour > 0)) continue;
          const next = poserRecap(row, recap);
          row.total = next.total;
          row.proven = next.proven;
          row.priceLabel = next.priceLabel;
          n += 1;
        }
      }),
    );
  }
  if (n) console.info(`[tarif] ${n} totaux avec taxe de séjour (${dateIngenie(stay.checkIn)})`);
  return n;
}
