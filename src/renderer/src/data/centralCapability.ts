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
 * - Ublo / MSEM : connecteur `ublo-msem` (JSON offers)
 * - Open System : connecteur `opensystem` (JSONP / HTML)
 * - `docs/diagnostics/centrales-reconnaissance.md`
 */

import { bookingFamilyOf, isOpenSystemLiveHost } from '@shared/bookingFamilies'
import type { TranslationKey } from '@/i18n'

export type CentralPriceMode = 'live' | 'link' | 'none' | 'blocked'

export interface CentralCapability {
  mode: CentralPriceMode
  /** Hôte de la centrale, si connue. */
  host: string | null
  /**
   * Libellé court pour l'UI, en clé de catalogue.
   *
   * Ce module portait deux champs par libellé, un français et un anglais, et
   * `LodgingsPage` n'affichait que le français : l'interface anglaise rendait
   * du français, et la moitié anglaise ne servait à rien. Une clé passée à
   * `translate()` fait ce que la paire prétendait faire.
   */
  labelKey: TranslationKey
  /** Nom du moteur injecté dans `{src}` — une marque, jamais traduite. */
  labelSrc?: string
  /** Connecteur technique attendu, si live. */
  connector?: string
  /** Famille technique, pour diagnostics. */
  family?: 'orchestra' | 'ingenie' | 'opensystem' | 'ublo' | 'locvacances' | 'eliberty' | 'other'
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
  'www.megeve-booking.com': 'ceto-megeve',
  'booking.prazsurarly.com': 'ceto-praz',
  'www.booking.prazsurarly.com': 'ceto-praz'
}

/**
 * Ingénie confirmés (`centrales-reconnaissance.md` + sondage 2026-08).
 * Le connecteur `station-web` remplit le formulaire et lit la SERP (ld+json + prix DOM).
 */
const INGENIE_HOSTS = new Set([
  'booking.valdisere.com',
  'fr.locationlesmenuires.com',
  'fr.locationsaintmartin.com',
  'resa.saintlary.com',
  'reservation.areches-beaufort.com',
  'reservation.avoriaz.com',
  'reservation.bareges.com',
  'reservation.chamberymontagnes.com',
  'reservation.courchevel.com',
  'reservation.larosiere.net',
  'reservation.labresse.net',
  'reservation.lecollet.com',
  'reservation.les2alpes.com',
  'reservation.lescarroz.com',
  'reservation.lescontamines.com',
  'reservation.lesgets.com',
  'reservation.lesorres.com',
  'reservation.lessaisies.com',
  'reservation.orcieres.com',
  // Pays de Gex, Gavarnie, Grand-Bornand : absents volontairement — leur
  // moteur Ingénie n'est pas atteignable par notre parcours (short form sans
  // datedeb sur / et /booking, sonde du 2026-08-24). Mode `link`.
  'reservation.samoens.com',
  'reservation.serre-chevalier.com',
  'reservation.tignes.net',
  'reservation.valdarly-montblanc.com',
  'reservation.valdisere.com',
  'reservation.valthorens.com',
  'www.ballons-hautes-vosges.com',
  'www.chamrousse.com',
  'www.gerardmer-reservation.net',
  'www.peisey-vallandry.com',
  'www.risoul.com',
  'www.saintsorlindarves.com',
  'www.valdallos.com',
  'www.valloire.com',
  'www.valmeinier-reservation.com',
  'www.chatelreservation.com',
  'www.vercors-experience.com',
  'www.lansenvercors.com',
  'www.lesrousses-reservation.com',
  'lesrousses-reservation.com',
  'www.manigod.com'
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
      labelKey: 'cap_no_desk'
    }
  }

  if (ROBOTS_BLOCKED.has(host)) {
    return {
      mode: 'blocked',
      host,
      family: 'other',
      labelKey: 'cap_robots_blocked'
    }
  }

  const ceto = CETO_HOSTS[host]
  if (ceto) {
    return {
      mode: 'live',
      host,
      connector: ceto,
      family: 'orchestra',
      labelKey: 'cap_live_prices',
      labelSrc: 'Orchestra'
    }
  }

  if (INGENIE_HOSTS.has(host)) {
    return {
      mode: 'live',
      host,
      connector: 'station-web',
      family: 'ingenie',
      labelKey: 'cap_live_prices',
      labelSrc: 'Ingénie'
    }
  }

  const family = bookingFamilyOf(host)
  if (family === 'ublo') {
    return {
      mode: 'live',
      host,
      connector: 'ublo-msem',
      family: 'ublo',
      labelKey: 'cap_live_prices',
      labelSrc: 'Ublo'
    }
  }

  if (family === 'opensystem') {
    if (isOpenSystemLiveHost(host)) {
      return {
        mode: 'live',
        host,
        connector: 'opensystem',
        family: 'opensystem',
        labelKey: 'cap_live_prices',
        labelSrc: 'Open System'
      }
    }
    return {
      mode: 'link',
      host,
      family: 'opensystem',
      labelKey: 'cap_link_no_catalogue'
    }
  }

  if (family === 'locvacances') {
    return {
      mode: 'live',
      host,
      connector: 'locvacances',
      family: 'locvacances',
      labelKey: 'cap_live_prices',
      labelSrc: 'LocVacances'
    }
  }

  if (family === 'sancy' || family === 'elloha' || family === 'eliberty' || family === 'yoplanning') {
    return {
      mode: 'link',
      host,
      family: family === 'eliberty' ? 'eliberty' : 'other',
      labelKey: 'cap_link_confirm'
    }
  }

  return {
    mode: 'link',
    host,
    family: 'other',
    labelKey: 'cap_link_confirm'
  }
}

/** Liste des hôtes Ingénie connus — utile pour diagnostics / tests. */
export function knownIngenieHosts(): string[] {
  return [...INGENIE_HOSTS].sort()
}
