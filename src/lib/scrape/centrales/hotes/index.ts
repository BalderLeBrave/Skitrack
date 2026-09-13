/**
 * Le catalogue des connecteurs, un par centrale.
 *
 * **Un fichier par centrale**, et ce fichier n'est importé que d'ici. C'est ce
 * qui tient la promesse d'isolement : une centrale qui change de gabarit se
 * corrige dans son fichier, et les autres ne bougent pas. Le module de moteur
 * qu'elles partagent (`../moteurs/`) porte ce qui leur est commun, pour qu'une
 * correction d'analyseur ne soit pas à recopier sept fois.
 *
 * **Toutes les centrales n'ont pas de fichier.** L'audit en a relevé
 * soixante-neuf ; vingt en ont un ici : les sept d'Open System, les dix de
 * MSEM et les trois d'Ingénie. Quatorze de ces vingt s'interrogent vraiment,
 * et couvrent vingt-trois stations.
 *
 * Pour les quarante-neuf autres centrales, `registre.ts` sait déjà nommer le
 * moteur, et `moteurs/etat.ts` dit en une phrase ce qui empêche ce moteur-là :
 * de quoi expliquer leur silence sans écrire autant de fichiers vides. Un
 * fichier s'écrit le jour où la centrale devient interrogeable, ou le jour où
 * son empêchement mérite d'être raconté en détail.
 */

import type { Connecteur } from "../types";
import { alpeDHuez } from "./alpeDHuez";
import { alpeDuGrandSerre } from "./alpeDuGrandSerre";
import { ax3Domaines } from "./ax3Domaines";
import { correnconEnVercors } from "./correnconEnVercors";
import { devoluy } from "./devoluy";
import { flaine } from "./flaine";
import { foretBlanche } from "./foretBlanche";
import { hauteMaurienneVanoise } from "./hauteMaurienneVanoise";
import { isola2000 } from "./isola2000";
import { lesContamines } from "./lesContamines";
import { lesSybelles } from "./lesSybelles";
import { montclar } from "./montclar";
import { paysDesEcrins } from "./paysDesEcrins";
import { piauEngaly } from "./piauEngaly";
import { saintFrancoisLongchamp } from "./saintFrancoisLongchamp";
import { sainteFoyTarentaise } from "./sainteFoyTarentaise";
import { valberg } from "./valberg";
import { valmeinier } from "./valmeinier";
import { valmorel } from "./valmorel";
import { vars } from "./vars";

const TOUS: readonly Connecteur[] = [
  // Open System, génération moderne : interrogeable.
  hauteMaurienneVanoise,
  // MSEM : interrogeables.
  alpeDHuez,
  saintFrancoisLongchamp,
  sainteFoyTarentaise,
  correnconEnVercors,
  vars,
  flaine,
  isola2000,
  paysDesEcrins,
  valberg,
  montclar,
  // Ingénie : les trois centrales du moteur dont robots.txt laisse passer.
  foretBlanche,
  lesContamines,
  valmeinier,
  // Open System, génération ancienne, et sites sans moteur interrogeable.
  lesSybelles,
  devoluy,
  alpeDuGrandSerre,
  valmorel,
  ax3Domaines,
  piauEngaly,
];

const PAR_HOTE = new Map(TOUS.map((c) => [c.host, c]));

/** Le connecteur d'un hôte, ou `null` s'il n'en a pas encore. */
export function connecteurPour(host: string): Connecteur | null {
  return PAR_HOTE.get(host) ?? null;
}

/** Tous les connecteurs écrits, pour les tests et les écrans de contrôle. */
export function connecteurs(): readonly Connecteur[] {
  return TOUS;
}

/** Les centrales réellement interrogeables aujourd'hui. */
export function connecteursActifs(): readonly Connecteur[] {
  return TOUS.filter((c) => typeof c.chercher === "function");
}
