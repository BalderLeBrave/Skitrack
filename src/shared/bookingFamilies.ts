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
  // Plus de `blocked` : c'était un verdict `robots.txt` déguisé en moteur de
  // réservation. La règle appartient à `providers/station/robots.ts`, et ce
  // registre ne porte que ce qu'il sait dire — qui opère la centrale.
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
  // Open System (opensystem_du / widget OS — pas de datedeb Ingénie)
  'reservation.la-toussuire.com': 'opensystem',
  'reservation.ledevoluy.com': 'opensystem',
  'reservation.ax-ski.com': 'opensystem',
  'www.labresse.net': 'opensystem',
  'www.valmorel.com': 'opensystem',
  'www.valfrejus.com': 'opensystem',
  'www.n-py.com': 'opensystem',
  'reservation.n-py.com': 'opensystem',
  'reservation.valmorel.com': 'opensystem',
  // Ublo / MSEM (React + services.msem.tech)
  'reservation.alpedhuez.com': 'ublo',
  'www.saintefoy-reservation.com': 'ublo',
  'saintefoy-reservation.com': 'ublo',
  'reservation.saintfrancoislongchamp.com': 'ublo',
  // Autres
  'www.sancy.com': 'sancy',
  /*
   * Isola 2000 : **Ublo / MSEM**, et non Yoplanning.
   *
   * La reconnaissance empreinte la page d'accueil, où le widget Yoplanning des
   * activités est visible ; le moteur de *réservation*, lui, est un widget MSEM
   * embarqué. Mesuré le 2026-08-26 : il appelle
   * `services.msem.tech/api/lodging/resort/386/ISOLA`, exactement comme les
   * trois autres centrales Ublo.
   */
  'isola2000.com': 'ublo',
  'www.isola2000.com': 'ublo',
  /*
   * Valberg et Pays des Écrins : **Ublo / MSEM**, mesuré 2026-09-01 sur
   * l'XHR du widget (`lodging/resort/665/OT-665`, `lodging/resort/30015/PDE`).
   * La home WordPress ne dit pas le moteur ; l'API si.
   */
  'www.valberg.com': 'ublo',
  'valberg.com': 'ublo',
  'www.paysdesecrins.com': 'ublo',
  'paysdesecrins.com': 'ublo',
  'www.alpes-sudlocations.com': 'elloha',
  /*
   * Ces deux hôtes portaient la famille `blocked` — c'est-à-dire un verdict
   * `robots.txt`, pas un moteur. Le registre disait « on ne les relève pas »
   * là où il est censé dire « voici qui les opère », et il le disait à un
   * endroit qui n'a pas autorité sur la règle.
   *
   * `robots.txt` appartient à `providers/station/robots.ts` et à lui seul. Ce
   * qui reste ici est le moteur, mesuré par `npm run centrales:recon` le
   * 2026-08-26 : Combloux répond en Ceto / Orchestra, Montgenèvre en Open
   * System.
   */
  'reservation.combloux.com': 'orchestra',
  'reservation.montgenevre.com': 'opensystem'
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
