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
 * soixante-sept ; sept en ont un ici, celles du moteur Open System. Pour les
 * soixante autres, `registre.ts` sait déjà dire quel moteur les fait tourner et
 * ce que leur `robots.txt` autorisait au relevé : c'est de quoi expliquer leur
 * silence sans écrire soixante fichiers vides. Un fichier s'écrit le jour où la
 * centrale est réellement interrogeable, ou le jour où son empêchement mérite
 * d'être raconté en détail.
 */

import type { Connecteur } from "../types";
import { alpeDuGrandSerre } from "./alpeDuGrandSerre";
import { ax3Domaines } from "./ax3Domaines";
import { devoluy } from "./devoluy";
import { hauteMaurienneVanoise } from "./hauteMaurienneVanoise";
import { lesSybelles } from "./lesSybelles";
import { piauEngaly } from "./piauEngaly";
import { valmorel } from "./valmorel";

const TOUS: readonly Connecteur[] = [
  hauteMaurienneVanoise,
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
