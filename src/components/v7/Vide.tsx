/**
 * L'état vide de la maquette v7 : un dessin, un titre, une cause, une sortie.
 *
 * Le dessin n'est pas une icône du registre : c'est une illustration sur une
 * grille de 48, posée une fois par écran vide, et il reste ici.
 */

import type { ReactNode } from "react";

export function Illustration({ taille = 40 }: { taille?: number }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="vide__dessin"
    >
      <path d="M6 38l12-20 8 12 5-7 11 15z" />
      <circle cx="36" cy="12" r="4" />
    </svg>
  );
}

export function Vide({
  titre,
  children,
  actions,
  compact = false,
}: {
  titre: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** La bande horizontale plutôt que le bloc centré. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <section className="vide vide--bande">
        <Illustration taille={32} />
        <div className="vide__texte">
          <strong className="vide__titre">{titre}</strong>
          {children ? <span className="vide__hint">{children}</span> : null}
        </div>
      </section>
    );
  }
  return (
    <div className="vide">
      <Illustration />
      <strong className="vide__titre vide__titre--grand">{titre}</strong>
      {children ? <p className="vide__hint">{children}</p> : null}
      {actions ? <div className="vide__actions">{actions}</div> : null}
    </div>
  );
}
