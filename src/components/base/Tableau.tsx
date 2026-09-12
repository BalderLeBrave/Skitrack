/**
 * Le tableau de SKITRACK : ce qui se compare se lit en lignes et en colonnes.
 *
 * Une colonne déclarée `nombre` aligne ses cellules à droite et passe en
 * chiffres tabulaires, pour que deux valeurs se comparent d'un regard sans
 * qu'on ait à lire les chiffres un par un.
 *
 * Une cellule sans donnée reçoit `null` et le tableau écrit l'absence. Il
 * n'invente ni zéro, ni tiret muet, ni moyenne.
 */

import type { ReactNode } from "react";

export type Colonne<C extends string> = {
  cle: C;
  entete: ReactNode;
  /** Aligne à droite et passe en chiffres tabulaires. */
  nombre?: boolean;
  /** Largeur fixe, quand la colonne porte un libellé de critère. */
  largeur?: string;
};

export type Ligne<C extends string> = {
  cle: string;
  cellules: Partial<Record<C, ReactNode>>;
  /** Met la ligne en avant, pour la station retenue ou le meilleur écart. */
  retenue?: boolean;
};

export function Tableau<C extends string>({
  colonnes,
  lignes,
  legende,
  absence = "non communiqué",
  surSurvol,
  className,
}: {
  colonnes: readonly Colonne<C>[];
  lignes: readonly Ligne<C>[];
  /** Ce que le tableau montre, en une ligne, au-dessus de lui. */
  legende?: ReactNode;
  /** Mot employé quand une cellule n'a pas de donnée. */
  absence?: string;
  /** Survol d'une ligne, pour éclairer la même donnée ailleurs dans l'écran. */
  surSurvol?: (cle: string | null) => void;
  className?: string;
}) {
  return (
    <div className={["tableau", className].filter(Boolean).join(" ")}>
      {legende ? <p className="tableau__legende">{legende}</p> : null}
      <div className="tableau__defilement">
        <table className="tableau__grille">
          <thead>
            <tr>
              {colonnes.map((c) => (
                <th
                  key={c.cle}
                  scope="col"
                  style={c.largeur ? { width: c.largeur } : undefined}
                  className={c.nombre ? "tableau__nombre" : undefined}
                >
                  {c.entete}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr
                key={l.cle}
                className={l.retenue ? "tableau__ligne--retenue" : undefined}
                onMouseEnter={surSurvol ? () => surSurvol(l.cle) : undefined}
                onMouseLeave={surSurvol ? () => surSurvol(null) : undefined}
              >
                {colonnes.map((c) => {
                  const v = l.cellules[c.cle];
                  const vide = v === null || v === undefined;
                  return (
                    <td key={c.cle} className={c.nombre ? "tableau__nombre" : undefined}>
                      {vide ? <span className="tableau__absence">{absence}</span> : v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
