/**
 * Piau-Engaly.
 *
 * L'accueil charge le widget N'Py, `idIntegration` 1448, `loginAPI` « n-py »,
 * onglet « Tous les hébergements » moteur 7961, formulaire 36892-3347, vue 1381.
 * Ce login couvre les Pyrénées. Le contour publié `stationpiauengaly.js` borne
 * la recherche. Relevé du 9 octobre 2026, quatre personnes à partir du
 * 6 février 2027. Cent quarante-quatre logements, tous dans le contour.
 * L'appartement OSMB-65885-1 passe de 1 100 € sur sept nuits à 2 200 € sur
 * quatorze. Le résumé dit la date, sept nuits, et deux adultes.
 */

import { chercherAlliance } from "../moteurs/alliance.server";
import type { Connecteur } from "../types";

const CATALOGUE = "https://map-jsonp.open-system.fr/osform/36892/3347/7961/vueinfo.js";

export const piauEngaly: Connecteur = {
  host: "piau-engaly.com",
  nom: "Piau-Engaly",
  moteur: "Open System",
  chercher: (ctx) =>
    chercherAlliance(ctx, {
      host: "piau-engaly.com",
      nom: "Piau-Engaly",
      cle: "pie",
      login: "n-py",
      catalogue: CATALOGUE,
      site: "https://www.n-py.com/fr/piau-engaly/hebergement",
      zone: "https://gadget.open-system.fr/widgets/territoire/npy/localisation-npy/stationpiauengaly.js",
    }),
};
