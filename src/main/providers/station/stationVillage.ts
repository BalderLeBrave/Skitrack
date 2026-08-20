/**
 * Filtre village / commune pour les centrales multi-stations (Ingénie).
 *
 * Exemple Val d'Arly : La Giettaz et Notre-Dame-de-Bellecombe partagent
 * `reservation.valdarly-montblanc.com` — sans sélection de `criteres[]`,
 * les inventaires se mélangent.
 */

export interface VillageChoice {
  value: string
  label: string
}

/** Normalise un libellé de station pour comparer destination ↔ option. */
export function normPlace(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Choisit l'option `criteres[]` qui correspond à la station demandée.
 */
export function matchVillageOption(
  options: VillageChoice[],
  destination: string
): VillageChoice | null {
  const target = normPlace(destination)
  if (!target) return null
  const usable = options.filter((o) => o.value && o.value.trim() !== '')
  const exact = usable.find((o) => normPlace(o.label) === target)
  if (exact) return exact
  const contains = usable.find((o) => {
    const label = normPlace(o.label)
    return label.includes(target) || target.includes(label)
  })
  if (contains) return contains
  const tokens = target.split(' ').filter((t) => t.length >= 4)
  if (tokens.length === 0) return null
  return (
    usable.find((o) => {
      const label = normPlace(o.label)
      return tokens.every((t) => label.includes(t))
    }) ?? null
  )
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
  const tokens = d.split(' ').filter((t) => t.length >= 4)
  if (tokens.length > 0 && tokens.every((t) => c.includes(t))) return false
  return true
}
