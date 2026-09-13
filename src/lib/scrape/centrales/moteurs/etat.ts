/**
 * Pourquoi un moteur n'est pas interrogé, quand il ne l'est pas.
 *
 * Quarante-huit des soixante-neuf centrales du parc n'ont pas de connecteur.
 * Leur écrire un fichier chacune pour n'y mettre qu'une phrase serait autant de
 * fichiers vides ; les laisser sans phrase serait pire, parce qu'un zéro
 * sans motif se lit comme « rien de disponible ». Or elles ne sont pas
 * quarante-huit cas différents : ce sont douze moteurs, et l'empêchement est le
 * même pour toutes celles qui partagent le leur.
 *
 * Ces phrases sortent du sondage du 13 septembre 2026. Elles disent un état,
 * pas une fatalité : le jour où l'un de ces moteurs s'ouvre, il gagne un
 * module et ses centrales un fichier. `robots.txt` n'est plus une raison
 * d'absence.
 *
 * Une centrale qui a son propre fichier n'en passe pas par ici : son motif à
 * elle est plus précis, et il gagne.
 */

import type { MoteurCentrale } from "../types";

/**
 * L'état d'un moteur, en une phrase lisible à l'écran.
 *
 * Chaque phrase tient trois choses : ce que le moteur a répondu quand on l'a
 * appelé, et pourquoi cela ne fait pas un prix quand on ne l'appelle pas.
 * `robots.txt` n'entre plus dans cette phrase : il est lu, jamais bloquant.
 *
 * Elles commencent en minuscule et sans nommer la centrale : `chercher.server.ts`
 * les fait suivre « Centrale <nom> : », et une phrase qui se préfixerait
 * elle-même donnerait « Centrale Les 2 Alpes : Centrale Les 2 Alpes… ».
 */
const ETAT: Record<MoteurCentrale, string> = {
  // Le plus gros moteur du parc : vingt-huit centrales, cinquante et une
  // stations. Sa recherche de liste datée est un `GET /booking` portant
  // `action=result` et `cid=`, forme lue dans le formulaire que
  // `www.valloire.com` rend côté serveur. Quatre d'entre elles ont leur fichier.
  Ingénie:
    "ce moteur s'interroge. Les centrales sans fichier propre passent par le connecteur commun, identifiant lu sur la page d'accueil. Un Disallow sur la recherche datée est lu et n'arrête pas. Relevé du 13 septembre 2026.",

  // Deux centrales, trois stations. Les deux échouent pour des raisons
  // opposées, et la phrase doit porter les deux.
  Diffusio:
    "ce moteur affiche ses prix sans qu'aucune date soit demandée, et n'expose aucun filtre de date, de durée ou de personnes : c'est une grille tarifaire, pas un total de séjour. Relevé du 13 septembre 2026.",

  // Une seule centrale dans le parc, La Clusaz, et elle est branchée. Cette
  // phrase ne devrait donc jamais paraître à l'écran.
  "Deskline / Feratel":
    "ce moteur est interrogeable, et la seule centrale du parc qui l'emploie est branchée. Celle-ci n'a pas encore son fichier : il lui manque sa clé d'organisation, que son site publie.",

  // Treize centrales, vingt-deux stations. Une seule s'interroge, celle de
  // Haute Maurienne Vanoise, et son fichier couvre quatre stations. Les autres
  // sont d'une autre génération.
  "Open System":
    "ces centrales tournent sur la génération ancienne du moteur, qui sert une coquille statique et laisse un composant JavaScript peupler la page : avec dates, sans dates, ou sur une autre durée, la réponse est identique à l'octet près et ne porte aucun prix. Relevé du 13 septembre 2026.",

  // Dix centrales, toutes branchées. Cette phrase ne devrait jamais paraître à
  // l'écran ; elle existe pour que le jour où une onzième apparaît au relevé
  // sans fichier, elle dise quelque chose de juste.
  MSEM:
    "ce moteur est interrogeable, mais cette centrale-ci n'a pas encore son fichier : il lui manque son identifiant de station et son canal de vente, que son site publie.",

  // Une centrale relevée sous ce nom, corrigée depuis. Plus aucune aujourd'hui.
  Elloha:
    "aucune centrale du parc ne tourne sur ce moteur : la seule qui y avait été rangée au relevé du 13 septembre 2026 est en réalité sous MSEM, et la donnée est corrigée.",

  // Trois centrales. La Plagne est branchée ; le catalogue de Chamonix ne
  // porte pas d'identifiant de logement. Praz-sur-Arly n'a pas encore de
  // fichier.
  Orchestra:
    "la seule centrale de ce moteur qui s'interroge est branchée, celle de La Plagne. Celle-ci ne l'est pas : son catalogue n'expose pas les identifiants de logement qu'il faut pour lui demander un prix. Relevé du 13 septembre 2026.",

  // Une centrale, Pralognan-la-Vanoise, et elle est branchée.
  Arkiane:
    "ce moteur est interrogeable, et la seule centrale du parc qui l'emploie est branchée. Celle-ci n'a pas encore son fichier.",

  // Une centrale, Les Arcs, et elle est branchée.
  iResa:
    "ce moteur est interrogeable, et la seule centrale du parc qui l'emploie est branchée. Celle-ci n'a pas encore son fichier.",

  // Une centrale, Les Karellis.
  Resalys:
    "ce moteur n'a pas encore de connecteur. Relevé du 13 septembre 2026.",

  // Une centrale, les vallées de Gavarnie.
  Tourinsoft:
    "ce n'est pas un moteur de réservation mais un système d'information touristique : il sert une grille tarifaire, sans date ni durée. Un prix qui ne bouge pas avec le séjour n'est pas un total de séjour. Relevé du 13 septembre 2026.",

  // Six centrales. Ce n'est pas un échec d'identification, c'est un constat.
  aucun:
    "ce site n'a pas de moteur de réservation : il renseigne sur les hébergements sans les vendre. Cherché le 13 septembre 2026, et l'absence est le résultat.",

  inconnu:
    "le moteur de cette centrale n'a pas été identifié au relevé du 13 septembre 2026. Sans savoir ce qui la fait tourner, il n'y a rien à interroger de sûr.",
};

/** La phrase d'un moteur. Toujours renseignée, y compris pour « inconnu ». */
export function etatDuMoteur(moteur: MoteurCentrale): string {
  return ETAT[moteur];
}
