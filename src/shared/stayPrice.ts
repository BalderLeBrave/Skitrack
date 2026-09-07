/**
 * Prix comparable d'un séjour daté.
 *
 * Un tarif n'entre dans le comparateur que s'il est le **total du séjour**
 * demandé, confirmé. Un « à partir de », une nuit, une semaine d'appel ou un
 * total non qualifié ne se comparent pas — ils se taisent.
 *
 * C'est le filet commun de `aggregateResults`, `cheapestOffer` et `toLodging`.
 * Sans lui, une nuit à 89 € passait devant un séjour à 2 000 €.
 */

export type StayPriceFields = {
  totalPrice?: number | null
  nightlyPrice?: number | null
  weeklyPrice?: number | null
  priceConfidence?: string | null
  priceIsFrom?: boolean | null
}

/**
 * Total du séjour comparable, ou `null`.
 *
 * `nightlyPrice` / `weeklyPrice` ne sont **jamais** un séjour. Un
 * `priceConfidence` autre que `total_confirmed` (y compris absent-mais-partial
 * via `priceIsFrom`) écarte le montant, même s'il est rangé dans `totalPrice`.
 */
export function comparableStayTotal(item: StayPriceFields): number | null {
  if (item.priceIsFrom === true) return null
  const conf = item.priceConfidence
  if (conf === 'partial' || conf === 'unknown') return null
  if (conf != null && conf !== '' && conf !== 'total_confirmed') return null
  const total = item.totalPrice
  if (total == null || !Number.isFinite(total) || total <= 0) return null
  return total
}

/** Tri croissant : totaux confirmés d'abord, le reste après, jamais un zéro implicite. */
export function compareByStayTotal(a: StayPriceFields, b: StayPriceFields): number {
  const left = comparableStayTotal(a)
  const right = comparableStayTotal(b)
  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1
  return left - right
}
