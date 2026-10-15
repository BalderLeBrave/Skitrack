/**
 * Ce qui manque à une annonce, lu comme l'écran le lit : une seule règle pour
 * l'échantillon réel (`scripts/echantillon/logements.ts`) et la vérification
 * des collecteurs sur leurs fixtures.
 *
 * - `description` : aucune description publiée (`descriptionDe`) ;
 * - `equipements` : aucune liste d'équipements à montrer (`equipementsDe`
 *   vide) — qu'elle n'ait pas été lue, ou qu'une fiche lue n'en publie pas ;
 * - `chambres`, `capacite`, `gps`, `photo`, `prix`, `url` : les trous de
 *   `completudeOf`.
 *
 * Module pur, chargé tel quel par `node --experimental-strip-types`.
 */

import type { Listing } from "../listings.ts";
import { completudeOf } from "./completude.ts";
import { descriptionDe, equipementsDe } from "./ficheEnrichie.ts";

export const CHAMPS = [
  "description",
  "equipements",
  "chambres",
  "capacite",
  "gps",
  "photo",
  "prix",
  "url",
] as const;
export type Champ = (typeof CHAMPS)[number];

/** Les champs qui manquent à l'annonce, dans l'ordre de `CHAMPS`. */
export function manquesDe(l: Listing): Champ[] {
  const trous = new Set<string>(completudeOf(l).trous);
  const manque = new Set<Champ>();
  if (!descriptionDe(l)) manque.add("description");
  if (!equipementsDe(l)?.length) manque.add("equipements");
  for (const c of CHAMPS) if (trous.has(c)) manque.add(c);
  return CHAMPS.filter((c) => manque.has(c));
}
