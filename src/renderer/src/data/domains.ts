/**
 * Source des domaines skiables.
 *
 * La liste vient de la base OpenSkiMap du moteur local — 277 domaines français
 * en exploitation, avec leurs altitudes de pistes, leurs massifs et leurs
 * remontées. Le fichier JSON livré ne sert que de secours quand le moteur n'a
 * pas démarré ou que sa base est vide : sans lui l'application n'aurait rien à
 * afficher au premier lancement.
 *
 * Les deux sources se rejoignent par le `slug` du domaine. C'est ce qui permet
 * de poser les tarifs de forfaits relevés à la main, la saisonnalité et les
 * bulletins neige sur les domaines correspondants, quel que soit l'ordre
 * d'import de la base.
 */

import { api, isClientReady } from '@/api/client'
import type { DomainSummary } from '@/api/types'
import { slug } from '@/domain/format'
import type { Domain, Referential } from './referentiel'
import { domainsFromReferential, logoIndexBySlug } from './referentiel'
import { officialSiteOf } from './stations'
import { collapseToStations } from './stationList'

/** Au-delà, on sort du référentiel français ; la borne est un garde-fou, pas
 *  une pagination — l'écran de recherche filtre ensuite localement. */
const MAX_DOMAINS = 1000

export type DomainSource = 'moteur' | 'fichier'

export interface LoadedDomains {
  domains: Domain[]
  source: DomainSource
  /** Renseigné quand le moteur a répondu mais qu'on a dû se rabattre. */
  warning: string | null
}

/**
 * Saisonnalité par défaut.
 *
 * Un grand domaine d'altitude vit des vacances scolaires et voit ses prix
 * s'effondrer en dehors ; une station de proximité, fréquentée le week-end
 * toute la saison, bouge beaucoup moins. À défaut d'une donnée relevée, la
 * taille du domaine skiable en est le meilleur indice disponible.
 */
function defaultSeasonality(km: number): number {
  return Math.round(Math.max(0.55, Math.min(1.4, 0.55 + km / 220)) * 100) / 100
}

function fromSummary(d: DomainSummary): Domain | null {
  // Sans altitude de pistes ni position, un domaine ne peut ni être noté, ni
  // filtré, ni placé sur la carte : il n'a rien à faire dans la liste.
  if (d.altitude_min_m == null || d.altitude_max_m == null) return null
  if (d.centroid_lat == null || d.centroid_lon == null) return null

  const km = d.slopes_km_total ?? 0
  return {
    id: d.id,
    slug: d.slug || slug(d.name),
    name: d.name,
    massif: d.massif ?? 'Massif indéterminé',
    region: d.region ?? '',
    min: Math.round(d.altitude_min_m),
    max: Math.round(d.altitude_max_m),
    // Le front de neige n'est connu que si les remontées ont été importées ;
    // à défaut, le bas des pistes en est la meilleure approximation.
    village: Math.round(d.altitude_village_m ?? d.altitude_min_m),
    km: Math.round(km * 10) / 10,
    lifts: d.lifts_count ?? 0,
    glacier: d.glacier === true,
    pass: d.linked_pass_name,
    curated: d.curated,
    lat: d.centroid_lat,
    lon: d.centroid_lon,
    sais: defaultSeasonality(km),
    website: d.official_website_url,
    booking: d.official_booking_url,
    logo: null
  }
}

/**
 * Reporte sur les domaines du moteur ce que seul le fichier livré connaît : la
 * saisonnalité relevée et les logos renseignés à la main. Le rapprochement se
 * fait par slug, les identifiants numériques changeant à chaque réimport.
 */
function applyReferentialOverlay(domains: Domain[], ref: Referential): Domain[] {
  const bundled = new Map(domainsFromReferential(ref, slug).map((d) => [d.slug, d]))
  const logos = logoIndexBySlug(ref, slug)
  return domains.map((d) => {
    const known = bundled.get(d.slug)
    return {
      ...d,
      sais: known?.sais ?? d.sais,
      logo: logos.get(d.slug) ?? d.logo
    }
  })
}

/**
 * Pose le site officiel de la station sur les domaines qui n'en ont pas.
 *
 * Le fichier livré n'en porte aucun, et la base OpenSkiMap n'en connaît qu'une
 * partie : sans cela, ni le logo — récupéré depuis l'icône du site — ni le lien
 * « site officiel » de la fiche n'apparaissent, alors que l'adresse est connue
 * et vérifiée. Un site déjà renseigné par le moteur local n'est pas écrasé :
 * lui vient de la source, la table est un secours.
 */
function withOfficialSite(domains: Domain[]): Domain[] {
  return domains.map((d) => {
    if (d.website) return d
    const site = officialSiteOf(d.name)
    return site ? { ...d, website: site.url } : d
  })
}

/**
 * Les domaines chargés sont repliés en **stations** avant d'être rendus.
 *
 * C'est le seul endroit où le repli a lieu : tout l'aval — filtres, carte,
 * offres, combinaisons, logements — travaille ensuite sur des stations sans
 * avoir à le savoir. Voir `data/stationList.ts`.
 */
export function fallbackDomains(ref: Referential): Domain[] {
  return collapseToStations(withOfficialSite(domainsFromReferential(ref, slug)))
}

export async function loadDomains(ref: Referential): Promise<LoadedDomains> {
  if (!isClientReady()) {
    return {
      domains: fallbackDomains(ref),
      source: 'fichier',
      warning: null
    }
  }

  try {
    const res = await api.searchDomains({ status: ['operating'], sort: 'name_asc', limit: MAX_DOMAINS })
    const domains = res.items.map(fromSummary).filter((d): d is Domain => d !== null)
    if (domains.length === 0) {
      return {
        domains: fallbackDomains(ref),
        source: 'fichier',
        warning:
          'La base du moteur local est vide. Importez le référentiel OpenSkiMap depuis Réglages → Moteur local ' +
          'pour disposer de tous les domaines français.'
      }
    }
    return {
      domains: collapseToStations(withOfficialSite(applyReferentialOverlay(domains, ref))),
      source: 'moteur',
      warning: null
    }
  } catch (err) {
    return {
      domains: fallbackDomains(ref),
      source: 'fichier',
      warning: `Moteur local injoignable (${err instanceof Error ? err.message : String(err)}) — référentiel livré utilisé.`
    }
  }
}
