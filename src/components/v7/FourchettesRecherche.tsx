/**
 * Les fourchettes des critères de recherche, branchées sur `useParcours`.
 *
 * L'accueil et Comparer posent les mêmes : altitudes, kilomètres, forfait, et
 * part de chaque couleur de piste. Chacune lit sa valeur et pose ses bornes
 * sur le magasin, qui arrondit au pas au curseur et garde telle quelle une
 * borne tapée (`poserFourchette`, `poserCouleur`).
 */

import { Fourchette } from "@/components/v7/Fourchette";
import { couleurLbl, fourchetteLbl, UNITES, type DefFourchette } from "@/lib/filtres";
import { COLS, ECHELLES, useParcours, type CleFourchette, type PisteColor } from "@/lib/parcours";

/** Une fourchette de station (`SEUILS`), ou le budget, sous son libellé. */
export function FourchetteRecherche({
  r,
}: {
  r: Pick<DefFourchette, "label" | "unit" | "b" | "pas"> & { k: CleFourchette };
}) {
  const valeur = useParcours((s) => s.filters[r.k]);
  const poser = useParcours((s) => s.poserFourchette);
  const { b, pas } = ECHELLES[r.k];
  return (
    <Fourchette
      lbl={r.label}
      bornes={b}
      valeur={valeur}
      pas={pas}
      unite={r.unit}
      resume={fourchetteLbl(r, valeur)}
      onPoser={(which, v, exact) => poser(r.k, which, v, exact)}
    />
  );
}

/** La part, les tronçons ou les km d'une couleur de piste, dans l'unité choisie. */
export function FourchetteCouleur({ c }: { c: PisteColor }) {
  const valeur = useParcours((s) => s.filters.col[c]);
  const unit = useParcours((s) => s.unit);
  const poser = useParcours((s) => s.poserCouleur);
  const def = COLS.find((x) => x.key === c)!;
  const u = UNITES[unit];
  return (
    <Fourchette
      lbl={def.label}
      pastille={def.token}
      bornes={u.b}
      valeur={valeur}
      pas={u.pas}
      unite={u.unite}
      resume={couleurLbl(unit, valeur)}
      onPoser={(which, v, exact) => poser(c, which, v, exact)}
    />
  );
}
