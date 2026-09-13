/**
 * Pourquoi un moteur n'est pas interrogé, quand il ne l'est pas.
 *
 * Cinquante-six des soixante-sept centrales du parc n'ont pas de connecteur.
 * Leur écrire un fichier chacune pour n'y mettre qu'une phrase serait cinquante-
 * six fichiers vides ; les laisser sans phrase serait pire, parce qu'un zéro
 * sans motif se lit comme « rien de disponible ». Or elles ne sont pas
 * cinquante-six cas différents : ce sont six moteurs, et l'empêchement est le
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
  // `www.valloire.com` rend côté serveur.
  Ingénie:
    "sa recherche datée est fermée par robots.txt sur vingt-deux des vingt-huit centrales du moteur. Sur les six qui l'autorisent, elle a été appelée et le service ne répond pas : « Une erreur s'est produite » pour la liste, et 503 « Site en maintenance ! » pour la fiche datée. Relevé du 13 septembre 2026.",

  // Deux centrales, trois stations. Les deux échouent pour des raisons
  // opposées, et la phrase doit porter les deux.
  Diffusio:
    "ce moteur affiche ses prix sans qu'aucune date soit demandée, et n'expose aucun filtre de date, de durée ou de personnes : c'est une grille tarifaire, pas un total de séjour. Là où une recherche datée existe, robots.txt nomme un par un les paramètres du formulaire pour les interdire. Relevé du 13 septembre 2026.",

  // Une centrale, deux stations. Rien ne l'interdit, et c'est le seul moteur
  // dont l'empêchement soit purement technique.
  "Deskline / Feratel":
    "rien ne l'interdit, ni sur le site ni sur les hôtes du moteur, mais sa recherche est une application JavaScript qui se peint dans un Shadow DOM : le HTML servi ne porte pas un seul prix, et il n'y a donc pas d'adresse à interroger. Relevé du 13 septembre 2026.",

  // Sept centrales, seize stations, dont quatre déjà branchées par le fichier
  // de Haute Maurienne Vanoise. Celles qui restent sont d'une autre génération.
  "Open System":
    "ces centrales tournent sur la génération ancienne du moteur, qui sert une coquille statique et laisse un composant JavaScript peupler la page : avec dates, sans dates, ou sur une autre durée, la réponse est identique à l'octet près et ne porte aucun prix. Relevé du 13 septembre 2026.",

  // Quatre centrales, toutes branchées. Cette phrase ne devrait jamais paraître
  // à l'écran ; elle existe pour que le jour où une cinquième apparaît au
  // relevé sans fichier, elle dise quelque chose de juste.
  Ublo:
    "ce moteur est interrogeable, mais cette centrale-ci n'a pas encore son fichier : il lui manque son identifiant de station et son canal de vente, que son site publie.",

  // Une centrale relevée sous ce nom, corrigée depuis. Plus aucune aujourd'hui.
  Elloha:
    "aucune centrale du parc ne tourne sur ce moteur : la seule qui y avait été rangée au relevé du 13 septembre 2026 est en réalité sous MSEM, et la donnée est corrigée.",

  inconnu:
    "le moteur de cette centrale n'a pas été identifié au relevé du 13 septembre 2026. Sans savoir ce qui la fait tourner, il n'y a rien à interroger de sûr.",
};

/** La phrase d'un moteur. Toujours renseignée, y compris pour « inconnu ». */
export function etatDuMoteur(moteur: MoteurCentrale): string {
  return ETAT[moteur];
}
