/** Passage du référentiel de 231 stations (dépôt, Skiinfo) à celui de 315
 *  (classeur France Montagnes × OpenSkiMap + dépôt).
 *
 *  **Garantie : aucun identifiant ne bouge.** La clé primaire reste celle du
 *  dépôt partout où la station y existe — 196 appariées au classeur, 35 que le
 *  classeur ne décrit pas. Les `stationId` déjà enregistrés dans les séjours
 *  (`skitrack-stay`) et les logements continuent tous de résoudre, sans
 *  migration de données à exécuter. `stationMigration.test.ts` le vérifie sur
 *  les 231.
 *
 *  Les 84 stations que seul le classeur décrit portent un identifiant dérivé de
 *  leur nom. Aucune ne réutilise un identifiant du dépôt : le test l'assure
 *  aussi, faute de quoi un séjour ancien pointerait sur une autre station.
 *
 *  ## Identifiants retirés
 *
 *  Le 26 septembre 2026, quatre lignes du classeur reconnues en double d'une
 *  autre station ont été écartées (« Sainte-Foy Station », « Saint-Pancrace
 *  les Bottières », « Praloup », « Espace Aubrac »), et la ligne « Lus la
 *  Croix Haute » appariée à la station du dépôt `lus-la-jarjatte`. Leurs cinq
 *  identifiants ne sont plus au référentiel, mais ils ont pu être enregistrés
 *  entre-temps : un relevé du propriétaire porte `espace-aubrac`. Ils se
 *  résolvent donc vers la station gardée (`IDS_RETIRES`, lu par
 *  `stationById`), jamais vers rien. Aucun identifiant du dépôt n'est
 *  concerné.
 *
 *  ## Stations fermées
 *
 *  Le 30 septembre 2026, Le Grand Puy (fermé pour de bon, remontées démontées)
 *  est sorti du référentiel sous ses deux identifiants : `le-grand-puy`
 *  (dépôt) et `seyne-les-alpes` (classeur). Voir `STATIONS_FERMEES`. Sans
 *  station qui la remplace, un identifiant enregistré ne résout plus rien :
 *  `stationFromStoredId` rend `null`, jamais une autre station. Les 230 autres
 *  identifiants du dépôt résolvent comme avant.
 *
 *  ## `le-granier-vallee-des-entremonts`
 *
 *  Le classeur nomme « Le Granier » une ligne placée à Saint-Pierre-de-
 *  Chartreuse, à 9,2 km du « Le Granier » du dépôt. On l'a longtemps tenue
 *  pour une autre station. La relecture du 5 octobre 2026 a montré le
 *  contraire : la ligne n'a aucune mesure propre (celles du Planolet, par vote
 *  de proximité) et porte la même commune. C'est un doublon : `le-granier` se
 *  résout vers `le-granier-vallee-des-entremonts` (`FUSIONS`, `villages.ts`).
 *  L'identifiant du dépôt est inchangé.
 *
 *  ## Référentiel Skiinfo (5 octobre 2026)
 *
 *  Une station est une fiche Skiinfo (`villages.ts`). Les 65 villages sans
 *  fiche propre, tous d'origine classeur, se résolvent vers leur station ; les
 *  17 lignes sans fiche ni station où les rattacher ne résolvent plus rien,
 *  comme une station fermée. Aucun identifiant du dépôt n'est concerné : les
 *  230 résolvent comme avant. */

import { STATIONS, stationById, type Station } from "./stations.ts";
import depotRows from "./stations.data.json" with { type: "json" };

type DepotRow = { id: string };

/** Les 231 identifiants du référentiel d'origine. */
export const DEPOT_IDS: string[] = (depotRows as DepotRow[]).map((r) => r.id);

/** Sens 1 — un identifiant enregistré avant la bascule vers la station d'après.
 *  Un identifiant retiré depuis (`IDS_RETIRES`), un village, un doublon ou un
 *  alias (`villages.ts`) rend la station qui le porte, sous son propre
 *  identifiant (`stationById`). Renvoie `null` si l'identifiant n'a jamais
 *  existé ou ne résout plus rien, jamais une station au hasard. */
export function stationFromStoredId(storedId: string): Station | null {
  return stationById(storedId) ?? null;
}

/** Sens 2 — la station d'après vers l'identifiant à réécrire dans les données
 *  persistées. `null` quand la station n'existait pas avant la bascule : rien à
 *  réécrire, et surtout rien à faire pointer sur un identifiant inventé. */
export function storedIdOfStation(station: Station): string | null {
  return station.origin === "depot" ? station.id : null;
}

/** Vrai quand l'identifiant vient du référentiel d'origine. */
export function isDepotId(id: string): boolean {
  return DEPOT_ID_SET.has(id);
}

const DEPOT_ID_SET = new Set(DEPOT_IDS);

/** Stations que le classeur a ajoutées : aucun séjour ne peut y pointer. */
export function addedByClasseur(): Station[] {
  return STATIONS.filter((s) => s.origin === "classeur");
}

/** Stations du dépôt que le classeur ne décrit pas, avec ce qui leur manque. */
export function outsideClasseur(): Station[] {
  return STATIONS.filter((s) => !s.inClasseur);
}
