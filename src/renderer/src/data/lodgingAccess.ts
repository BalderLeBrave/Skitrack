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

/**
 * Taille d'un lot d'enrichissement.
 *
 * Le sidecar refuse au-delà de 200 logements par appel (`MAX_LODGINGS`, dans
 * `api/routes/lodgings.py`) : il charge les tracés du domaine une fois puis
 * calcule pour chacun, et un appel démesuré bloquerait sa boucle. Le garde-fou
 * reste donc où il est ; ce qui change ici, c'est qu'on cesse de lui demander
 * l'impossible.
 *
 * La note qui justifiait ce refus — « une recherche ramène 20 à 50 logements,
 * pas des milliers » — décrit un usage qui n'est plus le nôtre : constaté le
 * 2026-08-31, un relevé multi-sources sur Méribel rend 358 logements pour un
 * seul domaine. Et le refus ne privait pas les 158 en trop de leur distance,
 * mais **les 358** : l'appel unique échouait en bloc.
 *
 * Les lots partent l'un après l'autre, jamais en parallèle : chaque appel
 * déclenche une résolution altimétrique groupée, et les services publics
 * d'altitude s'usent à une requête par seconde (voir `services/elevation.py`).
 */
const ACCESS_BATCH = 200

/** Une mesure d'accès telle que le sidecar la rend. */
type AccessMetric = Awaited<ReturnType<typeof api.lodgingsAccess>>['results'][number]

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
    // Les deux distances d'origine, et pas seulement leur minimum : sans elles,
    // impossible de dire si la mesure porte sur une piste ou sur une remontée,
    // et l'étiquette annonçait « des pistes » dans tous les cas.
    dist_to_nearest_slope_m: number | null
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
    /*
     * Lequel des deux points a été mesuré. `dist_to_slopes_m` est le minimum
     * des deux côté sidecar ; on compare pour savoir lequel a gagné plutôt que
     * de le supposer — le jour où les tracés seront importés, l'étiquette
     * suivra sans qu'on y touche.
     */
    accessPoint:
      dist == null
        ? lodging.accessPoint
        : metric.dist_to_nearest_slope_m != null && dist === metric.dist_to_nearest_slope_m
          ? 'piste'
          : metric.dist_to_nearest_lift_m != null && dist === metric.dist_to_nearest_lift_m
            ? 'remontee'
            : lodging.accessPoint,
    accessComputed: dist != null || metric.slope_access_type != null,
    distanceStatus:
      dist != null ? 'ok' : metric.slope_access_type != null ? 'ok' : 'no_slope_geom'
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

  const batches: (typeof geoItems)[] = []
  for (let i = 0; i < geoItems.length; i += ACCESS_BATCH) {
    batches.push(geoItems.slice(i, i + ACCESS_BATCH))
  }

  const byRef = new Map<string, AccessMetric>()
  let slopesAvailable = 0
  let liftsAvailable = 0
  let failedBatches = 0
  let lastError: unknown = null

  // Un lot qui échoue n'annule pas les autres, comme pour les itinéraires en
  // masse (`domain/travel.ts`). Ce qui a été mesuré est gardé ; ce qui manque
  // est dit.
  for (const batch of batches) {
    try {
      const response = await api.lodgingsAccess({
        domain_id: engineDomainId,
        with_elevation: true,
        lodgings: batch.map((lodging) => ({
          ref: String(lodging.id),
          lat: lodging.lat,
          lon: lodging.lon,
          location_precision: lodging.locPrecision ?? 'exact'
        }))
      })
      // Le domaine est le même pour tous les lots : ces deux nombres ne varient
      // pas d'un appel à l'autre. On garde le maximum plutôt que le dernier,
      // pour qu'un lot en échec ne les ramène pas à zéro.
      slopesAvailable = Math.max(slopesAvailable, response.slopes_available)
      liftsAvailable = Math.max(liftsAvailable, response.lifts_available)
      for (const metric of response.results) byRef.set(metric.ref, metric)
    } catch (error) {
      failedBatches++
      lastError = error
    }
  }

  // Le calcul est un bonus : son échec ne doit pas priver l'utilisateur de ses
  // annonces, déjà visibles. On le signale sans le transformer en erreur.
  if (failedBatches === batches.length) {
    return {
      lodgings,
      note: `Distances aux pistes non calculées (${lastError instanceof Error ? lastError.message : 'moteur indisponible'}).`
    }
  }

  if (slopesAvailable === 0 && liftsAvailable === 0) {
    return {
      lodgings,
      note: 'Ce domaine a été importé sans ses tracés ni ses remontées : distances non calculables.'
    }
  }

  const enriched = lodgings.map((lodging) => {
    const metric = byRef.get(String(lodging.id))
    return metric ? mergeMetrics(lodging, metric) : lodging
  })

  const computed = enriched.filter((lodging) => lodging.accessComputed).length
  // Le reste en clair quand une partie seulement a abouti : un compte muet
  // laisserait croire que les logements sans distance n'en ont pas.
  const reste = failedBatches > 0 ? ` ${failedBatches} lot(s) sur ${batches.length} n’ont pas abouti.` : ''
  return {
    lodgings: enriched,
    note: computed > 0 ? `Distances aux pistes calculées pour ${computed} logement(s).${reste}` : null
  }
}
