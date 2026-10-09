/**
 * Pourquoi un moteur n'est pas interrogé, quand il ne l'est pas.
 *
 * Trente-trois des soixante-neuf centrales du parc n'ont pas de connecteur.
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

  // Super-Besse et le Mont-Dore. Le site affiche une grille sans date.
  // Grand Tourmalet n'est plus ici : sa recherche datée est le widget Alliance.
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

  // Praz de Lys a son fichier : la recherche Elloha répond, le montant n'est
  // pas un total de séjour. Cette phrase ne s'affiche donc plus pour lui.
  Elloha:
    "ce moteur a une recherche datée. Le montant qu'il publie est étiqueté « à partir de », et il ne suit pas la durée de façon régulière. Ce n'est pas un total de séjour. Relevé du 9 octobre 2026.",

  // Quatre centrales. La Plagne a sa table. Combloux et Praz-sur-Arly n'ont
  // pas de table : `chercherOrchestraHote` lit l'accueil. Chamonix a son
  // fichier, et cette phrase ne s'affiche donc plus pour lui.
  Orchestra:
    "ce moteur s'interroge. Sans fichier propre, les destinations sont celles que la page d'accueil publie, préfixe de chemin compris. Un catalogue sans identifiant de logement n'est pas compté comme un séjour vide. Relevé du 13 septembre 2026.",

  // Une centrale, Pralognan-la-Vanoise, et elle est branchée.
  Arkiane:
    "ce moteur est interrogeable, et la seule centrale du parc qui l'emploie est branchée. Celle-ci n'a pas encore son fichier.",

  // Une centrale, Les Arcs, et elle est branchée.
  iResa:
    "ce moteur est interrogeable, et la seule centrale du parc qui l'emploie est branchée. Celle-ci n'a pas encore son fichier.",

  // Les Karellis a son fichier. Le moteur reste nommé pour une centrale
  // qui apparaîtrait sans le sien.
  Resalys:
    "ce moteur n'a pas encore de connecteur qui lise un total de séjour. Relevé du 9 octobre 2026.",

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
