/**
 * Hash déterministe d'une annonce et d'une offre.
 *
 * `listingHash` ignore tracking, fragment, alias mobile et `www`.
 * `offerHash` y ajoute dates et voyageurs : deux séjours du même bien
 * restent deux offres.
 */

import { createHash } from 'node:crypto'
import { canonicalizeUrl } from '@shared/listingCanon'

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

export function generateListingHash(url: string, keepQueryKeys?: readonly string[]): string {
  const canonical = canonicalizeUrl(url, keepQueryKeys)
  const q = canonical.query.replace(/^\?/, '')
  return sha256(`v1|${canonical.host}|${canonical.path}${q ? `|${q}` : ''}`)
}

export function generateOfferHash(
  listingHash: string,
  checkIn: string,
  checkOut: string,
  guests: number
): string {
  return sha256(`v1|${listingHash}|${checkIn}|${checkOut}|${guests}`)
}
