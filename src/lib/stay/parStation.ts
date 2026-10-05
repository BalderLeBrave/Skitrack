/**
 * Les logements d'un grand domaine relié, rangés par station.
 *
 * Chercher La Plagne montre aussi les logements des stations reliées
 * (Montchavin, Champagny, Peisey, Les Arcs : verdict `linked`). Le grand
 * domaine ne fusionne pas les logements : chacun reste à sa station
 * (`nearestDomainId`, `rattachement.ts`), et l'écran les range sous elle —
 * la station cherchée d'abord, puis les autres par ordre alphabétique. Le tri
 * choisi tient à l'intérieur de chaque station. Chaque logement n'apparaît
 * qu'une fois, sous une seule station.
 */

type Rangeable = { id: string; nearestDomainId?: string | null };

/** La station sous laquelle le logement se range : la sienne, ou celle qu'on
 *  cherche s'il n'en a pas (relevé figé d'avant le rattachement). */
export function stationDuLogement(l: Rangeable, cherchee: string): string {
  return l.nearestDomainId ?? cherchee;
}

export function rangerParStation<L extends Rangeable>(
  logements: readonly L[],
  cherchee: string,
  nomDe: (stationId: string) => string,
): L[] {
  const vus = new Set<string>();
  const uniques = logements.filter((l) => (vus.has(l.id) ? false : (vus.add(l.id), true)));
  const rang = (id: string) => (id === cherchee ? "" : nomDe(id));
  // `sort` est stable : l'ordre du tri choisi reste celui de chaque station.
  return [...uniques].sort((a, b) =>
    rang(stationDuLogement(a, cherchee)).localeCompare(rang(stationDuLogement(b, cherchee)), "fr"),
  );
}
