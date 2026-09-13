/**
 * Montgenèvre.
 *
 * **Son `robots.txt` dit « Disallow: / ».** Tout est interdit, sans exception ni
 * chemin épargné. Rien n'a donc été demandé à cet hôte au-delà du fichier
 * lui-même, ni page d'accueil, ni recherche, ni sitemap.
 *
 * Le moteur a tout de même pu être nommé, sans rien lui demander : le site
 * public de la station, `montgenevre.com`, charge le widget d'Alliance Réseaux
 * et déclare son identifiant de panier en clair. C'est la famille d'Open
 * System, dont la génération ancienne ne rend de toute façon pas de prix en
 * HTML.
 *
 * Ce fichier existe pour que le motif affiché soit le bon. La phrase du moteur
 * parlerait de coquille statique, ce qui est vrai mais secondaire : ici, ce qui
 * arrête, c'est une interdiction écrite.
 */

import type { Connecteur } from "../types";

export const montgenevre: Connecteur = {
  host: "reservation.montgenevre.com",
  nom: "Montgenèvre",
  moteur: "Open System",
  indisponible:
    "son robots.txt dit « Disallow: / » : tout est interdit, et rien ne lui a été demandé au-delà de ce fichier. Relevé du 13 septembre 2026.",
};
