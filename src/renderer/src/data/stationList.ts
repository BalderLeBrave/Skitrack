/**
 * Retrouver la station qui a absorbé une entrée du référentiel.
 *
 * ## Ce qui a disparu d'ici, et pourquoi
 *
 * Ce module tenait `collapseToStations` : le référentiel livré mélangeait
 * stations, domaines et secteurs — « Val Thorens » et « Val Thorens – Orelle »
 * y étaient deux lignes — et il fallait les replier pour obtenir une liste de
 * stations. La liste vient désormais du catalogue France Montagnes
 * (`data/catalogue.ts`), qui **est** une liste de stations : le repli n'a plus
 * d'objet, et le garder aurait signifié maintenir deux façons de fabriquer la
 * même liste.
 *
 * ## Ce qui reste
 *
 * Une station du catalogue garde dans `members` les identifiants des entrées du
 * référentiel qui la décrivaient. Sans cela, un logement importé sous « Val
 * Thorens – Orelle » deviendrait orphelin le jour où la station s'appelle
 * « Val Thorens ». C'est ce que cette fonction relit.
 */

import type { Domain } from './referentiel'

/** La station qui a absorbé cet identifiant d'entrée, s'il en existe une. */
export function stationOwning(stations: Domain[], entryId: number | null | undefined): Domain | undefined {
  if (entryId == null) return undefined
  return stations.find((s) => s.id === entryId || (s.members ?? []).includes(entryId))
}
