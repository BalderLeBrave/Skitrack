/**
 * Capacité « prix datés » de la centrale de réservation d'une station.
 *
 * Skitrack ne peut affirmer un tarif pour *ces* dates que si un extracteur
 * dédié lit la SERP. Sinon l'utilisateur obtient au mieux un lien pré-rempli.
 * Ce module le dit avant la recherche, pour ne pas laisser croire que toute
 * centrale se comporte comme Chamonix ou La Plagne.
 *
 * Sources de vérité :
 * - Ceto/Orchestra : connecteurs `ceto-*`
 * - Ingénie : connecteur `station-web` (Playwright, formulaire)
 * - `docs/diagnostics/centrales-reconnaissance.md` (27 hôtes Ingénie, 2 robots)
 */

export type CentralPriceMode = 'live' | 'link' | 'none' | 'blocked'

export interface CentralCapability {
  mode: CentralPriceMode
  /** Hôte de la centrale, si connue. */
  host: string | null
  /**
   * Libellé court pour l'UI.
   */
  labelFr: string
  labelEn: string
  /** Connecteur technique attendu, si live. */
  connector?: string
  /** Famille technique, pour diagnostics. */
  family?: 'orchestra' | 'ingenie' | 'other'
}

/** Orchestra / Ceto — extracteur HTML sans navigateur. */
const CETO_HOSTS: Record<string, string> = {
  'booking.chamonix.com': 'ceto-chamonix',
  'www.booking.chamonix.com': 'ceto-chamonix',
  'reservations.meribel.net': 'ceto-meribel',
  'www.reservations.meribel.net': 'ceto-meribel',
  'www.laplagneresort.com': 'ceto-plagne',
  'laplagneresort.com': 'ceto-plagne',
  'megeve-booking.com': 'ceto-megeve',
  'www.megeve-booking.com': 'ceto-megeve'
}

/**
 * Ingénie confirmés (`centrales-reconnaissance.md` + sondage 2026-08).
 * Le connecteur `station-web` remplit le formulaire et lit la SERP (ld+json + prix DOM).
 */
const INGENIE_HOSTS = new Set([
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
  'reservation.samoens.com'
])

/** robots.txt `Disallow: /` — le connecteur refuse explicitement. */
const ROBOTS_BLOCKED = new Set([
  'reservation.combloux.com',
  'reservation.montgenevre.com'
])

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Qualifie la centrale pointée par l'URL officielle / de réservation.
 */
export function centralCapabilityOf(officialUrl: string | null | undefined): CentralCapability {
  const host = hostOf(officialUrl)
  if (!host) {
    return {
      mode: 'none',
      host: null,
      labelFr: 'pas de centrale connue',
      labelEn: 'no known booking desk'
    }
  }

  if (ROBOTS_BLOCKED.has(host)) {
    return {
      mode: 'blocked',
      host,
      family: 'other',
      labelFr: 'centrale interdite au relevé automatique (robots.txt)',
      labelEn: 'desk blocks automated scans (robots.txt)'
    }
  }

  const ceto = CETO_HOSTS[host]
  if (ceto) {
    return {
      mode: 'live',
      host,
      connector: ceto,
      family: 'orchestra',
      labelFr: 'prix pour vos dates (Orchestra)',
      labelEn: 'prices for your dates (Orchestra)'
    }
  }

  if (INGENIE_HOSTS.has(host)) {
    return {
      mode: 'live',
      host,
      connector: 'station-web',
      family: 'ingenie',
      labelFr: 'prix pour vos dates (Ingénie)',
      labelEn: 'prices for your dates (Ingénie)'
    }
  }

  return {
    mode: 'link',
    host,
    family: 'other',
    labelFr: 'lien vers la centrale (prix à confirmer sur le site)',
    labelEn: 'link to the desk (confirm price on the site)'
  }
}

/** Liste des hôtes Ingénie connus — utile pour diagnostics / tests. */
export function knownIngenieHosts(): string[] {
  return [...INGENIE_HOSTS].sort()
}
