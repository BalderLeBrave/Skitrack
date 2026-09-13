/**
 * La Plagne — le domaine et ses villages.
 *
 * Seule centrale du parc sur le moteur Orchestra qui soit interrogeable, et la
 * plus coûteuse de toutes. Sa page de résultats groupée est fermée par
 * `robots.txt` — `/*serp?` et tout ce qui porte `type=` —, si bien que le prix
 * ne s'obtient qu'un logement à la fois. Ce qui reste ouvert, ce sont les pages
 * de destination, sans paramètre et sans prix, et un calendrier par logement.
 *
 * **Chaque station vise son village, et c'est ce qui rend la chose tenable.**
 * Champagny-en-Vanoise coûte une page et sept calendriers,
 * Montchavin-les-Coches autant. Seule « La Plagne », qui désigne le domaine
 * entier, vise les onze destinations et leurs quatre-vingt-quinze logements.
 *
 * **Et rien de tout cela ne dépend des dates.** Le catalogue et le calendrier
 * sont retenus en mémoire, six heures et trois heures : la deuxième recherche
 * ne coûte plus rien, à n'importe quelles dates. C'est ce qui fait la différence
 * entre un connecteur acceptable et un connecteur qu'il ne fallait pas écrire.
 *
 * Relevé du 13 septembre 2026, quatre personnes du 6 au 13 février 2027 : cinq
 * logements vendables sur sept à Champagny, un sur sept à Montchavin, quatre
 * sur neuf à Belle Plagne. Sans dates, les mêmes fiches n'annoncent qu'un prix
 * d'appel ; avec dates, le total suit la durée — 3 300 € sur sept nuits,
 * 6 500 € sur quatorze, 9 700 € sur vingt et une — et la saison, le même
 * logement valant 900 € en septembre et 3 300 € en février.
 *
 * Ces pages ne portent pas de coordonnées.
 */

import { chercherOrchestra } from "../moteurs/orchestra.server";
import type { Connecteur } from "../types";

/** Les onze destinations de la centrale, dans l'ordre où elle les publie. */
const TOUTES = [
  "belle-plagne",
  "champagny-en-vanoise",
  "montchavin-les-coches",
  "plagne-1800",
  "plagne-aime-2000",
  "plagne-bellecote",
  "plagne-centre",
  "plagne-montalbert",
  "plagne-soleil",
  "plagne-vallee",
  "plagne-villages",
] as const;

export const laPlagne: Connecteur = {
  host: "www.laplagneresort.com",
  nom: "La Plagne",
  moteur: "Orchestra",
  chercher: (ctx) =>
    chercherOrchestra(ctx, {
      host: "www.laplagneresort.com",
      nom: "La Plagne",
      cle: "lpl",
      destinations: {
        "champagny-en-vanoise": ["champagny-en-vanoise"],
        "montchavin-les-coches": ["montchavin-les-coches"],
        "aime-2000": ["plagne-aime-2000"],
        "plagne-bellecote": ["plagne-bellecote"],
      },
      // « La Plagne » désigne le domaine : elle les vise toutes.
      parDefaut: TOUTES,
    }),
};
