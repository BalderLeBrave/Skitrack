/**
 * Montgenèvre.
 *
 * Son `robots.txt` dit « Disallow: / ». On le lit, on n'en fait pas un arrêt.
 * Le moteur a pu être nommé sans rien lui demander : le site public de la
 * station, `montgenevre.com`, charge le widget d'Alliance Réseaux et déclare
 * son identifiant de panier en clair. C'est la famille d'Open System, dont la
 * génération ancienne ne rend pas de prix en HTML : pages `.aspx`, widgets
 * JavaScript, pas de page de résultats à interroger.
 *
 * Ce fichier existe pour que le motif affiché soit le bon. La phrase du moteur
 * parle déjà de coquille statique ; ici c'est la même génération.
 */

import type { Connecteur } from "../types";

export const montgenevre: Connecteur = {
  host: "reservation.montgenevre.com",
  nom: "Montgenèvre",
  moteur: "Open System",
  indisponible:
    "elle tourne sur la génération ancienne d'Open System, dont la recherche passe par un widget JavaScript, sans page de résultats à interroger. Relevé du 13 septembre 2026.",
};
