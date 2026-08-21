/**
 * Forme des URL de fiche des centrales Ublo / MSEM.
 *
 * Partagé parce que deux processus en dépendent, et qu'une règle d'URL recopiée
 * est une règle qui se met à diverger :
 *
 * - le **connecteur** (`main/providers/ublo/msem.ts`) la fabrique à partir du
 *   `slug` que rend l'API MSEM ;
 * - le **renderer** répare les URL déjà enregistrées, écrites par une version
 *   qui posait le slug à la racine.
 *
 * L'API MSEM ne rend que le `slug` : elle ne dit nulle part où le site le
 * publie. Le segment est donc relevé, pas déduit — les `sitemap` des trois
 * centrales (`/api/sitemap`, annoncé par leur `robots.txt`) ne publient que
 * `{pathPrefix}/hebergements/{slug}` : 956 URL sur 1096 à l'Alpe d'Huez, 297 à
 * Saint-François-Longchamp, et sous `/fr` à Sainte-Foy.
 */

export const UBLO_LISTING_SEGMENT = 'hebergements'

/** Chemin de fiche, préfixe de langue compris (`/fr` à Sainte-Foy). */
export function ubloListingPath(pathPrefix: string, slug: string): string {
  return `${pathPrefix}/${UBLO_LISTING_SEGMENT}/${slug}`.replace(/\/{2,}/g, '/')
}

/**
 * Réinsère le segment de fiche dans une URL Ublo qui en manque.
 *
 * **Idempotent** : une URL déjà correcte revient inchangée, et l'appeler à
 * chaque chargement ne dérive pas.
 *
 * Volontairement prudent : on ne touche qu'aux chemins d'un seul segment, la
 * signature exacte du défaut. Une URL de la page d'accueil, d'une activité ou
 * d'un forfait a deux segments ou zéro, et sort d'ici intacte. La chaîne est
 * rendue telle quelle si elle n'est pas analysable — réparer n'autorise pas à
 * casser.
 */
export function repairUbloListingUrl(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    // Déjà bon, ou pas la forme visée.
    if (parts.length !== 1 || parts[0] === UBLO_LISTING_SEGMENT) return url
    u.pathname = ubloListingPath('', parts[0])
    return u.href
  } catch {
    return url
  }
}
