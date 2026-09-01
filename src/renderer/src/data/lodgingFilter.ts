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
import { isBookable, isDoorway, type Stay } from './lodgingAvailability'
import { inRange } from './range'

export interface LodgingFilterCriteria {
  /** Taille du groupe : `travelers` couchages au minimum. */
  travelers: number
  /**
   * Chambres au minimum.
   *
   * `0` est la valeur de repos, et elle porte un nom : un studio n'a aucune
   * chambre, exiger « 0 au minimum » ne peut écarter personne. Le seuil ne
   * mord qu'à partir de 1 — auparavant il ne mordait qu'à partir de 2, parce
   * que 1 était le plancher du réglage et devait donc rester neutre. Il ne
   * l'est plus : demander une chambre écarte bien les studios.
   */
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
  /**
   * Afficher aussi les annonces qui **n'annoncent ni capacité ni pièces**.
   *
   * `false` par défaut : demander 8 personnes et 4 chambres puis recevoir un
   * studio est le défaut que ce drapeau existe pour éviter. `true` les
   * réaffiche, sur demande explicite, avec leur mention à l'écran.
   */
  includeUnannounced: boolean
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
 * L'ordre des cas est la règle :
 *
 * 0. le seuil est nul — « studio » — et rien n'est à comparer ;
 * 1. l'annonce annonce des **chambres** → on compare des chambres ;
 * 2. sinon elle annonce des **pièces** — le cas de toutes les centrales — → on
 *    compare des pièces, seuil converti ;
 * 3. sinon elle ne dit rien, et « non annoncé » n'est pas « ne convient pas ».
 */
export type PartyVerdict = 'convient' | 'trop-petit' | 'non-annonce'

export interface Demand {
  guests: number
  bedrooms: number
  datesSet: boolean
}

/**
 * Chambres comparables, après autopsie des sources.
 *
 * - `ch > 0` : la source a publié des chambres (Booking, Airbnb quand le
 *   champ est lu) → on les prend telles quelles.
 * - sinon `rooms` : convention française des centrales, « N pièces » =
 *   séjour + (N-1) chambres. Un studio est un 1 pièce → 0 chambre.
 * - sinon `null` : la source s'est tue. Ce n'est pas un zéro.
 */
export function normalizedBedrooms(listing: Lodging): number | null {
  if (listing.ch > 0) return listing.ch
  if (listing.rooms != null && listing.rooms > 0) return Math.max(0, listing.rooms - 1)
  return null
}

export function isStudioListing(listing: Lodging): boolean {
  if (listing.type.toLowerCase().includes('studio')) return true
  if (listing.rooms === 1 && !(listing.ch > 0)) return true
  return normalizedBedrooms(listing) === 0
}

/**
 * Filtre strict du schéma d'acceptation.
 *
 * `null` ne passe plus. Un studio ne passe que si la demande est ≤ 1 chambre
 * et que la capacité tient. Intégré dans `matchesLodgingFilters` (chemin UI),
 * pas une fonction orpheline.
 */
export function matchesDemand(listing: Lodging, demand: Demand): boolean {
  const guest_capacity_max = listing.pers > 0 ? listing.pers : null
  const bedrooms = normalizedBedrooms(listing)
  if (guest_capacity_max == null || bedrooms == null) return false

  const availability_status = listing.availabilityStatus
  if (availability_status === 'unavailable' || availability_status === 'listing_gone') return false
  if (demand.datesSet && !isDoorway(listing) && availability_status !== 'available' && !(listing.total > 0)) {
    return false
  }

  if (guest_capacity_max < demand.guests) return false
  if (demand.bedrooms > 0) {
    if (isStudioListing(listing)) return demand.bedrooms <= 1
    if (bedrooms < demand.bedrooms) return false
  }
  return true
}

/**
 * Trois verdicts, parce qu'il y a trois situations et non deux.
 *
 * `convient` : l'annonce publie de quoi juger, et elle passe.
 * `trop-petit` : elle publie de quoi juger, et elle ne passe pas.
 * `non-annonce` : **elle ne publie rien**, et il n'y a rien à juger.
 *
 * Le troisième cas était fondu dans le premier — « non annoncé n'est pas ne
 * convient pas ». La règle se défend pour une annonce isolée ; elle ne tient
 * plus à l'échelle observée : sur un relevé de Val d'Isère, 25 annonces sur 39
 * ne publient aucune capacité et 27 ne publient ni chambres ni pièces. Une
 * demande de 8 personnes et 4 chambres en laissait passer 32 sur 39, dont des
 * studios — le filtre ne filtrait plus, et rien ne le disait.
 *
 * On ne bascule pas pour autant vers « non annoncé = écarté » en silence : ce
 * serait cacher des annonces qui conviennent peut-être. Le verdict est rendu,
 * l'écran écarte par défaut, les compte, et sait les réafficher.
 */
export function partyVerdict(
  lodging: Lodging,
  criteria: Pick<LodgingFilterCriteria, 'travelers' | 'rooms'>
): PartyVerdict {
  const { pers, ch, rooms } = lodging

  /*
   * Chaque axe demandé est jugé séparément, et **un refus l'emporte sur une
   * absence**. L'ordre compte : une annonce qui publie « 1 chambre » quand on
   * en demande quatre est démontrablement trop petite, que sa capacité soit
   * publiée ou non. La classer « non annoncée » sur le seul motif que sa
   * capacité manque la ferait réapparaître dès qu'on réaffiche les
   * non-annoncées — alors qu'on sait qu'elle ne convient pas.
   */
  let ignore = false

  if (criteria.travelers > 0) {
    if (pers > 0) {
      if (pers < criteria.travelers) return 'trop-petit'
    } else if (lodging.fitsGuests != null && lodging.fitsGuests >= criteria.travelers) {
      // Pas de capacité publiée, mais la source a rendu l'annonce pour une
      // recherche d'au moins ce groupe : Airbnb, Booking et les centrales
      // filtrent leurs résultats par le nombre de voyageurs demandé. C'est un
      // plancher relevé, pas une capacité — demander plus que le groupe du
      // relevé le rend muet, et l'annonce redevient non jugeable.
    } else {
      ignore = true
    }
  }

  if (criteria.rooms > 0) {
    // Chambres si l'annonce en publie, pièces sinon — jamais l'une traduite en
    // l'autre. Voir `minRoomsFor`.
    if (ch > 0) {
      if (ch < criteria.rooms) return 'trop-petit'
    } else if (rooms != null && rooms > 0) {
      if (rooms < minRoomsFor(criteria.rooms)) return 'trop-petit'
    } else {
      ignore = true
    }
  }

  return ignore ? 'non-annonce' : 'convient'
}

/**
 * L'annonce accueille-t-elle le groupe demandé ?
 *
 * Conservé pour les appelants qui n'ont qu'un booléen à donner — le sélecteur
 * des écrans transversaux. `includeNonAnnonce` dit ce qu'on fait du troisième
 * verdict, et **le défaut est de l'écarter** : un écran qui additionne des
 * coûts ne doit pas classer premier un studio dont on ignore la capacité.
 */
export function fitsParty(
  lodging: Lodging,
  criteria: Pick<LodgingFilterCriteria, 'travelers' | 'rooms'>,
  includeNonAnnonce = false
): boolean {
  const v = partyVerdict(lodging, criteria)
  return v === 'convient' || (v === 'non-annonce' && includeNonAnnonce)
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

  const demand: Demand = {
    guests: criteria.travelers,
    bedrooms: criteria.rooms,
    datesSet: Boolean(stay.checkIn && stay.checkOut)
  }
  if (!criteria.includeUnannounced) {
    if (!matchesDemand(lodging, demand)) return false
  } else if (!fitsParty(lodging, criteria, true)) {
    return false
  }
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
