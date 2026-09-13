/**
 * Flaine.
 *
 * Centrale MSEM, `resort` 320 et `channel` « OT-320 », publiés en clair par la
 * page de réservation du site. Relevé du 13 septembre 2026 : `robots.txt`
 * n'interdit rien qui touche à l'hébergement, trois cent soixante-neuf
 * hébergements au catalogue — tous avec coordonnées, presque tous avec photo et
 * capacité — et quarante-quatre vendables à huit personnes pour la semaine du
 * 6 février 2027.
 *
 * La preuve du total de séjour est nette : sur quatorze nuits au lieu de sept,
 * les trois premiers doublent exactement. 6 720 € deviennent 13 473 €,
 * 2 793,28 € deviennent 5 580,44 €, 3 527 € deviennent 7 055 €.
 *
 * Le chemin d'une fiche est au singulier ici, `/hebergement/<slug>/`, là où les
 * autres centrales MSEM écrivent `/hebergements/`. Le pluriel rend 404.
 */

import { chercherMsem } from "../moteurs/msem.server";
import type { Connecteur } from "../types";

export const flaine: Connecteur = {
  host: "www.flaine.com",
  nom: "Flaine",
  moteur: "MSEM",
  chercher: (ctx) =>
    chercherMsem(ctx, {
      host: "www.flaine.com",
      nom: "Flaine",
      cle: "fla",
      resort: 320,
      canal: "OT-320",
      ficheChemin: "/hebergement/{slug}/",
    }),
};
