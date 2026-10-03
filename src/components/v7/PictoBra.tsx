/**
 * Le pictogramme du niveau de risque d'avalanche, sur le modèle de l'échelle
 * européenne à cinq niveaux : une montagne à la couleur du niveau, le chiffre
 * posé dessus. 1 faible, 2 limité, 3 marqué, 4 fort, 5 très fort (damier
 * rouge et noir, comme sur l'échelle européenne).
 *
 * Sans niveau publié (hors saison, bulletin absent ou en chargement), la même
 * montagne en gris, sans chiffre.
 *
 * Dessiné ici, en SVG : ni image externe, ni glyphe.
 */

import { useId } from "react";
import { braLabel } from "@/lib/bra/parse";
import { tr } from "@/lib/i18n";

/** Le tracé de la montagne, deux sommets, dans une grille de 56 × 48. */
const MONTAGNE = "M3 45 L21 13 L27.5 22 L35 6 L53 45 Z";

export function PictoBra({ niveau, taille = 56 }: { niveau: number | null; taille?: number }) {
  const damier = useId();
  const n = niveau != null && niveau >= 1 && niveau <= 5 ? niveau : null;
  const libelle =
    n != null
      ? tr("Risque {n} sur 5, {niveau}", { n, niveau: braLabel(n) ?? "" })
      : tr("Aucun niveau de risque publié");
  const fond = n == null ? "var(--color-glacier)" : n === 5 ? `url(#${damier})` : `var(--color-bra-${n})`;
  return (
    <svg
      className={`bra7__picto${n == null ? " bra7__picto--neutre" : ""}`}
      viewBox="0 0 56 48"
      width={taille}
      height={(taille * 48) / 56}
      role="img"
      aria-label={libelle}
    >
      {n === 5 ? (
        <defs>
          <pattern id={damier} width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="var(--color-bra-5)" />
            <rect width="4" height="4" fill="var(--color-bra-damier)" />
            <rect x="4" y="4" width="4" height="4" fill="var(--color-bra-damier)" />
          </pattern>
        </defs>
      ) : null}
      <path
        d={MONTAGNE}
        fill={fond}
        stroke={n == null ? "var(--color-texte-3)" : "var(--color-bra-encre)"}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {n != null ? (
        <text
          x="28"
          y="41"
          textAnchor="middle"
          fontSize="19"
          fontWeight="800"
          fill={n >= 4 ? "var(--color-bra-clair)" : "var(--color-bra-encre)"}
          stroke={n === 5 ? "var(--color-bra-encre)" : "none"}
          strokeWidth={n === 5 ? 3 : 0}
          paintOrder="stroke"
        >
          {n}
        </text>
      ) : null}
    </svg>
  );
}
