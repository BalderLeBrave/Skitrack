/**
 * Hôtes Ingénie connus — utilisés pour décider d'ouvrir Playwright ou non.
 *
 * Aligné sur `docs/diagnostics/centrales-reconnaissance.md` et le classeur
 * des sélecteurs. Un hôte Open System / Ublo / Orchestra n'est pas « en panne
 * Ingénie » : on ne lance pas Chromium pour un moteur qui n'est pas le nôtre
 * (Alpe d'Huez, La Bresse, La Toussuire…).
 */

import { isKnownNonIngenie } from '@shared/bookingFamilies'

export const INGENIE_HOSTS = new Set([
  'reservation.les2alpes.com',
  'reservation.areches-beaufort.com',
  'reservation.valdarly-montblanc.com',
  'reservation.larosiere.net',
  'reservation.lessaisies.com',
  'fr.locationsaintmartin.com',
  'www.valloire.com',
  'www.valmeinier-reservation.com',
  'reservation.courchevel.com',
  'fr.locationlesmenuires.com',
  'reservation.valthorens.com',
  'www.saintsorlindarves.com',
  'www.peisey-vallandry.com',
  'reservation.tignes.net',
  'reservation.valdisere.com',
  'booking.valdisere.com',
  'www.chamrousse.com',
  'reservation.lecollet.com',
  'reservation.orcieres.com',
  'www.risoul.com',
  'reservation.lesorres.com',
  'reservation.serre-chevalier.com',
  'www.valdallos.com',
  'resa.saintlary.com',
  'www.ballons-hautes-vosges.com',
  'www.gerardmer-reservation.net',
  'reservation.lesgets.com',
  'reservation.avoriaz.com',
  'reservation.lescarroz.com',
  'reservation.lescontamines.com',
  'reservation.samoens.com',
  'reservation.bareges.com',
  'reservation.chamberymontagnes.com',
  'reservation.paysdegex-montsjura.com',
  'reservation.valleesdegavarnie.com',
  'reservation.labresse.net'
])

/** robots.txt Disallow: / — ne jamais lancer le navigateur. */
export const ROBOTS_BLOCKED_HOSTS = new Set([
  'reservation.combloux.com',
  'reservation.montgenevre.com'
])

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Faut-il tenter Playwright pour cette URL de centrale ?
 *
 * - Orchestra / Open System / Ublo / robots total → non
 * - hôte Ingénie connu → oui
 * - sous-domaine reservation/booking/resa, hors familles connues → oui
 * - sinon → non (évite 15 s de Chromium sur un site institutionnel)
 */
export function shouldAttemptIngenie(url: string): { attempt: boolean; reason?: string } {
  const host = hostOf(url)
  if (!host) return { attempt: false, reason: 'url-invalide' }
  if (ROBOTS_BLOCKED_HOSTS.has(host)) {
    return { attempt: false, reason: 'robots' }
  }
  if (isKnownNonIngenie(host) || isKnownNonIngenie(url)) {
    return { attempt: false, reason: 'hors-ingenie' }
  }
  if (INGENIE_HOSTS.has(host)) return { attempt: true }
  if (
    host.startsWith('reservation.') ||
    host.startsWith('reservations.') ||
    host.startsWith('resa.') ||
    host.startsWith('booking.')
  ) {
    return { attempt: true }
  }
  return { attempt: false, reason: 'hors-ingenie' }
}
