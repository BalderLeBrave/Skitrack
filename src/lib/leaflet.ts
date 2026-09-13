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

/**
 * Pointeur grossier : un doigt, pas une souris.
 *
 * Sert à décider si une carte doit prendre le geste tout de suite. À la
 * souris, oui : le curseur se pose là où on veut agir, et la molette ne sert
 * à rien d'autre. Au doigt, non : le même geste fait défiler la page, et une
 * carte qui l'avale piège le lecteur au milieu de sa liste. Elle attend donc
 * un premier appui, qui dit l'intention.
 *
 * `pointer: coarse` décrit le dispositif de pointage principal, ce qui est la
 * question posée — plus juste que la largeur de la fenêtre, qu'un portable
 * tactile large mettrait en défaut.
 */
export function pointeurGrossier(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

export type { Leaflet };
