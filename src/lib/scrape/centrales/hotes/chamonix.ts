/**
 * Chamonix, Les Houches, Vallorcine.
 *
 * Même moteur que La Plagne, Orchestra, sur l'instance du Pays du Mont-Blanc.
 * Relevé du 13 septembre 2026 : le catalogue ne porte pas les identifiants de
 * logement qu'il faut pour demander un calendrier, donc un prix. Les relire
 * à chaque recherche ne ferait que répéter cette mesure.
 *
 * `robots.txt` ne ferme pas ce chemin. On le lit. Ce qui manque est l'identifiant.
 */

import type { Connecteur } from "../types";

export const chamonix: Connecteur = {
  host: "booking.chamonix.com",
  nom: "Chamonix",
  moteur: "Orchestra",
  indisponible:
    "son catalogue n'expose pas les identifiants de logement qu'il faut pour lui demander un prix. Relevé du 13 septembre 2026.",
};
