/** Lecture d’un tarif dans une page. Sans montant 1 jour ou 6 jours → null. */

import type { ExtractedForfait } from "./types";

const SCRIPT_RE = /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi;
const TAG_RE = /<[^>]+>/g;
const EURO = String.raw`(?:€|eur|euros?)`;
const NUM = String.raw`(\d{2,3}(?:[.,]\d{1,2})?)`;
const D1 = String.raw`(?:1\s*(?:jours?|j\b|day|tag|giorno)|journée|tageskarte|1-day)`;
const D6 = String.raw`(?:6\s*(?:jours?|j\b|days?|tage|giorni)|semaine|6-day|6-tage)`;
const ADULT = String.raw`(?:adulte|adult|erwachsene|adulto)`;
const CHILD = String.raw`(?:enfant|child|kind|bambino|junior)`;

function money(raw: string): number | null {
  const n = Number(raw.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 15 || n > 900) return null;
  return Math.round(n * 100) / 100;
}

function plain(html: string): string {
  return html.replace(SCRIPT_RE, " ").replace(TAG_RE, " ").replace(/\s+/g, " ").trim();
}

function walk(node: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (n: unknown) => {
    if (Array.isArray(n)) {
      for (const item of n) visit(item);
      return;
    }
    if (!n || typeof n !== "object") return;
    const rec = n as Record<string, unknown>;
    out.push(rec);
    if (Array.isArray(rec["@graph"])) visit(rec["@graph"]);
    for (const v of Object.values(rec)) visit(v);
  };
  visit(node);
  return out;
}

function fromJsonLd(html: string): ExtractedForfait | null {
  let j1: number | null = null;
  let j6: number | null = null;
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    for (const node of walk(data)) {
      const name = String(node.name ?? node.title ?? "").toLowerCase();
      if (!/(forfait|skipass|ski pass|tageskarte|lift pass)/i.test(name)) continue;
      const offers = node.offers;
      const bundle = Array.isArray(offers)
        ? offers
        : offers && typeof offers === "object"
          ? [offers]
          : "price" in node
            ? [node]
            : [];
      for (const offer of bundle) {
        if (!offer || typeof offer !== "object") continue;
        const rec = offer as Record<string, unknown>;
        const amount = money(String(rec.price ?? rec.lowPrice ?? ""));
        if (amount == null) continue;
        const blob = `${name} ${rec.name ?? ""} ${rec.description ?? ""}`.toLowerCase();
        if (new RegExp(D6, "i").test(blob) && j6 == null) j6 = amount;
        else if (new RegExp(D1, "i").test(blob) && j1 == null) j1 = amount;
      }
    }
  }
  if (j1 == null && j6 == null) return null;
  return { j1, j6, enf6: null, kind: "jsonld" };
}

function searchAmount(text: string, duration: string, child = false): number | null {
  const who = child ? CHILD : ADULT;
  const patterns = [
    new RegExp(`${duration}.{0,80}?${who}.{0,40}?${NUM}\\s*${EURO}`, "i"),
    new RegExp(`${who}.{0,40}?${duration}.{0,40}?${NUM}\\s*${EURO}`, "i"),
    new RegExp(`${duration}.{0,40}?${NUM}\\s*${EURO}`, "i"),
  ];
  for (const pat of patterns) {
    const m = pat.exec(text);
    if (!m) continue;
    const val = money(m[1]);
    if (val != null) return val;
  }
  return null;
}

export function extractForfaits(html: string): ExtractedForfait | null {
  if (!html || !html.trim()) return null;
  const found = fromJsonLd(html);
  const text = plain(html).toLowerCase();
  let j1 = found?.j1 ?? null;
  let j6 = found?.j6 ?? null;
  const enf6 = found?.enf6 ?? null;
  const kind = found?.kind ?? "pattern";
  if (j6 == null) j6 = searchAmount(text, D6, false);
  if (j1 == null) j1 = searchAmount(text, D1, false);
  if (j1 == null && j6 == null) return null;
  return { j1, j6, enf6, kind };
}
