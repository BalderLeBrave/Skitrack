/**
 * Grille d'occupation d'une fiche Orchestra / Ceto.
 *
 * La SERP ne publie ni la capacité ni le prix du groupe : elle affiche un
 * « à partir de » qui correspond à l'occupation **minimale**. Un appartement
 * dont le maximum est six personnes y apparaît donc pour une recherche à huit,
 * au tarif d'une personne. C'est le biais que ce module supprime.
 *
 * Tout se lit dans le panneau « Sélectionner votre chambre », rendu par le
 * widget après un clic — d'où le passage par Playwright. Relevé sur
 * `booking.chamonix.com` le 2026-08-21, fiche `hotel-324-appart-hotel-aiguille-verte`
 * du 09 au 16 janvier 2027 : 201 lignes, occupations 1 à 6, maximum 6.
 *
 * ## Ce qui est lu, et pourquoi comme ça
 *
 * L'occupation n'est **pas** un nombre dans le DOM : c'est une suite de
 * pictogrammes, `i.icon-max-adult` et `i.icon-max-child` dans
 * `.composition-pax .icon-pax-wrap`. On les compte. C'est laid, et c'est la
 * seule mesure que la page publie — le libellé « Pers.max » n'est qu'un
 * en-tête de colonne.
 *
 * La séparation adulte / enfant est conservée sans être utilisée pour filtrer :
 * une chambre « 2 adultes + 1 enfant » ne loge pas trois adultes, et prétendre
 * le contraire recréerait exactement le genre d'approximation qu'on corrige.
 * Voir `fitsGroup`.
 */

/** Une ligne de la grille : une occupation, un tarif, une condition. */
export interface OccupancyRow {
  /** Adultes maximum de cette composition. */
  adults: number
  /** Enfants maximum, en plus des adultes. */
  children: number
  /** Occupation totale annoncée : c'est ce que compte la colonne « Pers.max ». */
  pax: number
  /** Prix du séjour pour cette composition, en euros. */
  total: number
  /**
   * Condition tarifaire, telle que la grille l'écrit : « Location uniquement
   * Flexible », « Réservez en avance et Payez moins ! Long séjour »…
   *
   * Elle fait partie du prix : deux montants pour la même occupation ne sont
   * pas deux erreurs, ce sont deux offres — l'une annulable, l'autre pas. Les
   * afficher sans leur condition ferait passer un tarif non remboursable pour
   * une bonne affaire.
   */
  condition?: string
  /** Politique d'annulation : « Flexible », « Non remboursable »… */
  policy?: string
}

/** Ce qu'on retient d'une fiche, une fois la grille lue. */
export interface FicheOccupancy {
  /** Occupation maximale proposée — la capacité réelle du bien. */
  maxPax: number
  /** Meilleur prix par occupation, occupation croissante, avec sa condition. */
  options: { pax: number; total: number; condition?: string; policy?: string }[]
  /** Nombre de lignes lues, pour le journal : une grille vide se voit. */
  rowCount: number
}

/**
 * La composition accueille-t-elle le groupe demandé ?
 *
 * Les adultes doivent tenir dans les places d'adulte ; les enfants prennent
 * ensuite ce qui reste, places enfant d'abord puis places d'adulte restantes.
 * Un enfant peut occuper une place d'adulte, l'inverse n'est pas vrai — c'est
 * la seule asymétrie, et elle vient de la grille elle-même.
 */
export function fitsGroup(row: OccupancyRow, adults: number, children: number): boolean {
  if (row.adults < adults) return false
  const leftoverAdultSeats = row.adults - adults
  return row.children + leftoverAdultSeats >= children
}

/**
 * Résume une grille : capacité maximale et meilleur tarif par occupation.
 *
 * `null` quand rien n'a été lu — une fiche sans grille exploitable ne doit
 * produire aucune capacité, surtout pas zéro, qui serait lu comme « ne loge
 * personne » au lieu de « on ne sait pas ».
 */
export function summarise(rows: OccupancyRow[]): FicheOccupancy | null {
  const usable = rows.filter((r) => r.pax > 0 && Number.isFinite(r.total) && r.total > 0)
  if (usable.length === 0) return null

  // Le moins cher de chaque occupation, **avec sa condition** : c'est elle qui
  // explique pourquoi il est le moins cher.
  const best = new Map<number, OccupancyRow>()
  for (const row of usable) {
    const seen = best.get(row.pax)
    if (seen == null || row.total < seen.total) best.set(row.pax, row)
  }

  return {
    maxPax: Math.max(...usable.map((r) => r.pax)),
    options: [...best.values()]
      .map((r) => ({ pax: r.pax, total: r.total, condition: r.condition, policy: r.policy }))
      .sort((a, b) => a.pax - b.pax),
    rowCount: usable.length
  }
}

/**
 * Tarif à retenir pour le groupe demandé, `null` si aucune composition ne peut
 * l'accueillir.
 *
 * **Le moins cher parmi celles qui conviennent** — pas le moins cher de la
 * grille. Le tarif « 1 personne » d'un appartement est presque toujours le plus
 * bas, et l'afficher pour un groupe de huit serait reproduire, en pire, le
 * « à partir de » de la SERP.
 */
export function priceForGroup(
  rows: OccupancyRow[],
  adults: number,
  children: number
): number | null {
  const fitting = rows.filter(
    (r) => Number.isFinite(r.total) && r.total > 0 && fitsGroup(r, adults, children)
  )
  if (fitting.length === 0) return null
  return Math.min(...fitting.map((r) => r.total))
}

/**
 * Ajoute les dates au hash, comme le fait le site lui-même.
 *
 * Sans elles la fiche s'ouvre sur un calendrier vide et la grille affiche les
 * tarifs d'une autre période — ou rien. Ce qui est déjà posé sur l'URL est
 * respecté : la SERP sait mieux que nous ce qu'elle y a mis, `s_channel`
 * compris.
 *
 * Pure, et ici plutôt que dans `ficheOccupancy.ts` pour rester testable sans
 * tirer Playwright ni Electron dans le banc d'essai.
 */
export function ficheUrlWithStay(url: string, from: string, to: string, channel: string): string {
  try {
    const u = new URL(url)
    const hash = new URLSearchParams(u.hash.startsWith('#') ? u.hash.slice(1) : u.hash)
    if (!hash.has('s_checkinDate')) hash.set('s_checkinDate', from)
    if (!hash.has('s_checkoutDate')) hash.set('s_checkoutDate', to)
    if (channel && !hash.has('s_channel')) hash.set('s_channel', channel)
    u.hash = hash.toString()
    return u.toString()
  } catch {
    return url
  }
}

/**
 * Sélecteurs du panneau, relevés sur booking.chamonix.com le 2026-08-21.
 *
 * Ils sont ici, et nulle part ailleurs, parce que ce sont les seules lignes à
 * reprendre si Orchestra renomme ses classes.
 *
 * **Ils ne sont couverts par aucun test hors ligne**, et c'est une limite
 * assumée : Playwright sérialise la fonction passée à `page.evaluate`, qui ne
 * peut donc rien importer. Le parcours du DOM vit forcément dans
 * `ficheOccupancy.ts`, en double de ces constantes. Ce qui *est* testé, c'est
 * tout ce qui décide ensuite — `fitsGroup`, `summarise`, `priceForGroup` — sur
 * les chiffres réellement relevés. Si la grille se vide un jour sans erreur,
 * c'est ici qu'il faut regarder.
 */
export const GRID_SELECTOR = '.cpt-room-composition'
export const OPEN_PANEL_SELECTOR = 'button.btn-open-panel-room'
export const PAX_ICON_SELECTOR = '.composition-pax .icon-pax-wrap i'
export const PRICE_SELECTOR = '.text-price'
export const ADULT_ICON_CLASS = 'icon-max-adult'
export const CHILD_ICON_CLASS = 'icon-max-child'
