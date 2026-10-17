/**
 * Un village qui n'est pas une station : la commune, et la station de ski
 * la plus proche (repère à 25 km au plus, communes geo.api.gouv.fr).
 *
 * Le domaine l'emporte sur le pin le plus proche. Lamoura est à 5 km du pin
 * de Monts Jura et à 7 km de celui des Rousses, mais elle fait le domaine
 * des Rousses, comme Prémanon et Bois-d'Amont.
 */

import { foldName } from "./carte.ts";
import lignes from "./communesProches.json" with { type: "json" };

type Ligne = [string, string, number];

const LIGNES = lignes as Ligne[];

const DOMAINE = new Map<string, string>(
  (
    [
      ["Lamoura", "les-rousses"],
      ["Prémanon", "les-rousses"],
      ["Bois-d'Amont", "les-rousses"],
    ] as const
  ).map(([nom, id]) => [foldName(nom), id]),
);

export type CommuneTrouvee = { nom: string; stationId: string };

function stationDe(nom: string, id: string): string {
  return DOMAINE.get(foldName(nom)) ?? id;
}

/** Communes dont le nom commence par la saisie déjà repliée. */
export function communesPour(q: string): CommuneTrouvee[] {
  if (q.length < 3) return [];
  const hits: { nom: string; stationId: string; exact: number; km: number }[] = [];
  for (const [nom, id, km] of LIGNES) {
    const f = foldName(nom);
    if (f !== q && !f.startsWith(q)) continue;
    const force = DOMAINE.has(f);
    hits.push({ nom, stationId: stationDe(nom, id), exact: f === q ? 0 : 1, km: force ? 0 : km });
  }
  hits.sort((a, b) => a.exact - b.exact || a.km - b.km || a.nom.localeCompare(b.nom, "fr"));
  const vus = new Set<string>();
  const out: CommuneTrouvee[] = [];
  for (const h of hits) {
    const cle = `${h.stationId}|${foldName(h.nom)}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push({ nom: h.nom, stationId: h.stationId });
    if (out.length >= 6) break;
  }
  return out;
}

/** La station d'une commune nommée en toutes lettres, ou `null`. */
export function stationIdDeLaCommune(texte: string): string | null {
  const q = foldName(texte);
  if (q.length < 3) return null;
  let best: { id: string; km: number } | null = null;
  for (const [nom, id, km] of LIGNES) {
    if (foldName(nom) !== q) continue;
    const force = DOMAINE.has(q);
    const d = force ? -1 : km;
    if (!best || d < best.km) best = { id: stationDe(nom, id), km: d };
  }
  return best?.id ?? null;
}
