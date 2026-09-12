/**
 * Le champ de saisie de SKITRACK : un libellé et son contrôle.
 *
 * Le libellé est une ligne de texte normal, en casse phrase, plus petite et
 * plus grise que la valeur qu'il nomme. Jamais de capitales espacées.
 *
 * `options` fait un choix dans une liste, son absence fait une saisie libre.
 * Les deux partagent la même boîte, donc une rangée de champs s'aligne sans
 * que l'appelant ait à compter des pixels.
 */

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export type ChampOption = { valeur: string; libelle: string };

function Enveloppe({
  label,
  aide,
  idControle,
  children,
}: {
  label: string;
  aide?: ReactNode;
  idControle: string;
  children: ReactNode;
}) {
  return (
    <div className="champ">
      <label className="champ__label" htmlFor={idControle}>
        {label}
      </label>
      {children}
      {aide ? <p className="champ__aide">{aide}</p> : null}
    </div>
  );
}

export function Champ({
  label,
  aide,
  className,
  id,
  ...reste
}: {
  label: string;
  /** Phrase courte sous le champ, quand la contrainte n'est pas devinable. */
  aide?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const idControle = id ?? auto;
  return (
    <Enveloppe label={label} aide={aide} idControle={idControle}>
      <input
        id={idControle}
        className={["champ__controle", className].filter(Boolean).join(" ")}
        {...reste}
      />
    </Enveloppe>
  );
}

export function ChampChoix({
  label,
  aide,
  options,
  className,
  id,
  ...reste
}: {
  label: string;
  aide?: ReactNode;
  options: readonly ChampOption[];
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const idControle = id ?? auto;
  return (
    <Enveloppe label={label} aide={aide} idControle={idControle}>
      <select
        id={idControle}
        className={["champ__controle", className].filter(Boolean).join(" ")}
        {...reste}
      >
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
    </Enveloppe>
  );
}
