/**
 * Le bouton de SKITRACK.
 *
 * Un écran porte une action principale et une seule : elle prend le ton
 * `principal`. Toutes les autres prennent `fantome` et se ressemblent entre
 * elles. C'est la seule distinction ; il n'y a pas de troisième ton.
 *
 * Le rendu réutilise le vocabulaire `.btn` de la maquette v6, pour que les
 * écrans du parcours ne changent pas d'apparence en changeant de composant.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "@/components/Icon";

export type BoutonTon = "principal" | "fantome";

export function Bouton({
  ton = "principal",
  grand = false,
  pleineLargeur = false,
  icone,
  children,
  className,
  type = "button",
  ...reste
}: {
  ton?: BoutonTon;
  /** Hauteur 48 au lieu de 40, pour l'action principale d'un écran. */
  grand?: boolean;
  pleineLargeur?: boolean;
  /** Pictogramme du registre, posé avant le libellé. */
  icone?: IconName;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = [
    "btn",
    ton === "fantome" ? "btn--ghost" : null,
    grand ? "btn--lg" : null,
    pleineLargeur ? "btn--full" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...reste}>
      {icone ? <Icon name={icone} /> : null}
      {children}
    </button>
  );
}
