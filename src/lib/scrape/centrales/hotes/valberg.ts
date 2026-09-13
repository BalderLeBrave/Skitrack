/**
 * Valberg.
 *
 * Centrale MSEM, `resort` 665 et `channel` « OT-665 ». Relevé du 13 septembre
 * 2026 : quarante hébergements au catalogue, tous avec coordonnées et photo, et
 * un seul dépasse huit places — d'où l'offre unique à huit personnes, le
 * « Chalet Utopia » à 7 042,80 € pour la semaine du 6 février 2027. Sur trois
 * nuits, il tombe à 3 111,20 €.
 *
 * **Ce que dit le `robots.txt` de la vitrine, et pourquoi on l'écoute.** Il
 * autorise tout le monde (`Allow: /`), puis ferme nommément une liste de
 * robots d'entraînement — Amazonbot, CCBot, ClaudeBot, GPTBot, Google-Extended
 * et quelques autres. Il porte en outre un signal de contenu explicite :
 * « search=yes, ai-train=no, use=reference ». Chercher et citer en référence
 * est autorisé ; entraîner ne l'est pas.
 *
 * C'est exactement ce que fait ce connecteur : une recherche déclenchée par un
 * visiteur, dont le résultat renvoie vers la page de réservation de Valberg.
 * Rien n'est collecté pour de l'entraînement. Et de toute façon, les prix ne
 * viennent pas de cette vitrine mais de `services.msem.tech` : le connecteur
 * n'appelle jamais `www.valberg.com` à l'exécution.
 */

import { chercherMsem } from "../moteurs/msem.server";
import type { Connecteur } from "../types";

export const valberg: Connecteur = {
  host: "www.valberg.com",
  nom: "Valberg",
  moteur: "MSEM",
  chercher: (ctx) =>
    chercherMsem(ctx, {
      host: "www.valberg.com",
      nom: "Valberg",
      cle: "vbg",
      resort: 665,
      canal: "OT-665",
      ficheChemin: "/sejourner/reserver-votre-sejour/",
    }),
};
