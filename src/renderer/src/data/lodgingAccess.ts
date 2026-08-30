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
import type {
  LodgingAccessMetrics,
  LodgingAccessRequest,
  LodgingAccessResponse
} from '@/api/types'
import type { Lodging } from './lodgings'

/**
 * Logements par appel au moteur local.
 *
 * Doit rester ≤ `MAX_LODGINGS` de `sidecar/skitrack/api/routes/lodgings.py`,
 * qui rend un 413 au-delà. Le client découpe, le moteur n'a pas à changer.
 */
const MAX_PER_CALL = 200

/**
 * L'appel au moteur, isolé pour que le test puisse l'observer.
 *
 * Le découpage en lots ne se relit pas : il se compte. `lodgingAccess.test.ts`
 * passe un appelant qui note la taille de chaque requête, et vérifie qu'un
 * domaine de 349 annonces part en 200 + 149 plutôt qu'en un 413.
 */
export type AccessCaller = (body: LodgingAccessRequest) => Promise<LodgingAccessResponse>

export interface EnrichResult {
  lodgings: Lodging[]
  /** Message court pour le journal d'import. Null si rien à signaler. */
  note: string | null
  /**
   * Tout ce qui pouvait être mesuré l'a été.
   *
   * Faux dès qu'une position est restée sans distance pour une raison qui se
   * nomme : moteur éteint, domaine non rapproché, domaine sans tracés, lot en
   * échec. L'écran Logements décidait jusqu'ici d'afficher la raison en
   * regardant si **aucune** annonce n'avait été mesurée — un test qui valait
   * quand l'appel était unique, et qui rend l'échec partiel muet depuis le
   * découpage en lots : 200 distances arrivées, 149 perdues, aucun message, et
   * `accessTried` empêche toute nouvelle tentative de la session.
   */
  ok: boolean
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
  engineDomainId: number | undefined,
  call: AccessCaller = api.lodgingsAccess
): Promise<EnrichResult> {
  if (!isClientReady()) {
    return {
      lodgings,
      note: 'Moteur local non démarré — distances aux pistes non calculées.',
      ok: false
    }
  }
  if (engineDomainId == null) {
    return {
      lodgings,
      note: 'Ce domaine n’est pas rapproché du moteur local — distances non calculables.',
      ok: false
    }
  }

  const geoItems = lodgings.filter(
    (lodging): lodging is Lodging & { lat: number; lon: number } =>
      typeof lodging.lat === 'number' && typeof lodging.lon === 'number'
  )
  if (geoItems.length === 0) {
    // Rien à mesurer n'est pas un échec : une annonce sans position relevée est
    // signalée ailleurs, et l'épingle « ≈ » le dit sur la carte.
    return { lodgings, note: null, ok: true }
  }

  /*
   * Le moteur refuse au-delà de `MAX_LODGINGS` par appel — 200, voir
   * `sidecar/skitrack/api/routes/lodgings.py` — et son message dit quoi faire :
   * « Découpez la recherche. » Personne ne le faisait. Un domaine de 349
   * annonces partait donc en un seul POST, recevait un 413, et le `catch` du
   * bas transformait le refus en « Distances aux pistes non calculées (Trop de
   * logements en un appel (349 > 200). Découpez la recherche.) » — un message
   * adressé au code, affiché à l'utilisateur, pour un lot qui n'avait rien
   * d'anormal.
   *
   * Le découpage est fait ici plutôt qu'en relevant le plafond du moteur : la
   * borne protège une requête synchrone qui charge tous les tracés du domaine,
   * et le client est le seul à savoir qu'il parle du même domaine à chaque lot.
   */
  const batches: (typeof geoItems)[] = []
  for (let at = 0; at < geoItems.length; at += MAX_PER_CALL) {
    batches.push(geoItems.slice(at, at + MAX_PER_CALL))
  }

  const byRef = new Map<string, LodgingAccessMetrics>()
  /** Lots auxquels le moteur a répondu. Zéro = rien à dire du domaine. */
  let answered = 0
  /** Vu au moins une fois : le domaine porte des tracés ou des remontées. */
  let anyGeometry = false
  /** Premier échec rencontré, gardé pour le message. Les lots sains passent. */
  let failure: string | null = null

  // Séquentiel, et non `Promise.all` : chaque appel recharge les tracés du
  // domaine côté moteur, et deux lots en parallèle doublent ce coût sans rien
  // rendre plus tôt.
  for (const batch of batches) {
    try {
      const response = await call({
        domain_id: engineDomainId,
        with_elevation: true,
        lodgings: batch.map((lodging) => ({
          ref: String(lodging.id),
          lat: lodging.lat,
          lon: lodging.lon,
          location_precision: lodging.locPrecision ?? 'exact'
        }))
      })
      answered++
      if (response.slopes_available > 0 || response.lifts_available > 0) anyGeometry = true
      for (const metric of response.results) byRef.set(metric.ref, metric)
    } catch (error) {
      // Un échec de source reste local : les lots déjà mesurés sont conservés.
      failure ??= error instanceof Error ? error.message : 'moteur indisponible'
    }
  }

  const enriched = lodgings.map((lodging) => {
    const metric = byRef.get(String(lodging.id))
    return metric ? mergeMetrics(lodging, metric) : lodging
  })

  /*
   * Compté sur les seules annonces envoyées, et non sur toute la liste.
   *
   * `accessComputed` est enregistré avec l'annonce : le mesurer sur `lodgings`
   * additionnait les distances d'une session précédente à celles de cet appel,
   * et le rapport pouvait annoncer « calculées pour 349 sur 349 » au moment
   * même où un lot venait d'échouer. Numérateur et dénominateur parlent
   * désormais de la même population.
   */
  const mesurees = geoItems.filter((lodging) => {
    const metric = byRef.get(String(lodging.id))
    return metric != null && (metric.dist_to_slopes_m != null || metric.slope_access_type != null)
  }).length
  const manquantes = geoItems.length - mesurees

  /*
   * Un échec l'emporte sur l'absence de tracés : « ce domaine n'a pas ses
   * tracés » se répare par un import, la panne d'un lot par une relance, et
   * c'est le second remède qu'il faut donner quand les deux se présentent —
   * le domaine peut très bien avoir ses tracés sans que le lot qui l'aurait
   * montré ait répondu.
   *
   * Le calcul est un bonus : son échec ne doit pas priver l'utilisateur de ses
   * annonces, déjà visibles. On le signale sans le transformer en erreur.
   */
  if (answered === 0 || failure) {
    return {
      lodgings: enriched,
      // Une seule phrase pour la panne totale et pour la panne partielle : elle
      // porte le compte, donc elle dit d'elle-même de laquelle il s'agit.
      note: `Distances aux pistes non calculées pour ${manquantes} logement(s) sur ${geoItems.length} (${failure ?? 'moteur indisponible'}).`,
      ok: false
    }
  }
  if (!anyGeometry) {
    // Vérifié sur les lots qui ont répondu, et non sur le contenu de `byRef` :
    // un domaine sans tracés renvoie bien une ligne par logement, toutes nulles.
    return {
      lodgings,
      note: 'Ce domaine a été importé sans ses tracés ni ses remontées : distances non calculables.',
      ok: false
    }
  }

  /*
   * `ok` vaut « rien à signaler à l'écran », et non « tout est mesuré ».
   *
   * Le moteur peut rendre une ligne vide pour une position qu'il n'a pas su
   * rapprocher, sans que personne n'ait échoué : la vignette dit alors
   * « distance non calculée », ce qui est exact, et hisser un bandeau
   * au-dessus de la liste pour ça reviendrait à donner un remède là où il n'y
   * a pas de panne. Les quatre cas qui en ont un — moteur éteint, domaine non
   * rapproché, domaine sans tracés, lot en échec — sont tous rendus plus haut.
   */
  return {
    lodgings: enriched,
    note: mesurees > 0 ? `Distances aux pistes calculées pour ${mesurees} logement(s).` : null,
    ok: true
  }
}
