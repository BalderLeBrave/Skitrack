/**
 * Ax 3 Domaines.
 *
 * Génération ancienne d'Open System. Relevé du 9 octobre 2026 : le widget
 * publie `idIntegration` 1671, `loginAPI` « ariege », onglet « Tous les
 * hébergements » moteur 8269, formulaire 92630-3693. La recherche datée a
 * répondu 118 logements et des totaux de séjour.
 */

import { chercherAlliance } from "../moteurs/alliance.server";
import type { Connecteur } from "../types";

export const ax3Domaines: Connecteur = {
  host: "reservation.ax-ski.com",
  nom: "Ax 3 Domaines",
  moteur: "Open System",
  chercher: (ctx) =>
    chercherAlliance(ctx, {
      host: "reservation.ax-ski.com",
      nom: "Ax 3 Domaines",
      cle: "ax3",
      login: "ariege",
      catalogue: "https://map-jsonp.open-system.fr/osform/92630/3693/8269/vueinfo.js",
      site: "https://reservation.ax-ski.com/",
    }),
};
