/**
 * L'état d'un écran qui n'a rien à montrer : vide, en chargement, en erreur.
 *
 * Les trois disent leur cause. Un écran vide nomme ce qui manque et l'action
 * qui le remplit ; un écran en chargement dit ce qu'il attend, et dessine la
 * place que la donnée prendra ; un écran en erreur nomme ce qui a échoué et ce
 * que l'application montre à la place. Aucun des trois n'est un cadre bordé
 * posé au milieu d'une page blanche : il prend la place du contenu, dans son
 * flux, à sa largeur.
 *
 * Le squelette du chargement est décoratif, donc caché aux lecteurs d'écran ;
 * c'est le titre, annoncé poliment, qui dit l'attente.
 */

import type { ReactNode } from "react";

export type EtatSorte = "vide" | "chargement" | "erreur";

export function Etat({
  sorte,
  titre,
  cause,
  action,
  lignes = 3,
  compact = false,
  className,
}: {
  sorte: EtatSorte;
  /** Ce qui manque, ce qui est attendu, ou ce qui a échoué, en une phrase. */
  titre: ReactNode;
  /** Pourquoi, et ce que l'écran montre à la place. */
  cause?: ReactNode;
  /** Ce qui sort de cet état : un bouton, un lien. */
  action?: ReactNode;
  /** Chargement : nombre de lignes dessinées, à la mesure de ce qui viendra. */
  lignes?: number;
  /** Dans une colonne ou sous une liste, sans le dégagement d'un écran entier. */
  compact?: boolean;
  className?: string;
}) {
  const classes = ["etat", `etat--${sorte}`, compact ? "etat--compact" : null, className]
    .filter(Boolean)
    .join(" ");

  if (sorte === "chargement") {
    return (
      <div
        className={classes}
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-testid="etat-chargement"
      >
        <p className="etat__titre">{titre}</p>
        {cause ? <p className="etat__cause">{cause}</p> : null}
        <div className="squelette" aria-hidden="true">
          {Array.from({ length: lignes }, (_, i) => (
            <span key={i} className="squelette__ligne" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={classes}
      role={sorte === "erreur" ? "alert" : undefined}
      data-testid={`etat-${sorte}`}
    >
      <p className="etat__titre">{titre}</p>
      {cause ? <p className="etat__cause">{cause}</p> : null}
      {action ? <div className="etat__actions">{action}</div> : null}
    </div>
  );
}
