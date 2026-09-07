/**
 * Barrel des extracteurs. Chaque source a son fichier : ne pas y fusionner
 * des sélecteurs. Les tests et connecteurs importent d’ici.
 */
export type { RawCard } from './types'
export { extractBookingCards } from './booking'
export { extractExpediaFamilyCards } from './expedia'
export { extractGitesCards } from './gites'
export { extractCozycozyCards } from './cozycozy'
export { extractVrboCards } from './vrbo'
