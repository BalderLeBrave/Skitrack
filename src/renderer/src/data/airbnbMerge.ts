/**
 * Fusion d'un collage Airbnb dans la liste des logements.
 *
 * Extrait du dialogue d’import — depuis supprimé, faute d’écran qui le montrait
 * — pour être appelé aussi par la revérification
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
 * Une annonce déjà dans la liste, relevée pour ces mêmes dates, et que le
 * nouveau relevé ne ramène plus, a très probablement été réservée. Elle est
 * marquée `missingSince` — marquée, pas supprimée : un relevé ne parcourt que
 * les premiers écrans, et une annonce peut manquer parce qu'elle est tombée en
 * page trois. La marque disparaît d'elle-même dès qu'un relevé la retrouve.
 *
 * ## Ce que ce fichier a longtemps cru, et qui était faux
 *
 * « Une recherche Airbnb ne renvoie que ce qui est libre aux dates demandées ».
 * Non : Airbnb remplit sa grille avec des annonces qu'il ne peut pas vendre à
 * ces dates, et il ne les distingue que d'une façon — **il ne leur met pas de
 * prix**. Elles arrivaient donc ici avec `total: 0`, étaient rangées avec les
 * hébergements OpenStreetMap qui n'ont légitimement pas de tarif, et
 * s'affichaient comme ouvrables. Le clic tombait sur « ces dates ne sont pas
 * disponibles ».
 *
 * La présence d'un prix relevé **à ces dates-là** est donc la seule preuve de
 * disponibilité dont l'application dispose. Le verdict se lit dans
 * `data/lodgingAvailability.ts` ; ce fichier se contente de ne jamais écraser
 * un prix réel par un zéro, ce qu'il faisait déjà.
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
  /**
   * Voyageurs de la recherche Airbnb d'où viennent ces annonces.
   *
   * Deux appelants, deux provenances, et la règle n'est pas la même :
   *
   * * **Collage** (marque-page) — la valeur est lue dans l'URL de la page par
   *   le marque-page. `undefined` quand il ne l'a pas transmise : on n'y
   *   substitue pas le groupe de l'application, qui a pu changer entre
   *   l'ouverture d'Airbnb et le collage.
   * * **Relevé en direct** (`runAirbnbSearch`) — c'est l'application qui a
   *   construit l'URL, `adults` compris (`providers/airbnb/airbnb.ts`). Il n'y
   *   a donc aucun écart possible entre le groupe demandé et celui de la page :
   *   son propre `params.adults` est un repli légitime, pas une substitution.
   *
   * Dans les deux cas c'est un **plancher relevé**, jamais une capacité : il va
   * dans `fitsGuests`, pas dans `pers`. Voir `providers/types.ts`.
   */
  searchAdults?: number
  /**
   * Ce relevé autorise-t-il à conclure d'une absence ?
   *
   * Marquer `missingSince`, c'est affirmer à l'écran « probablement réservée ».
   * L'affirmation ne vaut que si le relevé a réellement vu **tout** ce
   * qu'Airbnb propose à ces dates. Or un balayage s'interrompt pour des motifs
   * qui n'ont rien à voir avec la disponibilité : budget de temps épuisé,
   * passe expirée, tranches de prix qui cessent de borner, lot jugé égaré dont
   * on écarte les annonces sans position. Dans ces cas, une annonce absente est
   * une annonce **non revue**, pas une annonce prise.
   *
   * Défaut `false` : sans preuve de complétude, on ne conclut pas. C'est la
   * même règle que partout ailleurs ici — on n'affiche que ce qu'on a.
   */
  absenceConclusive?: boolean
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
  const { checkIn, checkOut, domainId, capacity, nights, fallbackAltitude, searchAdults } = options
  const absenceConclusive = options.absenceConclusive ?? false

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
      // Un relevé tronqué ne prouve rien : l'annonce n'a pas été revue, ce qui
      // n'est pas la même chose qu'avoir disparu. On la laisse telle quelle.
      if (!absenceConclusive) return lodging
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
      availabilityStatus: 'available' as const,
      total: Math.round(total),
      pp: pricePerPersonNight(total),
      scannedAt: Date.now(),
      priceCheckIn: checkIn,
      priceCheckOut: checkOut,
      image: hit.image ?? lodging.image,
      note: typeof hit.note === 'string' && hit.note ? hit.note : lodging.note,
      // Un relevé plus récent peut annoncer les chambres que le précédent
      // taisait ; l'inverse n'efface rien.
      ch: hit.rooms ?? lodging.ch,
      pers: hit.capacity != null && hit.capacity > 0 ? hit.capacity : lodging.pers
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
      // Capacité : 0 = inconnu. La carte de résultat Airbnb ne publie pas la
      // capacité **en personnes** du bien ; y écrire le groupe du moment
      // fabriquait une caractéristique. Mais la **recherche** d'où vient le
      // collage était filtrée par le groupe (`adults` dans l'URL de la page),
      // et cette information-là est réelle : elle part dans `fitsGuests`, pas
      // dans `pers`.
      //
      // Les **chambres**, elles, sont publiées : la carte écrit « 2 chambres ·
      // 6 lits · 1 salle de bain ». Ce commentaire disait le contraire, et
      // `ch` restait à zéro pour toutes les annonces Airbnb. C'est
      // `airbnbClip.tailleAnnoncee` qui les lit maintenant, et `item.rooms`
      // les porte jusqu'ici.
      pers: item.capacity != null && item.capacity > 0 ? item.capacity : 0,
      fitsGuests: searchAdults,
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
      photo: item.image ?? '',
      lat: item.lat,
      lon: item.lon,
      locPrecision: item.locPrecision ?? 'approximate',
      importDomainId: domainId,
      scannedAt: Date.now(),
      priceCheckIn: priced ? checkIn : undefined,
      priceCheckOut: priced ? checkOut : undefined,
      availabilityStatus: priced ? ('available' as const) : undefined
    }
  })

  return { imported: [...merged, ...added], added, updated: refreshed.size, ignored, missing }
}
