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
import { isCetoHost } from '../ceto/hosts'
import { isUbloHost } from '../ublo/hosts'
import { isOpenSystemHost } from '../opensystem/hosts'
import { isDesklineHost } from '../deskline/hosts'
import { isLocvacancesHost } from '../locvacances/hosts'
import { isDiffusioHost } from '../diffusio/hosts'
import { isTourinsoftHost } from '../tourinsoft/hosts'
import type { ReasonCode } from '@shared/reasonCodes'

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

/** Force l'évaluation de `CENTRALS` : la table n'est plus morte. */
export function centralsLoaded(): number {
  return CENTRALS.length
}
