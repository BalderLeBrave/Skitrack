/**
 * Le pictogramme du niveau de risque d'avalanche, tel que la maquette Airbnb
 * le dessine (`Skitrack App.dc.html`, `vMore`, `bra.picto`) : un carré de
 * 48 px aux coins arrondis, à la couleur du niveau, le chiffre au centre.
 * 1 faible, 2 limité, 3 marqué, 4 fort, 5 très fort.
 *
 * Sans niveau publié (hors saison, bulletin absent ou en chargement), le même
 * carré en gris, sans chiffre : rien n'est inventé.
 */

import { braLabel } from "@/lib/bra/parse";
import { tr } from "@/lib/i18n";

export function PictoBra({ niveau }: { niveau: number | null }) {
  const n = niveau != null && niveau >= 1 && niveau <= 5 ? niveau : null;
  const libelle =
    n != null
      ? tr("Risque {n} sur 5, {niveau}", { n, niveau: braLabel(n) ?? "" })
      : tr("Aucun niveau de risque publié");
  return (
    <span className={`fs-bra__picto fs-bra__picto--${n ?? "neutre"}`} role="img" aria-label={libelle}>
      {n ?? ""}
    </span>
  );
}
