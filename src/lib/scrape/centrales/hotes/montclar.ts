/**
 * Montclar les 2 vallées.
 *
 * **Une station qui n'avait aucune centrale au relevé.** L'audit n'en avait
 * trouvé aucune ; le mur de partenaires de `msem.tech` la nomme, et son site
 * publie `resort` 276 et `channel` « OT-276 » vers `services.msem.tech`.
 *
 * Relevé du 13 septembre 2026 : six hébergements au catalogue, tous avec
 * capacité, coordonnées et photo — et **zéro offre** à toutes les dates
 * essayées, sept nuits comprises. La centrale existe et répond ; elle n'a rien
 * à vendre ces jours-là. Le connecteur rend donc une liste vide, et l'écran dit
 * que c'est un renseignement et non une panne.
 *
 * Le lien mène à la centrale et non au logement. Le site est un WordPress dont
 * les adresses d'hébergement sont en `/hebergement-locatif/<slug>/`, avec des
 * slugs qui ne sont pas ceux de MSEM : fabriquer une adresse par logement
 * donnerait une erreur 404 une fois sur deux. Un lien juste vers la centrale
 * vaut mieux qu'un lien faux vers le logement.
 *
 * `robots.txt` porte `Disallow: /irisit/`, qui n'a rien à voir avec
 * l'hébergement. On le lit, on extrait.
 */

import { chercherMsem } from "../moteurs/msem.server";
import type { Connecteur } from "../types";

export const montclar: Connecteur = {
  host: "www.montclar.com",
  nom: "Montclar les 2 vallées",
  moteur: "MSEM",
  chercher: (ctx) =>
    chercherMsem(ctx, {
      host: "www.montclar.com",
      nom: "Montclar les 2 vallées",
      cle: "mtc",
      resort: 276,
      canal: "OT-276",
      ficheChemin: "",
    }),
};
