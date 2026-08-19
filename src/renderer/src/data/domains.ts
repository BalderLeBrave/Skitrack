/**
 * Source de la liste : le catalogue France Montagnes.
 *
 * ## Ce qui a changé, et pourquoi
 *
 * La liste venait de la base OpenSkiMap du moteur local, avec le référentiel
 * livré en secours. Aucune des deux ne répondait à la question « quelles sont
 * les stations de ski françaises ? » : le référentiel décrivait 115 des 232 noms
 * publiés par France Montagnes, et le moteur indexe des domaines cartographiés,
 * pas des stations. Cent huit stations existaient sans que rien ne les décrive.
 *
 * La liste vient donc du **catalogue** — `data/franceMontagnesStations.ts`,
 * généré depuis le classeur versionné dans `docs/sources/` : 285 stations, leurs
 * coordonnées, leur altitude de village, leur domaine. Le référentiel et le
 * moteur ne sont plus des listes concurrentes ; ils **enrichissent** celle-là,
 * chacun avec ce qu'il est seul à savoir :
 *
 * * le **référentiel** porte les tarifs de forfaits relevés à la main, la
 *   saisonnalité, les glaciers et les logos (voir `data/catalogue.ts`) ;
 * * le **moteur local** porte les sites officiels et les pages de réservation
 *   que le classeur n'a pas retenus, et les glaciers qu'OpenSkiMap déclare.
 *
 * Ni l'un ni l'autre ne touche aux altitudes, aux kilomètres ni aux positions :
 * ce sont des mesures, et le classeur est la seule source qui les tienne pour
 * les 285 stations.
 *
 * ## `source` dit d'où vient l'enrichissement, pas la liste
 *
 * `moteur` signifie que le moteur local a répondu et que ses liens ont été
 * posés ; `fichier` que la liste tourne sur le seul catalogue et le référentiel
 * livré. La liste affichée, elle, est la même dans les deux cas — c'est le
 * point de ce rangement.
 */

import { api, isClientReady } from '@/api/client'
import type { DomainSummary } from '@/api/types'
import type { Domain, Referential } from './referentiel'
import { catalogueStations } from './catalogue'
import { squash } from './places'

/** Au-delà, on sort du référentiel français ; la borne est un garde-fou, pas
 *  une pagination — l'écran de recherche filtre ensuite localement. */
const MAX_DOMAINS = 1000

export type DomainSource = 'moteur' | 'fichier'

export interface LoadedDomains {
  domains: Domain[]
  source: DomainSource
  /** Renseigné quand le moteur a répondu mais qu'on a dû s'en passer. */
  warning: string | null
}

/**
 * Pose sur les stations du catalogue ce que le moteur local est seul à savoir.
 *
 * Le rapprochement se fait sur la clé de recherche du nom, puis sur celle du
 * domaine : le moteur nomme des domaines cartographiés — « Les 3 Vallées »,
 * « Grand Massif » — quand le catalogue nomme des stations, et les deux se
 * rencontrent rarement au caractère près.
 *
 * Seuls les champs vides sont remplis. Un site officiel déjà vérifié par
 * `data/stations.ts` n'est pas remplacé par celui du moteur, et aucune mesure
 * n'est touchée : le moteur ne sait rien de plus que le classeur sur les
 * altitudes, et il n'en couvre qu'une partie.
 */
function applyEngineOverlay(stations: Domain[], summaries: DomainSummary[]): Domain[] {
  const byKey = new Map<string, DomainSummary>()
  for (const summary of summaries) {
    for (const label of [summary.name, summary.linked_pass_name]) {
      if (!label) continue
      const key = squash(label)
      if (key && !byKey.has(key)) byKey.set(key, summary)
    }
  }

  return stations.map((station) => {
    const hit = byKey.get(squash(station.name)) ?? (station.pass ? byKey.get(squash(station.pass)) : undefined)
    if (!hit) return station
    return {
      ...station,
      glacier: station.glacier || hit.glacier === true,
      website: station.website ?? hit.official_website_url,
      booking: station.booking ?? hit.official_booking_url
    }
  })
}

/**
 * La liste hors moteur : le catalogue, enrichi du seul référentiel.
 *
 * C'est ce que l'application affiche au premier lancement, avant même que le
 * moteur local ait démarré — et ce qu'elle affiche encore s'il ne démarre
 * jamais.
 */
export function fallbackDomains(ref: Referential): Domain[] {
  return catalogueStations(ref)
}

export async function loadDomains(ref: Referential): Promise<LoadedDomains> {
  const stations = catalogueStations(ref)
  if (!isClientReady()) {
    return { domains: stations, source: 'fichier', warning: null }
  }

  try {
    const res = await api.searchDomains({ status: ['operating'], sort: 'name_asc', limit: MAX_DOMAINS })
    if (res.items.length === 0) {
      return {
        domains: stations,
        source: 'fichier',
        warning:
          'La base du moteur local est vide. Importez le référentiel OpenSkiMap depuis Réglages → Moteur local ' +
          'pour compléter les liens officiels du catalogue.'
      }
    }
    return {
      domains: applyEngineOverlay(stations, res.items),
      source: 'moteur',
      warning: null
    }
  } catch (err) {
    return {
      domains: stations,
      source: 'fichier',
      warning: `Moteur local injoignable (${err instanceof Error ? err.message : String(err)}) — catalogue seul utilisé.`
    }
  }
}
