/**
 * Combloux.
 *
 * Identifié le 20 septembre 2026 : Orchestra, sous un préfixe de chemin et non
 * à la racine comme La Plagne. Le préfixe et les destinations ne sont pas
 * écrits ici. La page d'accueil les publie ; `chercherOrchestraHote` les lit.
 * Pas de lien, ou aucun qui nomme Combloux, et la recherche le dit au lieu de
 * répondre qu'il n'y a rien de libre.
 *
 * Son `robots.txt` disait Disallow au premier audit. On le lit à l'exécution,
 * on n'en fait pas un arrêt.
 */

import { chercherOrchestraHote } from "../moteurs/orchestra.server";
import type { Connecteur } from "../types";

export const combloux: Connecteur = {
  host: "reservation.combloux.com",
  nom: "Combloux",
  moteur: "Orchestra",
  chercher: (ctx) => chercherOrchestraHote(ctx, "Combloux", "reservation.combloux.com"),
};
