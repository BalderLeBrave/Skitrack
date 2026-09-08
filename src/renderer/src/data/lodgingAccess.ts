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
import { coordsUsable } from '@shared/geo'
import type { Lodging } from './lodgings'
import type { LocationPrecision } from '@shared/canonicalListing'

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
    dist_to_nearest_slope_m: number | null
    dist_to_nearest_lift_m: number | null
    altitude_m: number | null
    altitude_source?: string | null
    slope_access_type: string | null
    lat?: number | null
    lon?: number | null
    location_precision?: string | null
    bedrooms?: number | null
    capacity_max?: number | null
    capacity_source?: string | null
  }
): Lodging {
  const lift = metric.dist_to_nearest_lift_m
  const slope = metric.dist_to_nearest_slope_m
  const dist = metric.dist_to_slopes_m
  const altSource =
    metric.altitude_source === 'ign' || metric.altitude_source === 'eudem' || metric.altitude_source === 'curated'
      ? metric.altitude_source
      : lodging.altSource
  const refined = coordsUsable(metric.lat, metric.lon)
  const lat = refined && metric.lat != null ? metric.lat : coordsUsable(lodging.lat, lodging.lon) ? lodging.lat : undefined
  const lon = refined && metric.lon != null ? metric.lon : coordsUsable(lodging.lat, lodging.lon) ? lodging.lon : undefined
  const locPrecision: LocationPrecision | undefined =
    metric.location_precision === 'exact' ||
    metric.location_precision === 'address' ||
    metric.location_precision === 'approximate' ||
    metric.location_precision === 'unknown'
      ? metric.location_precision
      : lodging.locPrecision
  const osmFill = metric.capacity_source === 'osm'
  const osmCap =
    osmFill && lodging.pers <= 0 && metric.capacity_max != null && metric.capacity_max > 0
      ? metric.capacity_max
      : null
  const osmCh = osmFill && lodging.ch <= 0 && metric.bedrooms != null ? metric.bedrooms : null
  const osmStudio = osmCh === 0
  return {
    ...lodging,
    lat,
    lon,
    locPrecision,
    pers: osmCap != null ? osmCap : lodging.pers,
    ch: osmCh != null ? osmCh : lodging.ch,
    rooms: osmStudio ? 1 : lodging.rooms,
    capacitySource: osmCap != null || osmCh != null ? 'osm' : lodging.capacitySource,
    dist: dist != null ? Math.round(dist) : lodging.dist,
    den: metric.denivele_m != null ? Math.round(metric.denivele_m) : lodging.den,
    liftDist: lift != null ? Math.round(lift) : lodging.liftDist,
    alt: metric.altitude_m != null ? Math.round(metric.altitude_m) : lodging.alt,
    altSource,
    skiIn: metric.slope_access_type === 'skis_aux_pieds',
    accessType:
      metric.slope_access_type === 'skis_aux_pieds' ||
      metric.slope_access_type === 'navette' ||
      metric.slope_access_type === 'voiture'
        ? metric.slope_access_type
        : lodging.accessType,
    walk: dist != null ? Math.max(1, Math.round(dist / 50)) : lodging.walk,
    accessPoint:
      dist == null
        ? lodging.accessPoint
        : slope != null && dist === slope
          ? 'piste'
          : lift != null && dist === lift
            ? 'remontee'
            : lodging.accessPoint,
    accessComputed: dist != null || metric.slope_access_type != null,
    distanceStatus:
      dist != null || metric.slope_access_type != null
        ? 'ok'
        : coordsUsable(lat, lon)
          ? 'no_slope_geom'
          : 'no_gps',
    fieldsQuality: {
      ...(lodging.fieldsQuality ?? {}),
      altitude_m: metric.altitude_m != null ? 'ok' : 'missing',
      dist_to_nearest_lift_m: lift != null ? 'ok' : 'missing',
      lat: coordsUsable(lat, lon) ? 'ok' : 'missing',
      capacity_max: osmCap != null || lodging.pers > 0 ? 'ok' : lodging.fieldsQuality?.capacity_max,
      bedrooms: osmCh != null || lodging.ch > 0 || lodging.rooms === 1 ? 'ok' : lodging.fieldsQuality?.bedrooms
    }
  }
}

function canLocate(lodging: Lodging): boolean {
  return (
    coordsUsable(lodging.lat, lodging.lon) ||
    Boolean(lodging.addressText?.trim()) ||
    Boolean(lodging.commune?.trim()) ||
    Boolean(lodging.name && lodging.name.trim().length >= 8)
  )
}

function applyRefinedGps(lodging: Lodging, metric: AccessMetric | undefined): Lodging {
  if (!metric) return lodging
  const refined = coordsUsable(metric.lat, metric.lon)
  if (!refined) {
    return {
      ...lodging,
      lat: coordsUsable(lodging.lat, lodging.lon) ? lodging.lat : undefined,
      lon: coordsUsable(lodging.lat, lodging.lon) ? lodging.lon : undefined
    }
  }
  const locPrecision: LocationPrecision | undefined =
    metric.location_precision === 'exact' ||
    metric.location_precision === 'address' ||
    metric.location_precision === 'approximate' ||
    metric.location_precision === 'unknown'
      ? metric.location_precision
      : lodging.locPrecision
  return {
    ...lodging,
    lat: metric.lat ?? undefined,
    lon: metric.lon ?? undefined,
    locPrecision,
    distanceStatus: lodging.distanceStatus === 'ok' ? lodging.distanceStatus : 'no_slope_geom'
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
 * Les logements sans `lat`/`lon` **et** sans adresse sont laissés tels quels.
 * Un (0, 0) n'est pas une position. Une adresse sans GPS part quand même, pour
 * que le moteur pose le point via la BAN — jamais via le centroïde du domaine.
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

  const geoItems = lodgings.filter(canLocate)
  if (geoItems.length === 0) {
    return { lodgings, note: null }
  }

  const batches: Lodging[][] = []
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
          lat: coordsUsable(lodging.lat, lodging.lon) ? lodging.lat : null,
          lon: coordsUsable(lodging.lat, lodging.lon) ? lodging.lon : null,
          location_precision: lodging.locPrecision ?? (coordsUsable(lodging.lat, lodging.lon) ? 'exact' : 'unknown'),
          address: lodging.addressText?.trim() || null,
          commune: lodging.commune?.trim() || null,
          name: lodging.name?.trim() || null,
          bedrooms: lodging.ch > 0 ? lodging.ch : lodging.rooms === 1 ? 0 : null,
          capacity_max: lodging.pers > 0 ? lodging.pers : null
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
      lodgings: lodgings.map((lodging) => applyRefinedGps(lodging, byRef.get(String(lodging.id)))),
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

