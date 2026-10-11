/**
 * Lecture d'une page tarifs de domaine par Firecrawl : schéma demandé et
 * normalisation vers `ExtractedForfait`, comme `extractForfaits` pour le HTML.
 *
 * Firecrawl rend les pages en JavaScript (boutiques, grilles chargées après
 * coup) que `extractForfaits` lit vides. Ce qu'il renvoie est borné ici : un
 * prix « à partir de », un tarif en ligne promotionnel, un forfait été ou
 * piéton ne passent pas pour le tarif public adulte d'hiver.
 */

import type { ExtractedForfait } from "./types.ts";

export const PROMPT_FORFAIT =
  "Grille publique des forfaits de ski alpin de la saison d'hiver. Recopie uniquement les prix écrits, en euros, " +
  "au tarif public guichet (pas les promotions en ligne, pas les « à partir de »). " +
  "Laisse null ce que la page n'écrit pas. Ignore l'été, les piétons, le ski de fond et la luge.";

export const SCHEMA_FORFAIT = {
  type: "object",
  properties: {
    saison: { type: ["string", "null"], description: "ex. 2026-2027" },
    adulte_1_jour: { type: ["number", "null"] },
    adulte_6_jours: { type: ["number", "null"] },
    enfant_6_jours: { type: ["number", "null"] },
    age_enfant: { type: ["string", "null"], description: "tranche d'âge enfant écrite, ex. 5-12 ans" },
    a_partir_de: { type: "boolean", description: "vrai si les prix sont des « à partir de » ou des prix en ligne variables" },
  },
} as const;

function borne(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".").replace(/[^\d.]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
}

export function forfaitDepuisFirecrawl(json: Record<string, unknown> | null | undefined): ExtractedForfait | null {
  if (!json || json.a_partir_de === true) return null;
  const j1 = borne(json.adulte_1_jour, 15, 150);
  let j6 = borne(json.adulte_6_jours, 60, 700);
  let enf6 = borne(json.enfant_6_jours, 30, 600);
  if (j1 != null && j6 != null && j6 <= j1) j6 = null;
  if (enf6 != null && j6 != null && enf6 > j6) enf6 = null;
  if (j1 == null && j6 == null) return null;
  return { j1, j6, enf6, kind: "firecrawl" };
}
