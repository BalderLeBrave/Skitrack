/**
 * Les forfaits des stations pour le séjour en cours : ce que la fiche, les
 * listes, le tri et le filtre lisent.
 *
 * Les grilles arrivent une fois dans le magasin `useGrillesForfaits`
 * (`grillesApp.ts` les charge, côté navigateur) ; les dates viennent de
 * `useStay`. Tant que les grilles ne sont pas là, aucun prix : une liste ne
 * se classe pas sur un chiffre qui va changer.
 *
 * Les résolutions sont gardées tant que les grilles et les dates ne changent
 * pas : trier ou filtrer 313 stations ne résout chacune qu'une fois.
 *
 * Chargé tel quel par `node --experimental-strip-types` : aucun alias `@/`.
 */

import { create } from "zustand";
import { useStay } from "../stay.ts";
import { todayIso } from "../stay/calendar.ts";
import { forfaitsDuSejour, type ForfaitsSejour } from "./prixSejour.ts";
import type { PrixResolu } from "./resolution.ts";
import type { GrilleTarifaire } from "./tarifsPeriode.ts";

/** Toutes les grilles connues de l'application, `null` avant leur arrivée. */
export const useGrillesForfaits = create<{ grilles: GrilleTarifaire[] | null }>(() => ({
  grilles: null,
}));

/** Ce dont dépend un prix de liste : les grilles et les dates du séjour. */
export type ContexteSejour = {
  grilles: readonly GrilleTarifaire[] | null;
  arrivee: string;
  depart: string;
};

/** Les grilles et le séjour tels que les magasins les tiennent maintenant. */
export function contexteCourant(): ContexteSejour {
  const { checkIn: arrivee, checkOut: depart } = useStay.getState();
  return { grilles: useGrillesForfaits.getState().grilles, arrivee, depart };
}

let memo: {
  grilles: readonly GrilleTarifaire[];
  arrivee: string;
  depart: string;
  aujourdhui: string;
  par: Map<string, ForfaitsSejour>;
} | null = null;

/** L'adulte et l'enfant d'une station pour le séjour ; `null` tant que les
 *  grilles ne sont pas chargées. */
export function forfaitsStation(
  stationId: string,
  ctx: ContexteSejour = contexteCourant(),
): ForfaitsSejour | null {
  const { grilles, arrivee, depart } = ctx;
  if (!grilles) return null;
  const aujourdhui = todayIso();
  if (
    !memo ||
    memo.grilles !== grilles ||
    memo.arrivee !== arrivee ||
    memo.depart !== depart ||
    memo.aujourdhui !== aujourdhui
  )
    memo = { grilles, arrivee, depart, aujourdhui, par: new Map() };
  let f = memo.par.get(stationId);
  if (!f) {
    f = forfaitsDuSejour(stationId, { arrivee, depart }, grilles, aujourdhui);
    memo.par.set(stationId, f);
  }
  return f;
}

/** Le forfait adulte du séjour, s'il a un prix. */
export function prixAdulteSejour(
  stationId: string,
  ctx: ContexteSejour = contexteCourant(),
): PrixResolu | null {
  const a = forfaitsStation(stationId, ctx)?.adulte;
  return a?.statut === "resolu" ? a : null;
}
