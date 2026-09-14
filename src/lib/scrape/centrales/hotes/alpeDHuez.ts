/**
 * Alpe d'Huez Grand Domaine — Alpe d'Huez, Auris-en-Oisans, Oz-en-Oisans,
 * Vaujany, Villard-Reculas.
 *
 * Cinq stations, la plus grosse prise du moteur MSEM. Relevé du 13 septembre
 * 2026 : `robots.txt` dit « User-agent: * » suivi d'une seule ligne `Sitemap`.
 * On le lit, on extrait.
 *
 * Le catalogue annonce neuf cent cinquante-sept hébergements ; cinquante-trois
 * seulement sont vendables à huit personnes pour la semaine du 6 février 2027.
 * L'écart n'est pas un défaut du relevé : un catalogue dit ce que la station
 * possède, une offre ce qu'elle peut vendre.
 *
 * Cette centrale ne vend que des semaines du samedi au samedi en février : le
 * relevé sur trois nuits rend zéro, et sur quatre nuits aussi. La preuve que le
 * prix est bien un total de séjour vient donc du doublement de la durée — « Le
 * Kaila 601 » passe de 5 660,16 € sur sept nuits à 11 320,32 € sur quatorze,
 * exactement deux fois.
 */

import { chercherMsem } from "../moteurs/msem.server";
import type { Connecteur } from "../types";

export const alpeDHuez: Connecteur = {
  host: "reservation.alpedhuez.com",
  nom: "Alpe d'Huez Grand Domaine",
  moteur: "MSEM",
  chercher: (ctx) =>
    chercherMsem(ctx, {
      host: "reservation.alpedhuez.com",
      nom: "Alpe d'Huez Grand Domaine",
      cle: "adh",
      resort: 125,
      canal: "OT-125",
    }),
};
