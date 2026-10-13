/**
 * L'histogramme posé au-dessus d'une fourchette de prix (`hist()`,
 * Skitrack App.dc.html:972-977) : les valeurs comptées par classes égales sur
 * l'échelle, les barres dans la fourchette à l'encre, les autres en gris.
 *
 * Purement décoratif : la fourchette dessous porte la commande et ses valeurs.
 */

import { useMemo } from "react";
import { classesHistogramme } from "./histogrammeClasses";

export function Histogramme({
  valeurs,
  bornes,
  plage,
  bins = 20,
  hauteur = 64,
}: {
  /** Les valeurs brutes (une par station, par annonce…) ; les non finies sont ignorées. */
  valeurs: readonly number[];
  /** L'échelle de la fourchette dessous. */
  bornes: readonly [number, number];
  /** La fourchette posée ; nulle : toute l'échelle, toutes les barres à l'encre. */
  plage: readonly [number, number] | null;
  /** Nombre de classes (20 pour le forfait, 24 pour le prix dans le design). */
  bins?: number;
  /** Hauteur en px : 64 (Stations) ou 72 (Logements). */
  hauteur?: number;
}) {
  const counts = useMemo(() => classesHistogramme(valeurs, bornes, bins), [valeurs, bornes, bins]);
  const mx = Math.max(...counts, 1);
  const [b0, b1] = bornes;
  const w = (b1 - b0) / counts.length;
  return (
    <div className="m8-hist" style={{ height: hauteur }} aria-hidden>
      {counts.map((c, i) => {
        const v0 = b0 + (i + 0.5) * w;
        const dedans =
          !plage || ((plage[0] <= b0 || v0 >= plage[0]) && (plage[1] >= b1 || v0 <= plage[1]));
        return (
          <i
            key={i}
            className={`m8-hist__barre${dedans ? " m8-hist__barre--in" : ""}`}
            style={{ height: `${(c / mx) * 100}%`, minHeight: c ? 4 : 2 }}
          />
        );
      })}
    </div>
  );
}
