/**
 * Peyragudes.
 *
 * Le widget publie le contour des deux versants, pieds de pistes
 * (`peyragudespiedsdepistespeyresourdeetagudes.js`), pas celui de la vallée.
 * Login « n-py ». Relevé du 9 octobre 2026, du 6 février 2027. Cent vingt-neuf
 * logements, tous dans le contour, aucune clé en commun avec les autres
 * stations N'Py mesurées le même jour.
 */

import { chercherAlliance } from "../moteurs/alliance.server";
import type { Connecteur } from "../types";

export const peyragudes: Connecteur = {
  host: "peyragudes.com",
  nom: "Peyragudes",
  moteur: "Open System",
  chercher: (ctx) =>
    chercherAlliance(ctx, {
      host: "peyragudes.com",
      nom: "Peyragudes",
      cle: "pey",
      login: "n-py",
      catalogue: "https://map-jsonp.open-system.fr/osform/36892/3347/7961/vueinfo.js",
      site: "https://www.n-py.com/fr/peyragudes/hebergement",
      zone: "https://gadget.open-system.fr/widgets/territoire/npy/localisation-npy/peyragudespiedsdepistespeyresourdeetagudes.js",
    }),
};
