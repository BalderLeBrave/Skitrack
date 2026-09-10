/** Lecture d’une fiche Skiinfo France. Rien n’est inventé si le bloc manque. */

import type { SkiinfoPct, SkiinfoRow } from "./skiinfo.ts";

export type SkiinfoParsed = {
  n: number | null;
  km: number | null;
  longestKm: number | null;
  pct: SkiinfoPct;
  minM: number | null;
  maxM: number | null;
  photoUrl: string | null;
  country: string | null;
  hasMix: boolean;
};

function afterLabel(html: string, label: string): string | null {
  const re = new RegExp(`${label}</span></div><span[^>]*>([^<]+)`, "i");
  const m = re.exec(html);
  return m?.[1]?.replace(/\u00a0/g, " ").trim() ?? null;
}

function number(raw: string | null): number | null {
  if (!raw) return null;
  const m = /(\d+(?:[.,]\d+)?)/.exec(raw.replace(/\s/g, "").replace(",", "."));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function pct(html: string, label: string): number {
  const n = number(afterLabel(html, label));
  return n != null ? Math.round(n) : 0;
}

function ftToM(v: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === "ft" || u === "feet") return Math.round(v * 0.3048);
  return Math.round(v);
}

function walk(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  out.push(rec);
  if (Array.isArray(rec["@graph"])) walk(rec["@graph"], out);
  for (const v of Object.values(rec)) {
    if (v && typeof v === "object") walk(v, out);
  }
}

function fromJsonLd(html: string): { minM: number | null; maxM: number | null; country: string | null } {
  let minM: number | null = null;
  let maxM: number | null = null;
  let country: string | null = null;
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const nodes: Record<string, unknown>[] = [];
    walk(data, nodes);
    for (const node of nodes) {
      if (node["@type"] === "SkiResort" || node["@type"] === "SportsActivityLocation") {
        const addr = node.address;
        if (addr && typeof addr === "object") {
          const cc = (addr as { addressCountry?: string }).addressCountry;
          if (typeof cc === "string") country = cc;
        }
      }
      const props = node.additionalProperty;
      if (!Array.isArray(props)) continue;
      for (const prop of props) {
        if (!prop || typeof prop !== "object") continue;
        const p = prop as { name?: string; value?: unknown; unitText?: string };
        const name = (p.name ?? "").toLowerCase();
        const val = typeof p.value === "number" ? p.value : Number(p.value);
        if (!Number.isFinite(val)) continue;
        const unit = p.unitText ?? "";
        if (name.includes("summit")) maxM = ftToM(val, unit);
        else if (name.includes("base")) minM = ftToM(val, unit);
      }
    }
  }
  return { minM, maxM, country };
}

function photoUrl(html: string): string | null {
  const og = /property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html)
    ?? /content=["']([^"']+)["'][^>]*property=["']og:image["']/i.exec(html);
  let url = og?.[1]?.replace(/&/g, "&") ?? null;
  if (url?.includes("resort_header")) url = null;
  if (url?.includes("cdn.bfldr.com")) return url;
  const gallery = /https:\/\/cdn\.bfldr\.com\/[^"\\\s]+/.exec(html);
  if (!gallery) return url;
  const g = gallery[0].replace(/\\u0026/g, "&").split("&")[0] ?? gallery[0];
  if (g.includes("resort_header")) return url;
  return g;
}

export function parseSkiinfoPage(html: string): SkiinfoParsed {
  const n = number(afterLabel(html, "Nombre total de pistes"));
  const km = number(afterLabel(html, "Domaine skiable"));
  const longestKm = number(afterLabel(html, "Piste la plus longue"));
  const green = pct(html, "Pistes vertes");
  const blue = pct(html, "Pistes bleues");
  const red = pct(html, "Pistes rouges");
  const black = pct(html, "Pistes noires");
  const hasMix = n != null && n > 0 && green + blue + red + black > 0;
  const ld = fromJsonLd(html);
  return {
    n: n != null ? Math.round(n) : null,
    km,
    longestKm,
    pct: { green, blue, red, black },
    minM: ld.minM,
    maxM: ld.maxM,
    photoUrl: photoUrl(html),
    country: ld.country,
    hasMix,
  };
}

export function isFranceCountry(country: string | null): boolean {
  if (!country) return true;
  const c = country.toUpperCase();
  return c === "FR" || c === "FR-FR" || c === "FRANCE";
}

export function stationSkiinfoUrl(plansUrl: string): string {
  return plansUrl.replace(/\/plans-des-pistes\/?$/, "/station-de-ski");
}

export function applyParsed(seed: SkiinfoRow, parsed: SkiinfoParsed, at: string): SkiinfoRow {
  const pct = parsed.hasMix ? parsed.pct : seed.pct;
  const n = parsed.hasMix ? parsed.n : seed.n;
  return {
    ...seed,
    n,
    km: parsed.km ?? seed.km,
    longestKm: parsed.longestKm ?? seed.longestKm,
    pct,
    minM: parsed.minM ?? seed.minM,
    maxM: parsed.maxM ?? seed.maxM,
    hasMix: parsed.hasMix || seed.hasMix,
    at,
  };
}
