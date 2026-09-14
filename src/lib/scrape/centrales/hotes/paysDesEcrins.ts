/**
 * Pays des Écrins — Puy-Saint-Vincent.
 *
 * Centrale MSEM, `resort` 30015 et `channel` « PDE ». Relevé du 13 septembre
 * 2026 : cent quatre-vingt-dix-neuf hébergements au catalogue, cinq vendables à
 * huit personnes pour la semaine du 6 février 2027.
 *
 * Le prix suit la durée : « Chartie Gérard et Jeanne » passe de 1 704,72 € à
 * 3 409,44 € sur quatorze nuits, exactement le double, et deux chalets de
 * Vallouise suivent le même mouvement.
 *
 * Son `robots.txt` porte `Crawl-delay: 10`. On le lit, on n'en fait pas un
 * arrêt. Les prix viennent de `services.msem.tech`, qui n'a pas de `robots.txt`,
 * et le connecteur ne fait que deux appels par recherche. Le lien mène à la
 * page de réservation, faute de page par hébergement sous les slugs de MSEM.
 */

import { chercherMsem } from "../moteurs/msem.server";
import type { Connecteur } from "../types";

export const paysDesEcrins: Connecteur = {
  host: "www.paysdesecrins.com",
  nom: "Pays des Écrins",
  moteur: "MSEM",
  chercher: (ctx) =>
    chercherMsem(ctx, {
      host: "www.paysdesecrins.com",
      nom: "Pays des Écrins",
      cle: "pde",
      resort: 30015,
      canal: "PDE",
      ficheChemin: "/hebergements/",
    }),
};
