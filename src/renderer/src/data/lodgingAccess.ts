/**
 * Enrichissement des annonces importées avec l'accès aux pistes.
 *
 * ## Le chaînon qui rend l'import utile
 *
 * Une annonce collée depuis Airbnb ou tirée de LiteAPI arrive avec sa position
 * mais **sans** ce qui fait un séjour au ski : distance aux pistes et dénivelé.
 * Ces grandeurs se calculent, à partir des tracés OpenSkiMap déjà en base. Ce
 * module fait le pont : il envoie les coordonnées au sidecar
 * (`/api/lodgings/access`), récupère les mesures, et les recolle sur les
 * logements par leur `id`.
 *
 * ## Pourquoi c'est tolérant à la panne
 *
 * Le moteur local peut être absent (sidecar pas démarré), ou le domaine importé
 * sans ses tracés (`--with-runs`). Dans ces cas, on **rend les annonces
 * inchangées** plutôt que d'échouer : une annonce sans distance calculée reste
 * une annonce affichable, la carte indique simplement « distance non calculée ».
 * Enrichir est un bonus, jamais un prérequis à voir ses logements.
 */

import { api, isClientReady } from '@/api/client'
import type { Lodging } from './lodgings'

export interface EnrichResult {
  lodgings: Lodging[]
  /** Message court pour le journal d'import. Null si rien à signaler. */
  note: string | null
}

/** Traduit le type d'accès du sidecar en distance/dénivelé exploitables par la carte. */
function mergeMetrics(
  lodging: Lodging,
  metric: {
    dist_to_slopes_m: number | null
    denivele_m: number | null
    dist_to_nearest_lift_m: number | null
    altitude_m: number | null
    slope_access_type: string | null
  }
): Lodging {
  const dist = metric.dist_to_slopes_m
  return {
    ...lodging,
    // On n'écrase que ce qui a une valeur : un domaine sans tracés renvoie des
    // nulls, et il ne faut pas remplacer un éventuel 0 par du bruit.
    dist: dist != null ? Math.round(dist) : lodging.dist,
    den: metric.denivele_m != null ? Math.round(metric.denivele_m) : lodging.den,
    liftDist:
      metric.dist_to_nearest_lift_m != null
        ? Math.round(metric.dist_to_nearest_lift_m)
        : lodging.liftDist,
    alt: metric.altitude_m != null ? Math.round(metric.altitude_m) : lodging.alt,
    skiIn: metric.slope_access_type === 'skis_aux_pieds',
    // Conservé en entier, et plus seulement réduit à `skiIn` : « navette » et
    // « voiture » disent quelque chose que la distance seule ne dit pas.
    accessType:
      metric.slope_access_type === 'skis_aux_pieds' ||
      metric.slope_access_type === 'navette' ||
      metric.slope_access_type === 'voiture'
        ? metric.slope_access_type
        : lodging.accessType,
    // Estimation du temps à pied : ~50 m/min en station, minimum une minute.
    walk: dist != null ? Math.max(1, Math.round(dist / 50)) : lodging.walk,
    accessComputed: dist != null || metric.slope_access_type != null
  }
}

/**
 * Calcule l'accès aux pistes pour les logements portant des coordonnées.
 *
 * `engineDomainId` est l'identifiant du domaine **côté moteur local**, pas
 * celui du catalogue — voir `Domain.engineId`. Les confondre renvoyait un 404
 * pour chaque appel, avalé par le `catch` du bas, et personne ne voyait jamais
 * de distance. Le paramètre est donc explicitement nommé, et `undefined` est
 * un cas traité plutôt qu'un identifiant hasardeux envoyé au moteur.
 *
 * Les logements sans `lat`/`lon` sont laissés tels quels : rien à calculer
 * sans position.
 */
export async function enrichWithAccess(
  lodgings: Lodging[],
  engineDomainId: number | undefined
): Promise<EnrichResult> {
  if (!isClientReady()) {
    return {
      lodgings,
      note: 'Moteur local non démarré — distances aux pistes non calculées.'
    }
  }
  if (engineDomainId == null) {
    return {
      lodgings,
      note: 'Ce domaine n’est pas rapproché du moteur local — distances non calculables.'
    }
  }

  const geoItems = lodgings.filter(
    (lodging): lodging is Lodging & { lat: number; lon: number } =>
      typeof lodging.lat === 'number' && typeof lodging.lon === 'number'
  )
  if (geoItems.length === 0) {
    return { lodgings, note: null }
  }

  try {
    const response = await api.lodgingsAccess({
      domain_id: engineDomainId,
      with_elevation: true,
      lodgings: geoItems.map((lodging) => ({
        ref: String(lodging.id),
        lat: lodging.lat,
        lon: lodging.lon,
        location_precision: lodging.locPrecision ?? 'exact'
      }))
    })

    if (response.slopes_available === 0 && response.lifts_available === 0) {
      return {
        lodgings,
        note: 'Ce domaine a été importé sans ses tracés ni ses remontées : distances non calculables.'
      }
    }

    const byRef = new Map(response.results.map((metric) => [metric.ref, metric]))
    const enriched = lodgings.map((lodging) => {
      const metric = byRef.get(String(lodging.id))
      return metric ? mergeMetrics(lodging, metric) : lodging
    })

    const computed = enriched.filter((lodging) => lodging.accessComputed).length
    return {
      lodgings: enriched,
      note: computed > 0 ? `Distances aux pistes calculées pour ${computed} logement(s).` : null
    }
  } catch (error) {
    // Le calcul est un bonus : son échec ne doit pas priver l'utilisateur de ses
    // annonces, déjà visibles. On le signale sans le transformer en erreur.
    return {
      lodgings,
      note: `Distances aux pistes non calculées (${error instanceof Error ? error.message : 'moteur indisponible'}).`
    }
  }
}
