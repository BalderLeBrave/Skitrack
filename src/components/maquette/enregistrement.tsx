/**
 * Le cœur des cartes : vide, il ouvre « Enregistrer » (`ModaleEnregistrer`) ;
 * plein, il retire le logement de ses dossiers.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { dossiersDe, type SejourFavori } from "@/lib/favoris/modele";
import { useFavoris, useIdsFavoris } from "@/lib/favoris/store";
import type { Listing } from "@/lib/listings";
import { useParcours } from "@/lib/parcours";
import { tr } from "@/lib/i18n";
import { ModaleEnregistrer } from "./ModaleEnregistrer";

/** Retire le logement de tous ses dossiers et le dit dans le message du bas. */
export function retirerDesFavoris(l: Listing): void {
  const noms = dossiersDe(useFavoris.getState(), l.id).map((d) => d.nom);
  useFavoris.getState().retirer(l.id);
  useParcours
    .getState()
    .say(
      noms.length === 1 ? tr("Retiré de « {nom} ».", { nom: noms[0] }) : tr("Retiré des favoris."),
    );
}

/**
 * Le cœur des cartes d'un écran, et la fenêtre qu'il ouvre (une seule pour
 * toutes les cartes).
 *
 * ```tsx
 * const enr = useEnregistrement(sejour);
 * <CarteAnnonce heart={enr.coeur(l)} … />
 * {enr.modale}
 * ```
 *
 * L'état « enregistré » attend le montage : le rendu serveur ne connaît pas
 * les favoris, gardés dans le navigateur.
 */
export function useEnregistrement(sejour: SejourFavori | null): {
  /** Les props `heart` d'une `CarteAnnonce` pour ce logement. */
  coeur: (l: Listing) => { saved: boolean; onToggle: () => void };
  /** Ouvre « Enregistrer » pour ce logement, sans passer par le cœur. */
  ouvrir: (l: Listing) => void;
  /** La fenêtre ouverte, à rendre une fois dans l'écran ; `null` sinon. */
  modale: ReactNode;
} {
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  const ids = useIdsFavoris();
  const [pour, setPour] = useState<Listing | null>(null);
  const fermer = useCallback(() => setPour(null), []);
  const coeur = useCallback(
    (l: Listing) => {
      const saved = monte && ids.has(l.id);
      return { saved, onToggle: () => (saved ? retirerDesFavoris(l) : setPour(l)) };
    },
    [monte, ids],
  );
  return {
    coeur,
    ouvrir: setPour,
    modale: pour ? <ModaleEnregistrer l={pour} sejour={sejour} onFermer={fermer} /> : null,
  };
}
