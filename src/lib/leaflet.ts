/**
 * Chargement de Leaflet, une fois, à la demande.
 *
 * Leaflet lit `window` dès son évaluation. Importé au niveau du module, il fait
 * échouer le rendu serveur de toute page qui le touche, avec une exception
 * « window is not defined » suivie d'une bascule en rendu client : rien ne se
 * voit à l'écran, et chaque premier affichage paie le détour.
 *
 * Il est donc chargé depuis un effet, qui ne s'exécute que dans le navigateur.
 * La promesse est mémorisée : deux cartes sur la même page ne chargent la
 * bibliothèque qu'une fois.
 */

import type * as Leaflet from "leaflet";

let chargement: Promise<typeof Leaflet> | null = null;

export function chargerLeaflet(): Promise<typeof Leaflet> {
  chargement ??= import("leaflet").then(
    (m) =>
      (m as unknown as { default?: typeof Leaflet }).default ?? (m as unknown as typeof Leaflet),
  );
  return chargement;
}

export type { Leaflet };
