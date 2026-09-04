/**
 * Filtre village / commune pour les centrales multi-stations (Ingénie).
 *
 * Exemple Val d'Arly : La Giettaz et Notre-Dame-de-Bellecombe partagent
 * `reservation.valdarly-montblanc.com` — sans sélection de `criteres[]`,
 * les inventaires se mélangent.
 *
 * « Les Deux Alpes » (nom France Montagnes / UI) et « Les 2 Alpes »
 * (schema.org des fiches) sont le même lieu. Le filtre local de station.ts
 * exigeait le token « deux » dans « les 2 alpes » et jetait ~90 fiches
 * (live 6 shown vs dump 98).
 */

export interface VillageChoice {
  value: string
  label: string
}

/** Chiffre isolé → mot français, pour coller « 2 Alpes » et « Deux Alpes ». */
const DIGIT_WORDS: Record<string, string> = {
  '2': 'deux',
  '3': 'trois',
  '4': 'quatre',
  '5': 'cinq',
  '6': 'six',
  '7': 'sept',
  '8': 'huit',
  '9': 'neuf'
}

/** Développe les abréviations courantes des toponymes français. */
function expandAbbrevs(s: string): string {
  return s
    .replace(/\bst\b/g, 'saint')
    .replace(/\bste\b/g, 'sainte')
    .replace(/\bnd\b/g, 'notre dame')
    .replace(/\b([2-9])\b/g, (d) => DIGIT_WORDS[d] ?? d)
}

/** Normalise un libellé de station pour comparer destination ↔ option. */
export function normPlace(s: string): string {
  const base = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return expandAbbrevs(base)
}

/**
 * Score de similarité simple : fraction des tokens de `needle` présents dans `hay`.
 */
function tokenCoverage(needle: string, hay: string): number {
  const tokens = needle.split(' ').filter((t) => t.length >= 3)
  if (tokens.length === 0) return 0
  const hit = tokens.filter((t) => hay.includes(t)).length
  return hit / tokens.length
}

/**
 * Choisit l'option `criteres[]` qui correspond à la station demandée.
 *
 * Ordre : exact → inclusion → couverture de tokens (≥ 0.6) → meilleur score.
 */
export function matchVillageOption(
  options: VillageChoice[],
  destination: string
): VillageChoice | null {
  const target = normPlace(destination)
  if (!target) return null
  const usable = options.filter((o) => o.value && o.value.trim() !== '')
  if (usable.length === 0) return null

  const exact = usable.find((o) => normPlace(o.label) === target)
  if (exact) return exact

  const contains = usable.find((o) => {
    const label = normPlace(o.label)
    return label.includes(target) || target.includes(label)
  })
  if (contains) return contains

  let best: VillageChoice | null = null
  let bestScore = 0
  for (const o of usable) {
    const label = normPlace(o.label)
    const score = Math.max(tokenCoverage(target, label), tokenCoverage(label, target))
    if (score > bestScore) {
      bestScore = score
      best = o
    }
  }
  // Exige au moins 60 % des tokens (évite Crest-Voland pour « Val » seul).
  return bestScore >= 0.6 ? best : null
}

/** La fiche appartient-elle clairement à une autre commune que la destination ? */
export function cityMismatch(
  city: string | null | undefined,
  destination: string
): boolean {
  if (!city || !destination) return false
  const c = normPlace(city)
  const d = normPlace(destination)
  if (!c || !d) return false
  if (c === d || c.includes(d) || d.includes(c)) return false
  if (tokenCoverage(d, c) >= 0.6 || tokenCoverage(c, d) >= 0.6) return false
  return true
}

/**
 * `href` « page suivante » + dates du séjour en cours.
 *
 * Le lien catalogue (`/sejour-semaine.html?page=2&action=result`) ne reprend
 * pas `datedeb` : le suivre à nu charge le stock non daté. On recopie les
 * paramètres du moteur depuis l'URL courante, sans en inventer.
 */
export function mergeStationNextHref(current: string, nextHref: string): string | null {
  try {
    const here = new URL(current)
    const next = new URL(nextHref, here)
    if (next.origin !== here.origin) return null
    for (const key of ['datedeb', 'datefin', 'duree', 'personnes', 'adultes', 'enfants', 'cid']) {
      const value = here.searchParams.get(key)
      if (value && !next.searchParams.get(key)) next.searchParams.set(key, value)
    }
    if (!next.searchParams.get('action') && here.searchParams.get('action')) {
      next.searchParams.set('action', here.searchParams.get('action') as string)
    }
    return next.toString()
  } catch {
    return null
  }
}
