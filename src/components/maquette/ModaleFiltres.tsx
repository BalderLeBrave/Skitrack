/**
 * La fenêtre « Filtres » de Stations et de Logements (Skitrack App.dc.html:299-329,
 * 394-442) : 780 px, sections séparées d'un trait, pied avec « Tout effacer »
 * souligné à gauche et le bouton encre « Afficher N … » à droite.
 *
 * Elle ne filtre rien elle-même : l'écran passe ses sections (`SectionFiltre`)
 * et ses deux actions.
 */

import type { ReactNode } from "react";
import { tr } from "@/lib/i18n";
import { ModaleCentree } from "./ModaleCentree";

export function ModaleFiltres({
  titre,
  onFermer,
  onEffacer,
  effacerLbl,
  cta,
  onCta,
  children,
}: {
  /** Défaut : « Filtres ». */
  titre?: string;
  /** Croix, Échap, clic sur le fond. */
  onFermer: () => void;
  /** « Tout effacer » : remet les filtres de la fenêtre à zéro. */
  onEffacer: () => void;
  /** Défaut : « Tout effacer ». */
  effacerLbl?: string;
  /** Libellé du bouton encre, déjà traduit : « Afficher 42 stations ». */
  cta: string;
  /** Défaut : ferme la fenêtre (les filtres s'appliquent en direct). */
  onCta?: () => void;
  /** Les `SectionFiltre`. */
  children: ReactNode;
}) {
  return (
    <ModaleCentree
      titre={titre ?? tr("Filtres")}
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="m8-lien-fort" onClick={onEffacer}>
            {effacerLbl ?? tr("Tout effacer")}
          </button>
          <button type="button" className="m8-bouton-encre" onClick={onCta ?? onFermer}>
            {cta}
          </button>
        </>
      }
    >
      {children}
    </ModaleCentree>
  );
}

/**
 * Une section de la fenêtre Filtres : titre de 20 px, contenu dessous, trait
 * de séparation (sauf la dernière).
 */
export function SectionFiltre({
  titre,
  aside,
  ecart = 20,
  infobulle,
  className = "",
  children,
}: {
  /** Titre `h3`, déjà traduit. */
  titre: string;
  /** À droite du titre, sur la même ligne : un groupe d'`Onglets` (unité, mode de prix). */
  aside?: ReactNode;
  /** Écart vertical entre les blocs, en px : 14 à 20 selon la section du design. */
  ecart?: number;
  /** `title` du titre (« Listés par la source »). */
  infobulle?: string;
  className?: string;
  children: ReactNode;
}) {
  const h3 = <h3 title={infobulle}>{titre}</h3>;
  return (
    <section className={`m8-section ${className}`} style={{ gap: ecart }}>
      {aside ? (
        <div className="m8-section__tete">
          {h3}
          {aside}
        </div>
      ) : (
        h3
      )}
      {children}
    </section>
  );
}
