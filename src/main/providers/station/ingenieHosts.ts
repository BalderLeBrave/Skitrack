/**
 * Hôtes Ingénie connus — utilisés pour décider d'ouvrir Playwright ou non.
 *
 * Aligné sur `docs/diagnostics/centrales-reconnaissance.md` et
 * `renderer/.../centralCapability.ts`. Un hôte absent n'est pas « en panne » :
 * on tente quand même si l'URL ressemble à une centrale (`reservation.*`),
 * sinon on évite d'allumer Chromium pour rien.
 */

export const INGENIE_HOSTS = new Set([
  'reservation.les2alpes.com',
  'reservation.areches-beaufort.com',
  'reservation.valdarly-montblanc.com',
  'reservation.haute-maurienne-vanoise.com',
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
  'www.labresse.net',
  'www.ballons-hautes-vosges.com',
  'www.gerardmer-reservation.net',
  'reservation.lesgets.com',
  'reservation.avoriaz.com',
  'reservation.lescarroz.com',
  'reservation.lescontamines.com',
  'reservation.samoens.com',
  'booking.prazsurarly.com',
  'reservation.alpedhuez.com',
  'reservation.auris-en-oisans.fr',
  'reservation.ax-ski.com',
  'reservation.bareges.com',
  'reservation.chamberymontagnes.com',
  'reservation.la-toussuire.com',
  'reservation.le-corbier.com',
  'reservation.ledevoluy.com',
  'reservation.les7laux.com',
  'reservation.matheysine-tourisme.com',
  'reservation.paysdegex-montsjura.com',
  'reservation.saintfrancoislongchamp.com',
  'reservation.saintsorlindarves.com',
  'reservation.valleesdegavarnie.com',
  'reservation.vaujany.com',
  'reservation.villard-reculas.com',
  'reservation.villarddelans-correnconenvercors.com',
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
 * - Ceto/Orchestra → non (connecteur dédié)
 * - robots total → non
 * - hôte Ingénie connu → oui
 * - sous-domaine reservation/booking/resa → oui (heuristique)
 * - sinon → non (évite 15 s de Chromium sur un site institutionnel)
 */
export function shouldAttemptIngenie(url: string): { attempt: boolean; reason?: string } {
  const host = hostOf(url)
  if (!host) return { attempt: false, reason: 'url-invalide' }
  if (ROBOTS_BLOCKED_HOSTS.has(host)) {
    return { attempt: false, reason: 'robots' }
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
