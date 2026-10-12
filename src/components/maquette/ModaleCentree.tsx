/**
 * La fenêtre centrée de la maquette Airbnb (Skitrack App.dc.html:299-329,
 * 394-453) : fond flouté, boîte arrondie de 24 px, en-tête de 64 px avec la
 * croix à gauche et le titre gras au centre, corps qui défile, pied facultatif.
 *
 * Coquille commune de `ModaleFiltres` et `ModaleEnregistrer`. Échap ferme, le
 * focus reste dedans (`useModale`), un clic sur le fond ferme.
 */

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { tr } from "@/lib/i18n";
import { useModale } from "./modale";
import { IconeCroix } from "./traces";

export function ModaleCentree({
  titre,
  onFermer,
  pied,
  children,
  largeur = "large",
  niveau = "filtres",
  classeCorps = "",
  focusInitial,
}: {
  /** Titre centré de l'en-tête, déjà traduit ; nomme aussi la fenêtre. */
  titre: string;
  /** Croix, Échap et clic sur le fond. */
  onFermer: () => void;
  /** Contenu du pied (bordé en haut) ; absent, pas de pied. */
  pied?: ReactNode;
  children: ReactNode;
  /** « large » : 780 px (Filtres) ; « etroite » : 520 px (Enregistrer). */
  largeur?: "large" | "etroite";
  /** Empilement : « filtres » (z 60) sous « dessus » (z 70, Enregistrer),
   *  qui passe aussi au-dessus de la fiche d'annonce. */
  niveau?: "filtres" | "dessus";
  /** Classe ajoutée au corps qui défile (marges propres à un contenu). */
  classeCorps?: string;
  /** Sélecteur de la commande focalisée à l'ouverture (défaut : la boîte). */
  focusInitial?: string;
}) {
  const boite = useRef<HTMLDivElement>(null);
  useModale(boite, onFermer, focusInitial);
  return createPortal(
    <div className={`m8-modale-hote m8-modale-hote--${niveau}`}>
      <div className="m8-voile" onClick={onFermer} aria-hidden />
      <div
        ref={boite}
        className={`m8-modale m8-modale--${largeur}`}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        tabIndex={-1}
      >
        <header className="m8-modale__tete">
          <button
            type="button"
            className="m8-modale__fermer"
            aria-label={tr("Fermer")}
            onClick={onFermer}
          >
            <IconeCroix taille={14} epaisseur={2.4} />
          </button>
          <b>{titre}</b>
        </header>
        <div className={`m8-modale__corps ${classeCorps}`}>{children}</div>
        {pied ? <footer className="m8-modale__pied">{pied}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
