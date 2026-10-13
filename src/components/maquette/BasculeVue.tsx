/**
 * La pilule sombre fixée en bas au centre qui bascule Liste / Carte
 * (Skitrack App.dc.html:287, 390 ; `sViewPill`). Elle annonce la vue où l'on
 * va : « Carte » en liste, « Liste » sur la carte.
 */

import { tr } from "@/lib/i18n";
import { ICONES } from "./icones";
import { Trace } from "./traces";

export function BasculeVue({
  vue,
  onBasculer,
  surelevee = false,
}: {
  /** La vue affichée maintenant. */
  vue: "liste" | "carte";
  onBasculer: () => void;
  /** Remonte la pilule (bottom 100 px au lieu de 28) au-dessus d'une barre
   *  fixée en bas, comme la barre de comparaison de Stations. */
  surelevee?: boolean;
}) {
  const versCarte = vue === "liste";
  return (
    <button
      type="button"
      className={`m8-bascule${surelevee ? " m8-bascule--haute" : ""}`}
      onClick={onBasculer}
    >
      <Trace d={versCarte ? ICONES.map : ICONES.list} taille={15} epaisseur={2} />
      {versCarte ? tr("Carte") : tr("Liste")}
    </button>
  );
}
