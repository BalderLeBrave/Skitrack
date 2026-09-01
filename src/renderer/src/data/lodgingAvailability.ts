/**
 * Ce qu'on sait vraiment de la disponibilité d'une annonce.
 *
 * ## La prémisse fausse qu'il a fallu défaire
 *
 * Le code partait d'une conviction écrite en toutes lettres dans
 * `airbnbMerge.ts` : « une recherche Airbnb ne renvoie que ce qui est libre aux
 * dates demandées ». C'est faux. Airbnb remplit sa grille de résultats avec des
 * annonces qu'il ne peut pas vendre pour ces dates-là — et il le signale d'une
 * seule façon : **il n'affiche pas de prix**.
 *
 * Le relevé récupérait donc ces annonces avec un `total` à zéro, et l'écran les
 * rangeait dans le même casier que les hébergements OpenStreetMap, qui n'ont
 * légitimement pas de prix parce qu'OSM n'en publie aucun. Les deux
 * s'affichaient en « carte-redirection », bouton « Voir sur Airbnb » compris.
 * Sauf qu'une carte OSM ouvre une **recherche**, alors qu'une annonce Airbnb non
 * tarifée ouvre **cette annonce, à ces dates** — c'est-à-dire la page « Ces
 * dates ne sont pas disponibles ».
 *
 * ## Le principe retenu
 *
 * Une plateforme tarife ce qu'elle peut vendre. Un prix relevé pour des dates
 * précises est donc la seule preuve de disponibilité dont l'application
 * dispose ; tout le reste est une supposition, et se dit comme telle.
 *
 * Aucun champ nouveau n'est stocké : le verdict se déduit de ce que
 * `Lodging` porte déjà — `total`, `priceCheckIn`/`priceCheckOut` (les dates
 * auxquelles ce prix a été relevé) et `missingSince`. Une donnée dérivable ne
 * mérite pas d'être enregistrée : enregistrée, elle finirait par contredire les
 * champs dont elle sort.
 *
 * ## Ce que ce module ne fait pas
 *
 * Il n'interroge rien. Confirmer une disponibilité demande un relevé aux bonnes
 * dates, et ce relevé passe par le geste de l'utilisateur — voir
 * `useAirbnbRecheck`. Ce module dit seulement, de ce qu'on a déjà, ce qui est
 * prouvé et ce qui ne l'est pas.
 */

import type { Lodging } from './lodgings'
import { srcOf } from './lodgings'

export type AvailabilityStatus =
  /** Une source a tarifé cette annonce pour exactement ces dates. */
  | 'confirmed'
  /** Listée, mais sans prix à ces dates — ou tarifée pour d'autres dates. */
  | 'unconfirmed'
  /** Un relevé couvrant ces dates ne la retrouve plus : très probablement prise. */
  | 'gone'
  /** La carte ne prétend rien : porte d'entrée, ou saisie à la main. */
  | 'unrated'

/** Pourquoi la disponibilité n'est pas confirmée. Sert de clé i18n à l'écran. */
export type AvailabilityReason = 'unpriced' | 'other_dates' | 'gone' | null

export interface AvailabilityVerdict {
  status: AvailabilityStatus
  reason: AvailabilityReason
}

export interface Stay {
  checkIn: string
  checkOut: string
}

/** TTL par défaut du schéma d'acceptation : un relevé plus vieux est à revalider. */
export const AVAILABILITY_TTL_MS = 6 * 60 * 60 * 1000

/**
 * Carte qui n'ouvre pas une annonce datée.
 *
 * Deux cas, et un seul test pour les deux : l'absence d'URL (catalogue
 * de démonstration, rien derrière) et l'URL de **recherche** que produit
 * `buildAirbnbSearchUrl` pour les hébergements OpenStreetMap — `/s/<lieu>/homes`.
 * Une recherche ne peut pas être « indisponible à ces dates » : elle renvoie ce
 * qu'elle trouve. La juger sur la disponibilité n'aurait pas de sens.
 */
export function isDoorway(lodging: Pick<Lodging, 'url'>): boolean {
  if (!lodging.url) return true
  return /\/s\/[^/]+\/homes/.test(lodging.url)
}

/**
 * Verdict de disponibilité d'une annonce pour un séjour donné.
 *
 * Les imports manuels ne sont pas jugés. L'utilisateur les a saisis lui-même :
 * aucune source ne les a confrontés à ces dates, et les masquer comme
 * « non disponibles » ferait disparaître sa propre saisie sous un filtre qu'il
 * n'a pas relié à elle.
 */
export function availabilityOf(lodging: Lodging, stay: Stay): AvailabilityVerdict {
  if (isDoorway(lodging) || srcOf(lodging) === 'Import manuel') {
    return { status: 'unrated', reason: null }
  }

  // Absente du dernier relevé couvrant ce séjour : c'est le signal le plus fort
  // dont on dispose, il passe donc avant le prix — un tarif relevé la semaine
  // dernière ne prouve rien contre une absence constatée aujourd'hui.
  if (
    lodging.missingSince != null &&
    lodging.missingSince.checkIn === stay.checkIn &&
    lodging.missingSince.checkOut === stay.checkOut
  ) {
    return { status: 'gone', reason: 'gone' }
  }

  const priced = lodging.total > 0
  const sameStay =
    lodging.priceCheckIn === stay.checkIn && lodging.priceCheckOut === stay.checkOut

  if (priced && sameStay) {
    if (
      lodging.scannedAt != null &&
      Date.now() - lodging.scannedAt > AVAILABILITY_TTL_MS
    ) {
      return { status: 'unconfirmed', reason: 'other_dates' }
    }
    return { status: 'confirmed', reason: null }
  }

  // Listée par la source, mais sans tarif pour ces dates. C'est la forme sous
  // laquelle Airbnb annonce qu'il ne peut pas vendre ce bien à ces dates-là.
  if (!priced) return { status: 'unconfirmed', reason: 'unpriced' }

  // Tarifée, mais pour d'autres dates. Le prix est périmé — et la disponibilité
  // avec lui, puisqu'elle n'a jamais été observée pour le séjour en cours.
  return { status: 'unconfirmed', reason: 'other_dates' }
}

/** Raccourci de lecture : cette annonce est-elle affichable comme réservable ? */
export function isBookable(lodging: Lodging, stay: Stay): boolean {
  const { status } = availabilityOf(lodging, stay)
  return status === 'confirmed' || status === 'unrated'
}
