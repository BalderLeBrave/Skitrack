/**
 * Pages tarifs découvertes dans les sitemaps des domaines.
 *
 * `refresh.server.ts` essayait huit chemins devinés (`/forfaits`, `/tarifs`,
 * `/skipass`…) après la page retenue. Le sitemap dit où est la page : elle
 * est essayée avant les chemins devinés. `pagesTarifs.json` est écrit par
 * `npm run forfaits:sitemap` (`scripts/forfaits-sitemap.ts`) ; il ne contient
 * que des URL que robots.txt autorisait au moment du relevé, et chacune est
 * rejugée par `verdictPoli` à la lecture.
 */

import donnees from "./pagesTarifs.json" with { type: "json" };

export type PagesTarifs = {
  at: string | null;
  source: string;
  pages: Record<string, string[]>;
};

/** Au plus ce nombre de pages découvertes par domaine, dans l'ordre du score. */
export const MAX_DECOUVERTES = 4;

export function pagesDecouvertes(slug: string, d: PagesTarifs = donnees as PagesTarifs): string[] {
  const p = d.pages?.[slug];
  return Array.isArray(p) ? p.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, MAX_DECOUVERTES) : [];
}

/** Page retenue d'abord, puis découvertes, puis chemins devinés ; sans doublon. */
export function ordreCandidats(retenue: string | null, decouvertes: string[], devinees: string[]): string[] {
  const vus: string[] = [];
  for (const u of [...(retenue ? [retenue] : []), ...decouvertes, ...devinees]) if (!vus.includes(u)) vus.push(u);
  return vus;
}

/**
 * Une grille lue sur une page découverte est-elle cohérente ? Relevé du
 * 11 octobre 2026 : `extractForfaits` lisait 67 € / 90 € sur une page de
 * Val d'Isère, 46 € / 46 € aux Saisies. Six jours coûtent au moins deux fois
 * et demie une journée, et pas plus de sept fois ; l'enfant ne paie pas plus
 * que l'adulte ; journée entre 30 et 110 €, six jours entre 150 et 650 €. Seules les pages découvertes passent par ce contrôle : celles
 * que le relevé connaissait gardent leur comportement.
 */
export function grilleCoherente(x: { j1: number | null; j6: number | null; enf6: number | null }): boolean {
  if (x.j1 != null && x.j6 != null && (x.j6 < 2.5 * x.j1 || x.j6 > 7 * x.j1)) return false;
  if (x.j6 != null && x.enf6 != null && x.enf6 > x.j6) return false;
  // Bornes des grilles françaises 2026-2027 : une « journée » à 21 € est une
  // demi-journée ou un tarif enfant (La Plagne), à 399 € une saison
  // (Grand Tourmalet).
  if (x.j1 != null && (x.j1 < 30 || x.j1 > 110)) return false;
  if (x.j6 != null && (x.j6 < 150 || x.j6 > 650)) return false;
  return true;
}
