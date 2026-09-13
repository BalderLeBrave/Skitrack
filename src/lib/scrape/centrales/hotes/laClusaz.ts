/**
 * La Clusaz.
 *
 * Seule centrale du parc sur le moteur Deskline / Feratel, et la mieux servie
 * de toutes : deux appels rendent soixante hébergements avec leur prix daté,
 * leurs coordonnées et une photo. Relevé du 13 septembre 2026, huit personnes
 * sur la semaine du 6 février 2027 — coordonnées sur cinquante-six des soixante,
 * photo sur les soixante.
 *
 * **Ce n'est pas la page qu'on lit, c'est le service.** Le HTML de la centrale
 * ne porte pas un seul prix : son moteur est une application JavaScript qui se
 * peint dans un Shadow DOM. Le service qu'elle interroge, `webapi.deskline.net`,
 * est ouvert — il n'a pas de `robots.txt` —, et le `robots.txt` de la centrale
 * n'interdit que `/reserver/`, qui n'est pas le chemin du moteur.
 *
 * **La preuve du total de séjour, sur trente-six logements.** Sur quatorze
 * nuits au lieu de sept, le rapport va de 1,952 à 2,220 et **aucun prix ne
 * reste identique** : le « Chalet La Patna » passe de 12 136,60 € à 24 273,20 €,
 * « Cortna 1 » de 2 525,20 € à 4 930,40 €. Sur trois nuits, la centrale répond
 * 204 sans contenu : elle ne vend pas court en février.
 *
 * Le lien mène à la page de réservation : le service ne donne pas d'adresse par
 * hébergement, et en fabriquer une serait inventer.
 */

import { chercherFeratel } from "../moteurs/feratel.server";
import type { Connecteur } from "../types";

export const laClusaz: Connecteur = {
  host: "www.laclusaz.com",
  nom: "La Clusaz",
  moteur: "Deskline / Feratel",
  chercher: (ctx) =>
    chercherFeratel(ctx, {
      host: "www.laclusaz.com",
      nom: "La Clusaz",
      cle: "clz",
      organisation: "laclusaz",
      chemin: "/reservation/hebergements",
    }),
};
