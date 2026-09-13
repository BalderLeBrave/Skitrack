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
 * Ces phrases sortent du sondage du 13 septembre 2026, qui a relu le
 * `robots.txt` de chaque hôte et appelé, quand il était permis, ce qui pouvait
 * porter un prix. Elles disent un état, pas une fatalité : le jour où l'un de
 * ces moteurs s'ouvre, il gagne un module et ses centrales un fichier.
 *
 * Une centrale qui a son propre fichier n'en passe pas par ici : son motif à
 * elle est plus précis, et il gagne.
 */

import type { MoteurCentrale } from "../types";

/**
 * L'état d'un moteur, en une phrase lisible à l'écran.
 *
 * Chaque phrase tient trois choses : ce que `robots.txt` autorise, ce que le
 * moteur a répondu quand on l'a appelé, et pourquoi cela ne fait pas un prix.
 * L'ordre compte : la permission d'abord, parce que c'est elle qui décide si on
 * avait le droit d'essayer.
 *
 * Elles commencent en minuscule et sans nommer la centrale : `chercher.server.ts`
 * les fait suivre « Centrale <nom> : », et une phrase qui se préfixerait
 * elle-même donnerait « Centrale Les 2 Alpes : Centrale Les 2 Alpes… ».
 */
const ETAT: Record<MoteurCentrale, string> = {
  // Le plus gros moteur du parc : vingt-huit centrales, cinquante-quatre
  // stations. Sa recherche de liste datée est un `GET /booking` portant
  // `action=searchAjax` et `cid=`, forme lue dans le formulaire que
  // `www.valloire.com` rend côté serveur. Trois d'entre elles ont leur fichier.
  Ingénie:
    "sa recherche datée est fermée par robots.txt sur vingt-deux des vingt-huit centrales du moteur, dont celle-ci. Les cinq qui l'autorisent sont interrogées, et elles répondent. Relevé du 13 septembre 2026.",

  // Deux centrales, trois stations. Les deux échouent pour des raisons
  // opposées, et la phrase doit porter les deux.
  Diffusio:
    "ce moteur affiche ses prix sans qu'aucune date soit demandée, et n'expose aucun filtre de date, de durée ou de personnes : c'est une grille tarifaire, pas un total de séjour. Là où une recherche datée existe, robots.txt nomme un par un les paramètres du formulaire pour les interdire. Relevé du 13 septembre 2026.",

  // Une seule centrale dans le parc, La Clusaz, et elle est branchée. Cette
  // phrase ne devrait donc jamais paraître à l'écran.
  "Deskline / Feratel":
    "ce moteur est interrogeable, et la seule centrale du parc qui l'emploie est branchée. Celle-ci n'a pas encore son fichier : il lui manque sa clé d'organisation, que son site publie.",

  // Sept centrales, seize stations, dont quatre déjà branchées par le fichier
  // de Haute Maurienne Vanoise. Celles qui restent sont d'une autre génération.
  "Open System":
    "ces centrales tournent sur la génération ancienne du moteur, qui sert une coquille statique et laisse un composant JavaScript peupler la page : avec dates, sans dates, ou sur une autre durée, la réponse est identique à l'octet près et ne porte aucun prix. Relevé du 13 septembre 2026.",

  // Six centrales, toutes branchées. Cette phrase ne devrait jamais paraître à
  // l'écran ; elle existe pour que le jour où une septième apparaît au relevé
  // sans fichier, elle dise quelque chose de juste.
  MSEM:
    "ce moteur est interrogeable, mais cette centrale-ci n'a pas encore son fichier : il lui manque son identifiant de station et son canal de vente, que son site publie.",

  // Une centrale relevée sous ce nom, corrigée depuis. Plus aucune aujourd'hui.
  Elloha:
    "aucune centrale du parc ne tourne sur ce moteur : la seule qui y avait été rangée au relevé du 13 septembre 2026 est en réalité sous MSEM, et la donnée est corrigée.",

  // Trois centrales, dont La Plagne et Chamonix. Le moteur répond et ses prix
  // sont datés ; c'est sa forme qui ne convient pas à une recherche en direct.
  Orchestra:
    "ce moteur répond et ses prix suivent la durée, mais il n'a pas de recherche groupée ouverte : sa page de résultats est fermée par robots.txt, et le prix ne s'obtient qu'un logement à la fois. Interroger une station entière demanderait des dizaines d'appels par recherche, ce qui n'est pas une façon de traiter un serveur. Relevé du 13 septembre 2026.",

  // Une centrale, Pralognan-la-Vanoise, et elle est branchée.
  Arkiane:
    "ce moteur est interrogeable, et la seule centrale du parc qui l'emploie est branchée. Celle-ci n'a pas encore son fichier.",

  // Une centrale, Les Arcs, et elle est branchée.
  iResa:
    "ce moteur est interrogeable, et la seule centrale du parc qui l'emploie est branchée. Celle-ci n'a pas encore son fichier.",

  // Une centrale, Les Karellis.
  Resalys:
    "son robots.txt ferme la recherche datée. Relevé du 13 septembre 2026.",

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
