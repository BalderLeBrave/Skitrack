/**
 * Dévoluy — La Joue du Loup et Superdévoluy.
 *
 * Génération ancienne d'Open System. Relevé du 9 octobre 2026 : le widget
 * publie `idIntegration` 1531, `loginAPI` « devoluy-hautesalpes », onglet
 * « Tous les hébergements » moteur 8217, formulaire 39120-3666. La recherche
 * datée a répondu 212 logements et des totaux de séjour.
 */

import { chercherAlliance } from "../moteurs/alliance.server";
import type { Connecteur } from "../types";

export const devoluy: Connecteur = {
  host: "reservation.ledevoluy.com",
  nom: "Dévoluy",
  moteur: "Open System",
  chercher: (ctx) =>
    chercherAlliance(ctx, {
      host: "reservation.ledevoluy.com",
      nom: "Dévoluy",
      cle: "dev",
      login: "devoluy-hautesalpes",
      catalogue: "https://map-jsonp.open-system.fr/osform/39120/3666/8217/vueinfo.js",
      site: "https://reservation.ledevoluy.com/",
    }),
};
