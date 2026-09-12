/** Passage du référentiel de 231 stations (dépôt, Skiinfo) à celui de 320
 *  (classeur France Montagnes × OpenSkiMap + dépôt).
 *
 *  **Garantie : aucun identifiant ne bouge.** La clé primaire reste celle du
 *  dépôt partout où la station y existe — 195 appariées au classeur, 36 que le
 *  classeur ne décrit pas. Les `stationId` déjà enregistrés dans les séjours
 *  (`skitrack-stay`) et les logements continuent tous de résoudre, sans
 *  migration de données à exécuter. `stationMigration.test.ts` le vérifie sur
 *  les 231.
 *
 *  Les 89 stations que seul le classeur décrit portent un identifiant dérivé de
 *  leur nom. Aucune ne réutilise un identifiant du dépôt : le test l'assure
 *  aussi, faute de quoi un séjour ancien pointerait sur une autre station.
 *
 *  ## `le-granier-vallee-des-entremonts`
 *
 *  Le classeur nomme « Le Granier » une station de Saint-Pierre-de-Chartreuse,
 *  à 9,2 km du « Le Granier » du dépôt, qui désigne le domaine de la vallée des
 *  Entremonts. Deux lieux, deux domaines : ce ne sont pas la même station.
 *
 *  Elle reste donc au référentiel comme station du dépôt seul. Son identifiant,
 *  sa fiche, sa photo, son mix Skiinfo et ses altitudes IGN sont inchangés ;
 *  tout ce qui pointe dessus continue de fonctionner. Ce qu'elle n'a pas, et
 *  n'aura pas tant que le classeur ne la décrira pas : domaine, remontées,
 *  tronçons par couleur, distance à la piste. L'écran affiche ces absences.
 *  Rien n'est supprimé. */

import { STATIONS, type Station } from "./stations.ts";
import depotRows from "./stations.data.json" with { type: "json" };

type DepotRow = { id: string };

/** Les 231 identifiants du référentiel d'origine. */
export const DEPOT_IDS: string[] = (depotRows as DepotRow[]).map((r) => r.id);

const BY_ID = new Map(STATIONS.map((s) => [s.id, s]));

/** Sens 1 — un identifiant enregistré avant la bascule vers la station d'après.
 *  Renvoie `null` si l'identifiant n'a jamais existé, jamais une autre station. */
export function stationFromStoredId(storedId: string): Station | null {
  return BY_ID.get(storedId) ?? null;
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
