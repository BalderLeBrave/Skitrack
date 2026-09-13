/**
 * Vars — Vars, Vars Sainte-Marie, Les Claux.
 *
 * **Une centrale que l'audit n'avait pas vue.** Il rangeait ces stations sous
 * la Forêt Blanche, dont la centrale est celle de Risoul, sur moteur Ingénie et
 * fermée. Vars a sa propre centrale, sur MSEM, et elle répond. Les deux
 * versants du domaine se vendent séparément.
 *
 * Elle a été trouvée par l'autre bout : au lieu de demander à chaque station
 * quel éditeur elle emploie, demander à l'éditeur quelles stations il équipe.
 * Le mur de partenaires de `msem.tech` nomme Vars ; son sous-domaine de
 * réservation publie lui-même `resort` 692 et `channel` « OT-692 », et
 * l'API répond.
 *
 * Relevé du 13 septembre 2026 : `robots.txt` dit « User-agent: * » suivi d'une
 * seule ligne `Sitemap`, donc rien n'est interdit. Cent douze hébergements au
 * catalogue, cinq vendables à huit personnes du 6 au 13 février 2027. Sur
 * quatorze nuits, le « Chalet Marly » passe de 4 753 € à 9 381 € et un chalet
 * de Sainte-Marie de 2 966,22 € à 5 951,98 € : le prix suit la durée.
 */

import { chercherMsem } from "../moteurs/msem.server";
import type { Connecteur } from "../types";

export const vars: Connecteur = {
  host: "reservation.vars.com",
  nom: "Vars",
  moteur: "Ublo",
  chercher: (ctx) =>
    chercherMsem(ctx, {
      host: "reservation.vars.com",
      nom: "Vars",
      cle: "vars",
      resort: 692,
      canal: "OT-692",
    }),
};
