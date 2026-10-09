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
 * soixante-neuf ; vingt-neuf en ont un ici. Vingt-sept d'entre eux s'interrogent
 * vraiment et couvrent quarante-neuf stations ; les deux autres racontent un
 * empêchement qui leur est propre, et que la phrase de leur moteur dirait mal.
 *
 * Pour les quarante autres centrales, `registre.ts` sait déjà nommer le
 * moteur. Celles d'Ingénie sans fichier passent par `chercherIngenieHote`.
 * Celles d'Orchestra sans fichier passent par `chercherOrchestraHote` : les
 * destinations sont les liens que l'accueil publie. Pour les autres,
 * `moteurs/etat.ts` dit en une phrase ce qui empêche encore — plus jamais un
 * Disallow.
 */

import type { Connecteur } from "../types";
import { alpeDHuez } from "./alpeDHuez";
import { alpeDuGrandSerre } from "./alpeDuGrandSerre";
import { ax3Domaines } from "./ax3Domaines";
import { chamonix } from "./chamonix";
import { combloux } from "./combloux";
import { correnconEnVercors } from "./correnconEnVercors";
import { devoluy } from "./devoluy";
import { flaine } from "./flaine";
import { foretBlanche } from "./foretBlanche";
import { hauteMaurienneVanoise } from "./hauteMaurienneVanoise";
import { isola2000 } from "./isola2000";
import { laClusaz } from "./laClusaz";
import { laPlagne } from "./laPlagne";
import { lesArcs } from "./lesArcs";
import { lesContamines } from "./lesContamines";
import { lesSybelles } from "./lesSybelles";
import { montclar } from "./montclar";
import { montgenevre } from "./montgenevre";
import { paysDesEcrins } from "./paysDesEcrins";
import { piauEngaly } from "./piauEngaly";
import { pralognan } from "./pralognan";
import { saintFrancoisLongchamp } from "./saintFrancoisLongchamp";
import { sainteFoyTarentaise } from "./sainteFoyTarentaise";
import { valfrejus } from "./valfrejus";
import { valberg } from "./valberg";
import { valdAllos } from "./valdAllos";
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
  // Deskline / Feratel : la seule du parc, et la mieux servie.
  laClusaz,
  // Arkiane, iResa et Orchestra : une centrale chacun, plus Combloux dont
  // les destinations se lisent sur l'accueil.
  pralognan,
  lesArcs,
  laPlagne,
  combloux,
  // Ingénie : quatre centrales avec cid relevé. Les autres passent par
  // chercherIngenieHote dans chercher.server.ts, cid lu sur l'accueil.
  foretBlanche,
  lesContamines,
  valmeinier,
  valdAllos,
  // Open System, génération ancienne : le widget publie un loginAPI.
  lesSybelles,
  devoluy,
  ax3Domaines,
  montgenevre,
  valmorel,
  // Valfréjus : la page datée que son site publie sur Haute Maurienne.
  valfrejus,
  // Sites dont l'empreinte n'est qu'un widget panier, sans recherche datée.
  alpeDuGrandSerre,
  piauEngaly,
  // Chamonix : les identifiants sont sur la page de résultats, le prix sur
  // le calendrier.
  chamonix,
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