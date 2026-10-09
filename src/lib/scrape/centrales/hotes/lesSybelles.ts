/**
 * Les Sybelles — La Toussuire, Le Corbier, Les Bottières, Saint-Sorlin-d'Arves,
 * Saint-Jean-d'Arves, Saint-Pancrace.
 *
 * Génération ancienne d'Open System : la page d'accueil ne porte pas de prix.
 * Le widget qu'elle charge publie le sien. Relevé du 9 octobre 2026 :
 * `idIntegration` 1744, `loginAPI` « latoussuire », onglet « Tous les
 * hébergements » moteur 8199, formulaire 39802-3655. La recherche datée a
 * répondu 493 logements au catalogue et des totaux de séjour (1 850 € sur
 * sept nuits pour l'un d'eux, du 6 au 13 février 2027).
 */

import { chercherAlliance } from "../moteurs/alliance.server";
import type { Connecteur } from "../types";

export const lesSybelles: Connecteur = {
  host: "reservation.la-toussuire.com",
  nom: "Les Sybelles",
  moteur: "Open System",
  chercher: (ctx) =>
    chercherAlliance(ctx, {
      host: "reservation.la-toussuire.com",
      nom: "Les Sybelles",
      cle: "syb",
      login: "latoussuire",
      catalogue: "https://map-jsonp.open-system.fr/osform/39802/3655/8199/vueinfo.js",
      site: "https://reservation.la-toussuire.com/",
    }),
};
