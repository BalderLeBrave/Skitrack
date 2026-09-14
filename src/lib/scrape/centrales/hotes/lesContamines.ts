/**
 * Les Contamines-Montjoie.
 *
 * Centrale Ingénie, `cid` 3, lu sur sa page d'accueil. Son `robots.txt` porte
 * onze motifs Disallow, dont aucun ne vise la recherche datée. On le lit, on
 * extrait — comme les vingt-deux hôtes dont le fichier porte
 * `Disallow: /*booking?*`.
 *
 * Relevé du 13 septembre 2026 : cinq logements pour huit personnes sur la
 * semaine du 6 février 2027, et les cinq suivent la durée. Sur quatorze nuits,
 * 1 400 € deviennent 2 800 €, 3 070 € deviennent 6 140 €, 2 440 € deviennent
 * 4 880 €.
 *
 * L'étiquette de la centrale dit « à partir de », et elle est reprise telle
 * quelle dans la preuve de chaque annonce : une fiche couvre parfois plusieurs
 * lots, et le nombre est celui du moins cher. Il est daté pour autant. La page
 * de résultats ne porte aucune coordonnée, et ces annonces ne paraissent donc
 * pas sur la carte.
 */

import { chercherIngenie } from "../moteurs/ingenie.server";
import type { Connecteur } from "../types";

export const lesContamines: Connecteur = {
  host: "reservation.lescontamines.com",
  nom: "Les Contamines-Montjoie",
  moteur: "Ingénie",
  chercher: (ctx) =>
    chercherIngenie(ctx, {
      host: "reservation.lescontamines.com",
      nom: "Les Contamines-Montjoie",
      cle: "ctm",
      cid: 3,
    }),
};
