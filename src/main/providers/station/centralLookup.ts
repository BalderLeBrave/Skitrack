/**
 * Branche `centrals.ts` au moteur.
 *
 * `CENTRALS` n'était importé par aucun fichier de `src/` : table générée,
 * recon hors moteur. Ce module est l'import vivant — `aggregateResults`
 * l'appelle pour poser un `reasonCode` sur un `station-web` muet, au lieu
 * d'un zéro silencieux.
 *
 * On n'invente pas d'adapter pour un hôte `not_wired`. On le nomme.
 */

import { CENTRALS, OTA_HOSTS, type Central } from './centrals'
import { shouldAttemptIngenie } from './ingenieHosts'
import {
  isCetoHost,
  isChamonixCentral,
  isMegeveCentral,
  isMeribelCentral,
  isPlagneCentral
} from '../ceto/hosts'
import { isUbloHost } from '../ublo/hosts'
import { isOpenSystemHost } from '../opensystem/hosts'
import { isDesklineHost } from '../deskline/hosts'
import { isLocvacancesHost } from '../locvacances/hosts'
import { isDiffusioHost } from '../diffusio/hosts'
import { isTourinsoftHost } from '../tourinsoft/hosts'
import { classifyProviderError, type ReasonCode } from '@shared/reasonCodes'

export type CentralFamily =
  | 'ingenie'
  | 'ceto'
  | 'ublo'
  | 'opensystem'
  | 'deskline'
  | 'locvacances'
  | 'diffusio'
  | 'tourinsoft'
  | 'ota'
  | 'not_wired'

export function hostOfOfficialUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function centralsForHost(host: string): Central[] {
  const h = host.toLowerCase()
  return CENTRALS.filter((c) => c.host.toLowerCase() === h)
}

export function familyOfHost(host: string): CentralFamily {
  const h = host.toLowerCase()
  if (OTA_HOSTS.includes(h) || centralsForHost(h).some((c) => c.kind === 'ota')) return 'ota'
  if (isCetoHost(h) || isCetoHost(`https://${h}/`)) return 'ceto'
  if (isUbloHost(h) || isUbloHost(`https://${h}/`)) return 'ublo'
  if (isOpenSystemHost(h) || isOpenSystemHost(`https://${h}/`)) return 'opensystem'
  if (isDesklineHost(h) || isDesklineHost(`https://${h}/`)) return 'deskline'
  if (isLocvacancesHost(h) || isLocvacancesHost(`https://${h}/`)) return 'locvacances'
  if (isDiffusioHost(h) || isDiffusioHost(`https://${h}/`)) return 'diffusio'
  if (isTourinsoftHost(h) || isTourinsoftHost(`https://${h}/`)) return 'tourinsoft'
  const gate = shouldAttemptIngenie(`https://${h}/`)
  if (gate.attempt) return 'ingenie'
  return 'not_wired'
}

/**
 * Pourquoi `station-web` a rendu zéro carte.
 *
 * `delegated` n'est pas une panne : Ceto / Ublo / Open System / Deskline /
 * LocVacances / Diffusio / Tourinsoft ont leur propre connecteur, et `station-web` s'efface.
 * `not_wired` est le trou à combler par un discovery, pas par un parseur inventé.
 */
export function emptyStationReason(officialUrl: string | null | undefined): ReasonCode {
  if (!officialUrl) return 'no_official_url'
  const host = hostOfOfficialUrl(officialUrl)
  if (!host) return 'no_official_url'
  const family = familyOfHost(host)
  if (
    family === 'ceto' ||
    family === 'ublo' ||
    family === 'opensystem' ||
    family === 'deskline' ||
    family === 'locvacances' ||
    family === 'diffusio'
  ) {
    return 'delegated'
  }
  if (family === 'tourinsoft') return 'not_wired'
  if (family === 'not_wired') return 'not_wired'
  if (family === 'ota') return 'delegated'
  return 'empty_inventory'
}

/**
 * Un connecteur spécialiste s'applique-t-il à cette URL officielle ?
 *
 * Live Les 2 Alpes : `ceto-chamonix` etc. rendaient 0 + F1 alors qu'ils
 * n'avaient rien à interroger (hôte Ingénie). Ce n'est pas un fetch raté.
 */
export function specialistApplies(provider: string, officialUrl: string): boolean {
  switch (provider) {
    case 'ceto-chamonix':
      return isChamonixCentral(officialUrl)
    case 'ceto-meribel':
      return isMeribelCentral(officialUrl)
    case 'ceto-plagne':
      return isPlagneCentral(officialUrl)
    case 'ceto-megeve':
      return isMegeveCentral(officialUrl)
    case 'ublo-msem':
      return isUbloHost(officialUrl)
    case 'opensystem':
      return isOpenSystemHost(officialUrl)
    case 'deskline':
      return isDesklineHost(officialUrl)
    case 'locvacances':
      return isLocvacancesHost(officialUrl)
    case 'diffusio':
      return isDiffusioHost(officialUrl)
    default:
      return false
  }
}

export function emptyProviderReason(
  provider: string,
  officialUrl: string | null | undefined,
  error: string | null
): ReasonCode {
  if (error) return classifyProviderError(error)
  if (provider === 'booking') return 'not_wired'
  if (provider === 'station-web') return emptyStationReason(officialUrl)
  if (
    provider.startsWith('ceto-') ||
    provider === 'ublo-msem' ||
    provider === 'opensystem' ||
    provider === 'deskline' ||
    provider === 'locvacances' ||
    provider === 'diffusio'
  ) {
    if (!officialUrl || !specialistApplies(provider, officialUrl)) return 'delegated'
    return '0_after_parse'
  }
  return '0_after_parse'
}

/** Force l'évaluation de `CENTRALS` : la table n'est plus morte. */
export function centralsLoaded(): number {
  return CENTRALS.length
}
