/**
 * Famille technique de chaque centrale — d’après le classeur des sélecteurs
 * (`docs/sources/centrales-selecteurs.xlsx`) et la reconnaissance 2026-08.
 *
 * Le prix séjour ne se lit pas de la même façon partout :
 *
 * - **Ingénie** : SERP souvent « à partir de » ; le montant daté est
 *   `searchAjax` + `detailPrestationsAjax` sur la fiche (`#tarifs`).
 *   Deux UI de moteur : datepicker (`input[name=datedeb]`) ou menus
 *   (`select[name=datedeb]` + `type_date`). Occupants : `select[name=adultes]`
 *   (2 Alpes, Tignes…) ou `select[name=personnes]` (Arêches, Val Thorens…).
 * - **Orchestra / Ceto** : SERP HTML datée, connecteurs `ceto-*`.
 * - **Open System, Ublo, Eliberty, Elloha, Yoplanning, Sancy** : autre moteur.
 *   Le connecteur Ingénie ne les interroge pas — un Playwright à vide
 *   (Alpe d’Huez, La Bresse) ne produit pas de tarif, seulement un timeout.
 */

export type BookingFamily =
  | 'ingenie'
  | 'orchestra'
  | 'opensystem'
  | 'ublo'
  | 'eliberty'
  | 'elloha'
  | 'yoplanning'
  | 'sancy'
  | 'blocked'
  | 'unknown'

/** Hôtes dont le moteur n’est **pas** Ingénie — relevé inspecteur + recon. */
export const NON_INGENIE_HOSTS: Record<string, BookingFamily> = {
  // Orchestra / Ceto
  'booking.chamonix.com': 'orchestra',
  'www.booking.chamonix.com': 'orchestra',
  'reservations.meribel.net': 'orchestra',
  'www.reservations.meribel.net': 'orchestra',
  'www.laplagneresort.com': 'orchestra',
  'laplagneresort.com': 'orchestra',
  'megeve-booking.com': 'orchestra',
  'www.megeve-booking.com': 'orchestra',
  'booking.prazsurarly.com': 'orchestra',
  'www.booking.prazsurarly.com': 'orchestra',
  // Open System (opensystem_du / widget OS — pas de datedeb Ingénie)
  'reservation.la-toussuire.com': 'opensystem',
  'reservation.ledevoluy.com': 'opensystem',
  'reservation.ax-ski.com': 'opensystem',
  'www.labresse.net': 'opensystem',
  'www.valmorel.com': 'opensystem',
  'www.valfrejus.com': 'opensystem',
  'www.n-py.com': 'opensystem',
  'reservation.n-py.com': 'opensystem',
  // Open System (IIS / gadget.open-system.fr) — relevé live 2026-08-21 :
  // page aspx + InstancePanier, pas de datedeb Ingénie.
  'reservation.le-corbier.com': 'opensystem',
  'reservation.les7laux.com': 'opensystem',
  'reservation.vaujany.com': 'opensystem',
  'reservation.auris-en-oisans.fr': 'opensystem',
  'reservation.matheysine-tourisme.com': 'opensystem',
  'reservation.saintsorlindarves.com': 'opensystem',
  'reservation.haute-maurienne-vanoise.com': 'opensystem',
  // Ublo / MSEM (channel OT-702 relevé sur la page)
  'reservation.villard-reculas.com': 'ublo',
  'reservation.villarddelans-correnconenvercors.com': 'ublo',
  'reservation.valmorel.com': 'opensystem',
  // Ublo / MSEM (React + services.msem.tech)
  'reservation.alpedhuez.com': 'ublo',
  'www.saintefoy-reservation.com': 'ublo',
  'saintefoy-reservation.com': 'ublo',
  'reservation.saintfrancoislongchamp.com': 'ublo',
  // Autres
  'www.sancy.com': 'sancy',
  'isola2000.com': 'ublo',
  'www.isola2000.com': 'ublo',
  'www.valberg.com': 'ublo',
  'valberg.com': 'ublo',
  'www.montclar.com': 'ublo',
  'montclar.com': 'ublo',
  'www.paysdesecrins.com': 'ublo',
  'paysdesecrins.com': 'ublo',
  'www.alpes-sudlocations.com': 'elloha',
  // robots.txt Disallow: /
  'reservation.combloux.com': 'blocked',
  'reservation.montgenevre.com': 'blocked'
}

function hostOf(urlOrHost: string): string | null {
  const raw = urlOrHost.trim().toLowerCase()
  if (!raw) return null
  try {
    if (raw.includes('://') || raw.startsWith('//')) {
      return new URL(raw.startsWith('//') ? `https:${raw}` : raw).hostname
    }
    if (raw.includes('/') || raw.includes('?')) {
      return new URL(`https://${raw}`).hostname
    }
    return raw

  } catch {
    return null
  }
}

export function bookingFamilyOf(urlOrHost: string): BookingFamily {
  const host = hostOf(urlOrHost)
  if (!host) return 'unknown'
  const known = NON_INGENIE_HOSTS[host]
  if (known) return known
  return 'unknown'
}

export function isKnownNonIngenie(urlOrHost: string): boolean {
  const host = hostOf(urlOrHost)
  return Boolean(host && NON_INGENIE_HOSTS[host] && NON_INGENIE_HOSTS[host] !== 'ingenie')
}
