/**
 * Le prix affiché par la fiche d'annonce : le montant principal (séjour ou
 * par personne) et sa ligne de détail, pour la carte de prix et la barre du
 * bas.
 */

import type { BudgetForfaits } from "@/lib/forfaits/prixSejour";
import { tr } from "@/lib/i18n";
import type { Listing } from "@/lib/listings";
import { eurCents, nuitsLbl } from "@/lib/parcours";
import { parPersonne, totalSejour } from "@/lib/stay/totalSejour";
import { persLbl, prixLbl } from "@/lib/v7";

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
      principal: eurCents(parPers) ?? "",
      detail: tr("{prix} pour {pers}", { prix: eurCents(total) ?? "", pers: persLbl(trav) }),
    };
  }
  return {
    principal: eurCents(total) ?? "",
    detail:
      parPers != null
        ? tr("{prix} par pers.", { prix: eurCents(parPers) ?? "" })
        : nuitsLbl(nights),
  };
}
