/**
 * Le cœur d'une annonce, comme sur Airbnb : vide, il ouvre « Enregistrer »
 * (`ModaleEnregistrer`, maquette Airbnb du 12 octobre 2026) ; plein, il
 * retire le logement de ses dossiers (`retirerDesFavoris`).
 *
 * Il vit dans la carte d'annonce et dans le volet : partout où ils servent
 * (Logements, Prix « Par budget », Favoris), le cœur suit sans rien câbler.
 */

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { retirerDesFavoris } from "@/components/maquette/enregistrement";
import { ModaleEnregistrer } from "@/components/maquette/ModaleEnregistrer";
import type { SejourFavori } from "@/lib/favoris/modele";
import { useEstFavori } from "@/lib/favoris/store";
import type { Listing } from "@/lib/listings";
import { tr } from "@/lib/i18n";

export function BoutonFavori({
  l,
  sejour,
  className = "",
  libelle = false,
}: {
  l: Listing;
  sejour: SejourFavori | null;
  className?: string;
  /** Écrit « Enregistrer » ou « Enregistré » à côté du cœur (en-tête de la
   *  fiche d'annonce). */
  libelle?: boolean;
}) {
  // Les favoris vivent dans le navigateur : le rendu serveur ne les connaît
  // pas, le cœur ne dit son état qu'une fois la page montée.
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  const favori = useEstFavori(l.id) && monte;
  const [choix, setChoix] = useState(false);
  const fermer = useCallback(() => setChoix(false), []);
  return (
    <>
      <button
        type="button"
        className={`coeur7${favori ? " coeur7--on" : ""} ${className}`}
        aria-pressed={favori}
        aria-label={favori ? tr("Retirer des favoris") : tr("Enregistrer dans un dossier")}
        title={favori ? tr("Retirer des favoris") : tr("Enregistrer dans un dossier")}
        onClick={(e) => {
          e.stopPropagation();
          if (!favori) return setChoix(true);
          retirerDesFavoris(l);
        }}
      >
        <Icon name="coeur" taille={18} />
        {libelle ? <span>{favori ? tr("Enregistré") : tr("Enregistrer")}</span> : null}
      </button>
      {choix ? <ModaleEnregistrer l={l} sejour={sejour} onFermer={fermer} /> : null}
    </>
  );
}
