/**
 * Luz-Ardiden.
 *
 * Contour publié `stationluzardiden.js`, login « n-py ». Relevé du 9 octobre
 * 2026, du 6 février 2027. Soixante-neuf logements ; la première page en rend
 * soixante-sept et annonce la suite. Deux points du rectangle tombent dans le
 * contour de Barèges et pas dans celui de Luz : ils sont écartés. Les autres
 * clés ne sont à aucune autre station mesurée ce jour-là.
 */

import { chercherAlliance } from "../moteurs/alliance.server";
import type { Connecteur } from "../types";

export const luzArdiden: Connecteur = {
  host: "luz-ardiden.com",
  nom: "Luz-Ardiden",
  moteur: "Open System",
  chercher: (ctx) =>
    chercherAlliance(ctx, {
      host: "luz-ardiden.com",
      nom: "Luz-Ardiden",
      cle: "luz",
      login: "n-py",
      catalogue: "https://map-jsonp.open-system.fr/osform/36892/3347/7961/vueinfo.js",
      site: "https://www.n-py.com/fr/luz-ardiden/hebergement",
      zone: "https://gadget.open-system.fr/widgets/territoire/npy/localisation-npy/stationluzardiden.js",
    }),
};
