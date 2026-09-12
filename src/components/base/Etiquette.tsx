/**
 * L'étiquette de SKITRACK : une pastille qui qualifie une valeur voisine.
 *
 * Un ton par sémantique, et rien de décoratif. `marque` dit un rattachement,
 * `neige` une hauteur relevée, `ok` une donnée confirmée, `alerte` une donnée
 * qui n'est plus à jour. `neutre` ne dit rien de plus que le mot qu'elle porte.
 *
 * Elle ne remplace jamais une phrase : une valeur absente se dit en toutes
 * lettres, elle ne se colore pas.
 */

import type { ReactNode } from "react";

export type EtiquetteTon = "neutre" | "marque" | "neige" | "ok" | "alerte";

const CLASSE: Record<EtiquetteTon, string> = {
  neutre: "tag",
  marque: "tag tag--brand",
  neige: "tag tag--snow",
  ok: "tag tag--ok",
  alerte: "tag tag--warn",
};

export function Etiquette({
  ton = "neutre",
  children,
  className,
  titre,
}: {
  ton?: EtiquetteTon;
  children: ReactNode;
  className?: string;
  /** Infobulle, quand le mot seul ne suffit pas à comprendre la source. */
  titre?: string;
}) {
  return (
    <span className={[CLASSE[ton], className].filter(Boolean).join(" ")} title={titre}>
      {children}
    </span>
  );
}
