/**
 * Hôtes dont les CGU interdisent la lecture automatisée d'une page isolée.
 *
 * La liste vivait uniquement dans `src/main/listing.ts`, qui refuse ces hôtes
 * avant d'émettre la moindre requête. Le renderer l'ignorait, et l'écran
 * Logements proposait donc « Relever les positions (161) » pour des annonces
 * Booking dont **aucune** ne pouvait aboutir : quinze lectures par passe,
 * quinze refus, et un compte rendu qui disait « 15 refusées par le site » après
 * coup. Proposer une action qu'on sait vouée à l'échec est une forme de
 * mensonge par omission ; l'écran a besoin de la même liste que le lecteur.
 *
 * Elle est ici, dans `shared/`, parce que les deux processus doivent en tirer
 * la même conclusion. La dupliquer les ferait diverger, et c'est alors le
 * bouton qui aurait tort.
 */
export const FORBIDDEN_LISTING_HOSTS = [
  'airbnb.',
  'booking.com',
  'expedia.',
  'hotels.com',
  'vrbo.',
  'abritel.'
] as const

/**
 * Cette adresse relève-t-elle d'un hôte qui refuse la lecture automatisée ?
 *
 * Rend `false` sur une URL illisible : une adresse qu'on ne sait pas analyser
 * n'est pas une adresse interdite, et le lecteur la refusera pour ce motif-là.
 */
export function isForbiddenListingHost(url: string | undefined): boolean {
  if (!url) return false
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  return FORBIDDEN_LISTING_HOSTS.some((h) => host.includes(h))
}
