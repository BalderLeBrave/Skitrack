/**
 * Grand Tourmalet, La Mongie et Barèges.
 *
 * Le site affiche des prix qui ne changent pas quand on change les dates.
 * Le widget publie deux contours de station, pas ceux des vallées :
 * `lamongieenstation.js` et `geo-station-bareges.js`. Login « n-py ». Relevé
 * du 9 octobre 2026, du 6 février 2027. Cent quatre-vingt-huit logements à
 * La Mongie, soixante-douze à Barèges, aucune clé en commun. Le rectangle de
 * Barèges recoupe deux logements de Luz dont le point publié est dans le
 * contour de Barèges, pas dans celui de Luz.
 */

import { chercherAlliance } from "../moteurs/alliance.server";
import type { Connecteur, ContexteCentrale } from "../types";

const CATALOGUE = "https://map-jsonp.open-system.fr/osform/36892/3347/7961/vueinfo.js";
const MONGIE =
  "https://gadget.open-system.fr/widgets/territoire/npy/localisation-npy/lamongieenstation.js";
const BAREGES = "https://gadget.open-system.fr/widgets/territoire/npy/geo-station-bareges.js";

function unVersant(ctx: ContexteCentrale, zone: string) {
  return chercherAlliance(ctx, {
    host: "www.n-py.com",
    nom: "Grand Tourmalet",
    cle: "gtm",
    login: "n-py",
    catalogue: CATALOGUE,
    site: "https://www.n-py.com/fr/grand-tourmalet/hebergement",
    zone,
  });
}

export const grandTourmalet: Connecteur = {
  host: "www.n-py.com",
  nom: "Grand Tourmalet",
  moteur: "Open System",
  chercher: async (ctx) => {
    const mongie = await unVersant(ctx, MONGIE);
    const bareges = await unVersant(ctx, BAREGES);
    const vus = new Set(mongie.map((l) => l.id));
    return [...mongie, ...bareges.filter((l) => !vus.has(l.id))];
  },
};
