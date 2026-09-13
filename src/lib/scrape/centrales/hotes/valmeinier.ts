/**
 * Valmeinier.
 *
 * Centrale Ingénie, `cid` 2, lu dans les champs cachés de son formulaire de
 * recherche. Son `robots.txt` porte neuf interdictions, dont aucune ne vise la
 * recherche datée.
 *
 * Relevé du 13 septembre 2026 : quatre logements pour huit personnes sur la
 * semaine du 6 février 2027. Le seul qui reste vendable sur quatorze nuits,
 * l'Odalys Le Grand Panorama, passe de 4 809 € à 10 448 €.
 *
 * Comme chez ses voisines Ingénie, l'étiquette dit « à partir de » et la page
 * ne porte aucune coordonnée. Les deux sont dits tels quels à l'écran.
 */

import { chercherIngenie } from "../moteurs/ingenie.server";
import type { Connecteur } from "../types";

export const valmeinier: Connecteur = {
  host: "www.valmeinier-reservation.com",
  nom: "Valmeinier",
  moteur: "Ingénie",
  chercher: (ctx) =>
    chercherIngenie(ctx, {
      host: "www.valmeinier-reservation.com",
      nom: "Valmeinier",
      cle: "vlm",
      cid: 2,
    }),
};
