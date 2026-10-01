/**
 * L'indicateur discret d'un prix de forfait de fiabilité faible : une icône
 * du registre et deux mots, les raisons en infobulle (grille non vérifiée sur
 * la page officielle, saison antérieure, journées additionnées…).
 *
 * `court` : l'icône seule, nommée pour les lecteurs d'écran, là où la place
 * manque (carte de station, fiche d'épingle, cellule du comparateur).
 */

import { Icon } from "@/components/Icon";

export function FiabiliteFaible({ raisons, court = false }: { raisons: string; court?: boolean }) {
  return (
    <span className="fiab7" title={raisons}>
      <Icon name="info" taille={12} titre={court ? "Fiabilité faible" : undefined} />
      {court ? null : "fiabilité faible"}
    </span>
  );
}
