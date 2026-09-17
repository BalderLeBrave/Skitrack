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

/**
 * L'âge du forfait enfant, tel que les domaines français le publient : le
 * tarif « enfant » couvre 5 à 12 ans révolus chez la plupart d'entre eux. Ce
 * n'est pas une borne technique mais la définition du tarif que le catalogue
 * relve sous `enf6` : l'écrire ici évite que l'écran l'invente.
 */
export const AGE_ENFANT = "5 à 12 ans";

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
 * Les enfants sont un **sous-ensemble** des voyageurs, pas un compte à part.
 *
 * Un enfant occupe un lit et compte dans la capacité d'un logement : le
 * séparer des voyageurs aurait faussé toute la recherche de logements. Ce
 * qu'il change, et c'est tout ce qu'il change, c'est le tarif de son forfait.
 * D'où la borne : jamais plus d'enfants que de voyageurs.
 */
export function clampChildren(value: number, travelers: number): number {
  return clamp(value, 0, clampTravelers(travelers));
}

/** Les adultes : ce qui reste des voyageurs une fois les enfants comptés. */
export function adults(travelers: number, children: number): number {
  return clampTravelers(travelers) - clampChildren(children, travelers);
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

/** « 6 adultes, 2 enfants », ou les seuls voyageurs quand aucun enfant. */
export function partyLabel(travelers: number, children: number): string {
  const enf = clampChildren(children, travelers);
  if (!enf) return travelersLabel(travelers);
  const ad = adults(travelers, children);
  return `${ad} adulte${ad > 1 ? "s" : ""}, ${enf} enfant${enf > 1 ? "s" : ""}`;
}
