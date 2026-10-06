/**
 * Le total du séjour de la carte de prix de la fiche d'annonce : le logement,
 * et les forfaits du groupe quand on les ajoute. Même règle que la carte
 * d'annonce (`CarteLogement`, « / pers. avec les forfaits ») et le pied de
 * Logements : un séjour vendu forfaits compris (`forfaitInclus`) ne les
 * compte pas deux fois, et un prix non publié ne se complète pas.
 *
 * Une règle de plus : les forfaits ne s'ajoutent que dans la devise du
 * logement. Un total en euros et des forfaits en francs ne s'additionnent pas.
 *
 * Module pur, chargé tel quel par `node --experimental-strip-types`.
 */

import type { Listing } from "../listings.ts";
import { forfaitInclus } from "./forfaitInclus.ts";

export type ForfaitsDuGroupe = { total: number | null; devise: string };

/** Les forfaits peuvent-ils s'ajouter au prix de ce logement ? */
export function forfaitsAjoutables(
  l: Pick<Listing, "total" | "currency" | "title" | "skiPassIncluded">,
  forfaits: ForfaitsDuGroupe | null | undefined,
): boolean {
  return !forfaitInclus(l) && forfaits?.total != null && forfaits.devise === l.currency && l.total > 0;
}

/** Le total, et s'il porte les forfaits. `null` sans prix publié. */
export function totalSejour(
  l: Pick<Listing, "total" | "currency" | "title" | "skiPassIncluded">,
  forfaits: ForfaitsDuGroupe | null | undefined,
  avecForfaits: boolean,
): { total: number | null; forfaitsAjoutes: boolean } {
  if (!(l.total > 0)) return { total: null, forfaitsAjoutes: false };
  if (avecForfaits && forfaitsAjoutables(l, forfaits)) {
    return { total: l.total + (forfaits?.total ?? 0), forfaitsAjoutes: true };
  }
  return { total: l.total, forfaitsAjoutes: false };
}

/** Par personne, au centime. `null` sans total ou sans voyageur. */
export function parPersonne(total: number | null, trav: number): number | null {
  return total != null && trav > 0 ? Math.round((total / trav) * 100) / 100 : null;
}
