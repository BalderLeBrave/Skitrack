/**
 * Le filtre de l'écran Logements, extrait du sélecteur pour être testable.
 *
 * Il vivait en ligne dans `state/selectors.tsx`, où rien ne pouvait
 * l'interroger : une passe de dérivation React n'est pas un banc d'essai. Une
 * annonce sans prix y a traversé longtemps un « 4 chambres minimum » qu'elle
 * contredisait sur sa propre vignette, et aucun test ne pouvait le voir. Le
 * prédicat est donc ici, pur, et `lodgingFilter.test.ts` en couvre les cas
 * limites — c'est ce fichier qui fait autorité sur ce que l'écran montre.
 *
 * Les deux règles qui gouvernent tout le reste :
 *
 * 1. **« Non annoncé » n'est pas « ne convient pas ».** Une caractéristique
 *    absente (`0`, voir `Lodging`) laisse passer. Écarter sur une donnée que la
 *    source n'a jamais publiée viderait la liste sans rien dire — une recherche
 *    Airbnb à huit voyageurs ne rend que des biens qui les acceptent, mais ses
 *    cartes ne l'écrivent nulle part.
 * 2. **Une caractéristique annoncée engage l'annonce**, qu'elle porte un prix
 *    ou non. L'absence de tarif dispense des filtres de prix, pas des autres.
 */

import type { Lodging } from './lodgings'
import { srcOf } from './lodgings'
import { isBookable, type Stay } from './lodgingAvailability'
import { inRange } from './range'

export interface LodgingFilterCriteria {
  /** Taille du groupe : `travelers` couchages au minimum. */
  travelers: number
  /** Chambres au minimum. */
  rooms: number
  onlyAvailable: boolean
  /** Annulation gratuite uniquement. */
  freeCancelOnly: boolean
  budgetMin: number
  budgetMax: number
  /** Borne haute du curseur : atteinte, elle ne borne plus. */
  budgetCeiling: number
  distMin: number
  distMax: number
  distCeiling: number
  /** Types cochés ; liste vide = tous. */
  types: string[]
  /** Sources décochées, par libellé affiché. */
  srcOff: string[]
  /**
   * N'afficher que des prix vérifiés pour **ces** dates.
   *
   * Écarte trois familles d'annonces que l'écran signalait jusqu'ici par un
   * avertissement plutôt que par une absence : le tarif relevé pour d'autres
   * dates, le tarif partiel, et la carte sans prix. C'est une exception
   * assumée à la règle 1 de l'en-tête de ce fichier — ici, la donnée absente
   * est justement celle que l'écran promet.
   */
  confirmedPricesOnly: boolean
}

/**
 * Prix mesuré, complet, et pour les dates demandées.
 *
 * Deux preuves possibles, et il en faut **une** :
 *
 *  - la source a qualifié son tarif de complet (`total_confirmed`) ;
 *  - le tarif porte les dates du séjour en cours, ce qui vaut mesure.
 *
 * La seconde n'est pas un assouplissement de confort : le relevé Airbnb
 * (`data/airbnbMerge.ts`) date ses prix mais ne renseigne jamais
 * `priceConfidence`. Exiger le seul drapeau écartait donc la totalité des
 * annonces Airbnb, y compris celles relevées aux bonnes dates — c'est le
 * défaut qui vidait la liste quand on ne gardait qu'Airbnb.
 *
 * Ce qui reste écarté sans discussion : un « à partir de » (`partial`), un
 * tarif daté d'une autre semaine — Airbnb comme les centrales recalculent à
 * chaque période — et un prix ni qualifié ni daté, que rien n'atteste.
 */
export function hasConfirmedPrice(lodging: Lodging, stay: Stay): boolean {
  if (lodging.total <= 0) return false
  if (lodging.priceConfidence === 'partial' || lodging.priceConfidence === 'unknown') return false

  const dated = lodging.priceCheckIn != null
  if (dated) {
    return lodging.priceCheckIn === stay.checkIn && lodging.priceCheckOut === stay.checkOut
  }
  return lodging.priceConfidence === 'total_confirmed'
}

/**
 * Pièces qu'il faut au minimum pour loger un nombre de chambres demandé.
 *
 * Un « 2 pièces » est un séjour et une chambre ; un studio est un « 1 pièce »
 * et n'a aucune chambre. La demande se traduit donc `chambres + 1`, et c'est la
 * convention française de la location de montagne : demander 4 chambres, c'est
 * demander au moins un 5 pièces.
 *
 * **On traduit la demande, jamais la donnée.** C'est toute la différence avec
 * ce que refuse `providers/types.ts` : aucune annonce ne se voit attribuer un
 * nombre de chambres qu'elle n'a pas publié, et sa vignette continue d'afficher
 * « 2 pièces ». Seul le seuil change d'unité, pour être comparable à ce que la
 * centrale publie réellement.
 *
 * La convention est prudente dans le bon sens : un « 2 pièces cabine » couche
 * quatre personnes dans une chambre et une cabine, et sera compté pour une
 * chambre — la cabine n'est pas une pièce. On écarte donc plutôt qu'on ne
 * laisse passer, ce qui est le comportement attendu d'un minimum.
 */
export function minRoomsFor(bedrooms: number): number {
  return bedrooms + 1
}

/**
 * L'annonce accueille-t-elle le groupe demandé ?
 *
 * Exporté pour le test : c'est la moitié du prédicat qui a fauté, et celle dont
 * la règle est la moins évidente à relire.
 *
 * L'ordre des trois cas est la règle :
 *
 * 1. l'annonce annonce des **chambres** → on compare des chambres ;
 * 2. sinon elle annonce des **pièces** — le cas de toutes les centrales — → on
 *    compare des pièces, seuil converti ;
 * 3. sinon elle ne dit rien, et « non annoncé » n'est pas « ne convient pas ».
 */
export function fitsParty(lodging: Lodging, criteria: LodgingFilterCriteria): boolean {
  const { pers, ch, rooms } = lodging
  if (pers !== 0 && pers < criteria.travelers) return false
  if (criteria.rooms <= 1) return true
  if (ch > 0) return ch >= criteria.rooms
  if (rooms != null && rooms > 0) return rooms >= minRoomsFor(criteria.rooms)
  return true
}

/** Type et source : les deux seuls filtres qui valent pour toute annonce. */
function fitsKind(lodging: Lodging, criteria: LodgingFilterCriteria): boolean {
  return (
    (criteria.types.length === 0 || criteria.types.includes(lodging.type)) &&
    !criteria.srcOff.includes(srcOf(lodging))
  )
}

export function matchesLodgingFilters(
  lodging: Lodging,
  criteria: LodgingFilterCriteria,
  stay: Stay
): boolean {
  // Disponibilité, d'abord. Une annonce listée mais non tarifée pour ces dates
  // n'est pas réservable : l'ouvrir mène à « Ces dates ne sont pas
  // disponibles ». Les cartes non jugées — porte d'entrée OpenStreetMap, saisie
  // manuelle — traversent ce filtre sans être inquiétées. Voir
  // `data/lodgingAvailability.ts`.
  if (criteria.onlyAvailable && !isBookable(lodging, stay)) return false

  // Prix vérifié pour ces dates, avant tout le reste : une annonce dont le
  // tarif ne vaut plus n'a pas à être jugée sur son budget ni sur sa distance,
  // elle n'a simplement pas sa place dans la liste.
  if (criteria.confirmedPricesOnly && !hasConfirmedPrice(lodging, stay)) return false

  if (!fitsParty(lodging, criteria)) return false
  if (!fitsKind(lodging, criteria)) return false

  // Carte-redirection : hébergement OpenStreetMap, ou annonce vue sans tarif.
  // Elle n'a pas de prix à comparer, donc ni budget ni annulation ne la
  // concernent. La distance non plus : elle n'a pas été calculée.
  if (lodging.total <= 0) return true

  return (
    (!criteria.freeCancelOnly || lodging.annul) &&
    inRange(lodging.total, criteria.budgetMin, criteria.budgetMax, criteria.budgetCeiling) &&
    inRange(lodging.dist, criteria.distMin, criteria.distMax, criteria.distCeiling)
  )
}
