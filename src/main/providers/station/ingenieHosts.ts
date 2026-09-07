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
  'www.ballons-hautes-vosges.com',
  'www.gerardmer-reservation.net',
  'reservation.lesgets.com',
  'reservation.avoriaz.com',
  'reservation.lescarroz.com',
  'reservation.lescontamines.com',
  'reservation.samoens.com',
  'booking.prazsurarly.com',
  'reservation.auris-en-oisans.fr',
  'reservation.bareges.com',
  'reservation.chamberymontagnes.com',
  'reservation.le-corbier.com',
  'reservation.les7laux.com',
  'reservation.matheysine-tourisme.com',
  'reservation.paysdegex-montsjura.com',
  'reservation.saintsorlindarves.com',
  'reservation.valleesdegavarnie.com',
  'reservation.vaujany.com',
  'reservation.villard-reculas.com',
  'reservation.villarddelans-correnconenvercors.com'
])

/*
 * Il y avait ici `ROBOTS_BLOCKED_HOSTS` — Combloux et Montgenèvre, écartés
 * parce que leur `robots.txt` publiait « Disallow: / ». C'était un troisième
 * juge de la règle, après `robots.ts` et la liste du renderer, et le seul des
 * trois qui empêchait réellement le relevé.
 *
 * `robots.txt` ne se décide qu'à un endroit : `station/robots.ts`, appelé par
 * le connecteur juste avant le relevé (et par `listing.ts` pour l'import par
 * URL). Une liste d'hôtes recopiée à la main ne peut pas suivre un fichier qui
 * change, et celle-ci contredisait déjà le module.
 */

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
 * - Orchestra / Open System / Ublo → non, ce n'est pas notre moteur
 * - hôte Ingénie connu → oui
 * - sous-domaine reservation/booking/resa, hors familles connues → oui
 * - sinon → non (évite 15 s de Chromium sur un site institutionnel)
 *
 * `robots.txt` ne se juge plus ici : c'est `station/robots.ts`, interrogé par
 * le connecteur au moment du relevé.
 */
export function shouldAttemptIngenie(url: string): { attempt: boolean; reason?: string } {
  const host = hostOf(url)
  if (!host) return { attempt: false, reason: 'url-invalide' }
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
