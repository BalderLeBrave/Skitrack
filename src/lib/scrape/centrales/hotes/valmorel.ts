/**
 * Valmorel.
 *
 * L'accueil est un WordPress. Le lien « Je réserve mon séjour » qu'il publie
 * mène à `reservation.valmorel.com`, et le widget de cette page publie la
 * recherche. Relevé du 9 octobre 2026 : `idIntegration` 1369, `loginAPI`
 * « valmorel », onglet « Tous les hébergements » moteur 7991, formulaire
 * 63877-3546. Le logement `OSMB-58385-2` y vaut 594 € sur trois nuits et
 * 1 386 € sur sept, du 6 février 2027 : le total suit la durée.
 */

import { chercherAlliance } from "../moteurs/alliance.server";
import type { Connecteur } from "../types";

export const valmorel: Connecteur = {
  host: "www.valmorel.com",
  nom: "Valmorel",
  moteur: "Open System",
  chercher: (ctx) =>
    chercherAlliance(ctx, {
      host: "www.valmorel.com",
      nom: "Valmorel",
      cle: "vmr",
      login: "valmorel",
      catalogue: "https://map-jsonp.open-system.fr/osform/63877/3546/7991/vueinfo.js",
      site: "https://reservation.valmorel.com/",
    }),
};
