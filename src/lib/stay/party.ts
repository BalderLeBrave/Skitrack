/**
 * Bornes du groupe : voyageurs et chambres.
 *
 * Un seul endroit, parce qu'elles étaient écrites en dur dans deux composants
 * avec les mêmes valeurs recopiées, la forme exacte qui finit par diverger.
 * Elles valaient 12 et 6 jusqu'au 30 août 2026 : un groupe de quatorze ou un
 * chalet de huit chambres, deux demandes ordinaires en location de montagne,
 * ne pouvaient pas s'exprimer, et le bouton « + » cessait simplement de
 * répondre sans rien dire.
 *
 * Ce ne sont pas des limites techniques (aucun calcul ne casse au-delà) mais
 * les bornes de ce que l'application prétend traiter sérieusement : au-delà de
 * vingt personnes, une recherche de location bascule dans le séjour de groupe,
 * que les sources interrogées ici ne couvrent pas.
 *
 * Repris de `src/renderer/src/data/partyLimits.ts` (commit 2d960d5), augmenté
 * des trois fonctions qui s'écrivaient dans les composants.
 */

export const PARTY_LIMITS = {
  /** Voyageurs : au moins un, au plus vingt. */
  travelers: { min: 1, max: 20 },
  /** Chambres demandées : zéro vaut « studio accepté ». */
  rooms: { min: 0, max: 9 },
} as const;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampTravelers(value: number): number {
  return clamp(value, PARTY_LIMITS.travelers.min, PARTY_LIMITS.travelers.max);
}

export function clampRooms(value: number): number {
  return clamp(value, PARTY_LIMITS.rooms.min, PARTY_LIMITS.rooms.max);
}

/**
 * Ce que veut dire le nombre de chambres demandé.
 *
 * Zéro n'est pas « aucune chambre » : c'est l'absence d'exigence, donc un
 * studio passe. L'écrire en clair évite qu'on lise un filtre là où il n'y en a
 * pas.
 */
export function roomsLabel(rooms: number): string {
  const n = clampRooms(rooms);
  if (n === 0) return "studio accepté";
  return n === 1 ? "1 chambre" : `${n} chambres`;
}

export function travelersLabel(travelers: number): string {
  const n = clampTravelers(travelers);
  return n === 1 ? "1 voyageur" : `${n} voyageurs`;
}
