/**
 * Le prix affiché par la fiche d'annonce : le montant principal (séjour ou
 * par personne) et sa ligne de détail, pour la carte de prix et la barre du
 * bas.
 */

import type { BudgetForfaits } from "@/lib/forfaits/prixSejour";
import { tr } from "@/lib/i18n";
import type { Listing } from "@/lib/listings";
import { eurCents, eurN, nuitsLbl } from "@/lib/parcours";
import { parPersonne, totalSejour } from "@/lib/stay/totalSejour";
import { prixLbl } from "@/lib/v7";

/** Le prix affiché, pour la carte de droite et la barre du bas. */
export function resumePrix(
  l: Listing,
  forfaits: BudgetForfaits | null | undefined,
  avecForfaits: boolean,
  trav: number,
  nights: number,
  mode: "total" | "pers",
): { principal: string; detail: string } {
  const { total } = totalSejour(l, forfaits, avecForfaits);
  const parPers = parPersonne(total, trav);
  if (total == null) return { principal: prixLbl(l), detail: nuitsLbl(nights) };
  if (mode === "pers" && parPers != null) {
    return {
      principal: eurN(parPers) ?? "",
      detail: tr("{prix} pour {n}", { prix: eurCents(total) ?? "", n: trav }),
    };
  }
  return {
    principal: eurCents(total) ?? "",
    detail:
      parPers != null ? tr("{prix} par pers.", { prix: eurN(parPers) ?? "" }) : nuitsLbl(nights),
  };
}
