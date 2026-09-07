/**
 * Extracteurs DOM — barrel.
 *
 * Un fichier par source sous `extractors/`. Modifier Booking n’ouvre pas Gîtes.
 */
export type { RawCard } from './extractors/types'
export { extractBookingCards } from './extractors/booking'
export { extractExpediaFamilyCards } from './extractors/expedia'
export { extractGitesCards } from './extractors/gites'
export { extractCozycozyCards } from './extractors/cozycozy'
export { extractVrboCards } from './extractors/vrbo'
