/**
 * Fusion d'un collage Airbnb dans la liste des logements.
 *
 * Extrait de `ImportDialog` pour être appelé aussi par la revérification
 * automatique des prix (bouton « Valider » après un changement de dates). La
 * règle est la même dans les deux cas, et c'est important : qu'on importe à la
 * main ou qu'on rafraîchisse, une annonce déjà connue doit être **mise à jour**,
 * jamais dupliquée.
 *
 * ## Ce que « mettre à jour » veut dire ici
 *
 * Un prix Airbnb ne vaut que pour les dates auxquelles il a été relevé : le
 * tarif du 7 février ne dit rien de celui du 3 janvier. Le prix et ses dates de
 * validité sont donc toujours remplacés **ensemble** — les dissocier laisserait
 * un montant neuf estampillé d'anciennes dates, c'est-à-dire un mensonge.
 *
 * ## Et ce qu'« absente du collage » veut dire
 *
 * Une recherche Airbnb ne renvoie que ce qui est **libre aux dates demandées**.
 * Une annonce déjà dans la liste, relevée pour ces mêmes dates, et que le
 * nouveau relevé ne ramène plus, a donc très probablement été réservée. Elle
 * était pourtant conservée telle quelle, prix et bouton « Annonce » compris :
 * on la voyait ici et Airbnb répondait « ces dates ne sont pas disponibles ».
 *
 * Elle est désormais marquée `missingSince`. Marquée, pas supprimée : un relevé
 * ne parcourt que les premiers écrans de résultats, et une annonce peut aussi
 * manquer parce qu'elle est tombée en page trois. La marque disparaît d'elle-même
 * dès qu'un relevé la retrouve.
 */

import type { Lodging } from './lodgings'
import type { RawListing } from './bulkImport'

/** Identifiant Airbnb d'une annonce, tiré de son URL `.../rooms/<id>`. */
export function roomKey(url: string | undefined): string {
  if (!url) return ''
  const match = url.match(/\/rooms\/(\d+)/)
  return match ? match[1] : url.split('?')[0]
}

export interface MergeOptions {
  /** Dates du séjour pour lesquelles ce collage a relevé les prix. */
  checkIn: string
  checkOut: string
  /** Domaine auquel rattacher les nouvelles annonces. */
  domainId: number
  /** Nombre de voyageurs, pour le prix par personne et par nuit. */
  capacity: number
  nights: number
  /** Altitude de repli quand le moteur local n'a pas encore calculé la vraie. */
  fallbackAltitude: number
}

export interface MergeResult {
  /** Liste complète après fusion : anciennes (dont mises à jour) + nouvelles. */
  imported: Lodging[]
  /** Nouvelles annonces, à enrichir de leurs distances aux pistes. */
  added: Lodging[]
  /** Nombre d'annonces déjà connues dont le prix a été actualisé. */
  updated: number
  /** Nombre d'annonces du collage ignorées faute d'identifiant exploitable. */
  ignored: number
  /** Annonces relevées à ces mêmes dates que le relevé n'a pas retrouvées. */
  missing: number
}

/**
 * Fusionne un lot d'annonces collées dans la liste existante.
 *
 * Les annonces déjà présentes voient leur prix et leurs dates de validité
 * actualisés ; les inconnues sont ajoutées. Rien n'est jamais dupliqué.
 */
export function mergeAirbnbPaste(
  existing: Lodging[],
  listings: RawListing[],
  options: MergeOptions
): MergeResult {
  const { checkIn, checkOut, domainId, capacity, nights, fallbackAltitude } = options

  const existingKeys = new Set(
    existing.filter((l) => l.src === 'Airbnb' && roomKey(l.url)).map((l) => roomKey(l.url))
  )

  const seen = new Set<string>()
  const fresh: RawListing[] = []
  const refreshed = new Map<string, RawListing>()
  let ignored = 0

  for (const item of listings) {
    const key = roomKey(item.url)
    if (!key) {
      ignored++
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    if (existingKeys.has(key)) refreshed.set(key, item)
    else fresh.push(item)
  }

  const pricePerPersonNight = (total: number): number =>
    Math.round((total / Math.max(1, capacity * nights)) * 2) / 2

  const now = Date.now()
  let missing = 0

  const merged = existing.map((lodging) => {
    if (lodging.src !== 'Airbnb') return lodging
    const hit = refreshed.get(roomKey(lodging.url))
    if (!hit) {
      // Absente du relevé. Ne se conclut que pour une annonce relevée aux mêmes
      // dates et rattachée au même domaine : ailleurs, son absence ne prouve
      // rien, elle n'était tout simplement pas dans le périmètre interrogé.
      const sameStay = lodging.priceCheckIn === checkIn && lodging.priceCheckOut === checkOut
      const sameDomain = lodging.importDomainId == null || lodging.importDomainId === domainId
      if (!sameStay || !sameDomain) return lodging
      if (lodging.missingSince) return lodging
      missing++
      return { ...lodging, missingSince: { checkIn, checkOut, at: now } }
    }
    const total = hit.total ?? 0
    // Un collage sans prix (annonce affichée sans tarif) ne doit pas effacer un
    // prix déjà relevé : on ne remplace que par une valeur réelle.
    if (total <= 0) return lodging
    return {
      ...lodging,
      // Retrouvée : la marque d'absence tombe.
      missingSince: undefined,
      total: Math.round(total),
      pp: pricePerPersonNight(total),
      priceCheckIn: checkIn,
      priceCheckOut: checkOut,
      image: hit.image ?? lodging.image,
      note: typeof hit.note === 'string' && hit.note ? hit.note : lodging.note,
      // Un relevé plus récent peut annoncer les chambres que le précédent
      // taisait ; l'inverse n'efface rien.
      ch: hit.rooms ?? lodging.ch
    }
  })

  // Le prochain identifiant libre, pas « 1000 + le nombre d'annonces » : après
  // une suppression, ce décompte retomberait sur un identifiant déjà pris et
  // deux annonces différentes porteraient la même clé.
  const firstId = existing.reduce((max, l) => Math.max(max, l.id), 999) + 1
  const added: Lodging[] = fresh.map((item, index) => {
    const total = item.total ?? 0
    const priced = total > 0
    return {
      id: firstId + index,
      name: item.name,
      type: 'Import',
      // Capacité et chambres : 0 = inconnu. La page de résultats Airbnb ne
      // publie pas le nombre de voyageurs admis, et n'annonce les chambres que
      // pour les biens qui en ont. Y écrire le groupe du moment et « 1 chambre »
      // fabriquait des caractéristiques que l'annonce n'a jamais données — et il
      // suffisait ensuite de porter le groupe à 8 personnes pour que toutes les
      // annonces importées disparaissent derrière un filtre.
      pers: 0,
      ch: item.rooms ?? 0,
      m2: null,
      note: typeof item.note === 'string' && item.note ? item.note : '—',
      avis: 0,
      dist: 0,
      walk: 1,
      den: 0,
      skiIn: false,
      src: 'Airbnb',
      pp: priced ? pricePerPersonNight(total) : 0,
      total: Math.round(total),
      annul: false,
      lift: 'non renseigné',
      liftDist: 0,
      alt: fallbackAltitude,
      stock: 0,
      url: item.url,
      image: item.image ?? null,
      photo: item.name,
      lat: item.lat,
      lon: item.lon,
      locPrecision: item.locPrecision ?? 'approximate',
      importDomainId: domainId,
      priceCheckIn: priced ? checkIn : undefined,
      priceCheckOut: priced ? checkOut : undefined
    }
  })

  return { imported: [...merged, ...added], added, updated: refreshed.size, ignored, missing }
}
