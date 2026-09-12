/**
 * La liste de faits de SKITRACK : un libellé, une valeur, rien autour.
 *
 * Elle remplace les blocs de définitions qui coiffaient chaque valeur d'une
 * étiquette en capitales. Le libellé est plus petit et plus gris que la valeur,
 * et c'est la taille qui fait la hiérarchie, pas un cadre.
 *
 * Une valeur absente est dite absente. L'appelant passe `null` et la liste
 * écrit le mot ; il n'écrit ni zéro ni tiret à la place d'une mesure.
 */

import type { ReactNode } from "react";

export type Fait = {
  cle: string;
  libelle: ReactNode;
  valeur: ReactNode;
  /** Précision sous la valeur : source, date de relevé, portée. */
  precision?: ReactNode;
};

export function Liste({
  faits,
  colonnes = 1,
  absence = "non communiqué",
  className,
}: {
  faits: readonly Fait[];
  /** Nombre de colonnes au large. La liste retombe sur une seule au étroit. */
  colonnes?: 1 | 2 | 3 | 4;
  absence?: string;
  className?: string;
}) {
  return (
    <dl
      className={["liste", `liste--${colonnes}`, className].filter(Boolean).join(" ")}
      data-testid="liste-faits"
    >
      {faits.map((f) => {
        const vide = f.valeur === null || f.valeur === undefined;
        return (
          <div className="liste__fait" key={f.cle}>
            <dt className="liste__libelle">{f.libelle}</dt>
            <dd className="liste__valeur">
              {vide ? <span className="liste__absence">{absence}</span> : f.valeur}
            </dd>
            {f.precision ? <dd className="liste__precision">{f.precision}</dd> : null}
          </div>
        );
      })}
    </dl>
  );
}
