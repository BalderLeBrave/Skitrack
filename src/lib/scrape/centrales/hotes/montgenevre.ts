/**
 * Montgenèvre.
 *
 * Son `robots.txt` dit « Disallow: / ». On le lit, on n'en fait pas un arrêt.
 * Génération ancienne d'Open System. Relevé du 9 octobre 2026 : le widget
 * publie `loginAPI` « montgenevre », onglet « Tous les hébergements » moteur
 * 8070, formulaire 44468-3344. La recherche datée a répondu 282 logements et
 * des totaux de séjour.
 */

import { chercherAlliance } from "../moteurs/alliance.server";
import type { Connecteur } from "../types";

export const montgenevre: Connecteur = {
  host: "reservation.montgenevre.com",
  nom: "Montgenèvre",
  moteur: "Open System",
  chercher: (ctx) =>
    chercherAlliance(ctx, {
      host: "reservation.montgenevre.com",
      nom: "Montgenèvre",
      cle: "mgv",
      login: "montgenevre",
      catalogue: "https://map-jsonp.open-system.fr/osform/44468/3344/8070/vueinfo.js",
      site: "https://reservation.montgenevre.com/",
    }),
};
