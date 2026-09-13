/**
 * Combloux.
 *
 * **Son `robots.txt` dit « Disallow: / »**, et c'est la seule chose qu'on sache
 * de cette centrale. Rien d'autre ne lui a été demandé : ni page d'accueil, ni
 * sitemap, ni recherche. Son moteur reste donc inconnu, non par manque de
 * recherche mais par respect de cette règle.
 *
 * L'audit du 13 septembre 2026 l'avait déjà classée ainsi, et le sondage qui a
 * nommé le moteur de vingt-trois autres centrales n'a rien pu ajouter ici.
 */

import type { Connecteur } from "../types";

export const combloux: Connecteur = {
  host: "reservation.combloux.com",
  nom: "Combloux",
  moteur: "inconnu",
  indisponible:
    "son robots.txt dit « Disallow: / » : tout est interdit, et rien ne lui a été demandé au-delà de ce fichier. Son moteur reste donc inconnu par respect de cette règle, non par manque de recherche. Relevé du 13 septembre 2026.",
};
