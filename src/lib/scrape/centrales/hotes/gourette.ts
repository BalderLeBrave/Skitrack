/**
 * Gourette.
 *
 * Le widget N'Py (`loginAPI` « n-py », le même fichier que Piau) publie le
 * contour `stationgourette.js`. Relevé du 9 octobre 2026, du 6 février 2027,
 * sept nuits. Deux cent deux logements, tous dans le contour, aucune clé en
 * commun avec Piau, Luz, Peyragudes ou le Tourmalet. Le résumé confirme la
 * date. Sur ce login le total suit la durée : mesuré le même jour à Piau,
 * 1 100 € sur sept nuits et 2 200 € sur quatorze.
 */

import { chercherAlliance } from "../moteurs/alliance.server";
import type { Connecteur } from "../types";

export const gourette: Connecteur = {
  host: "www.gourette.com",
  nom: "Gourette",
  moteur: "Open System",
  chercher: (ctx) =>
    chercherAlliance(ctx, {
      host: "www.gourette.com",
      nom: "Gourette",
      cle: "gou",
      login: "n-py",
      catalogue: "https://map-jsonp.open-system.fr/osform/36892/3347/7961/vueinfo.js",
      site: "https://www.n-py.com/fr/gourette/hebergement",
      zone: "https://gadget.open-system.fr/widgets/territoire/npy/localisation-npy/stationgourette.js",
    }),
};
