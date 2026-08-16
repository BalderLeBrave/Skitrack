/**
 * Gîtes de France — stub, faute d'accès partenaire.
 *
 * ## Ce qui a été vérifié, le 2026-08-12
 *
 * * Aucune API publique documentée, aucun flux XML/CSV partenaire accessible
 *   depuis leur espace professionnel sans compte propriétaire.
 * * `robots.txt` est le fichier Drupal par défaut : il n'ouvre rien de
 *   particulier, il n'interdit pas non plus la racine.
 * * Leurs mentions légales renvoient un HTTP 403 aux clients non navigateurs,
 *   ce qui empêche de constater par lecture automatique la clause de
 *   réutilisation de leur base — raison de plus pour ne rien extraire.
 *
 * Un `robots.txt` permissif ne vaut pas autorisation de réutiliser une base de
 * données : en droit français, une base bénéficie d'une protection propre,
 * indépendante de ce que déclare un fichier technique. Tant qu'un accord
 * partenaire n'est pas obtenu, ce module ne fait aucune requête.
 *
 * ## Comportement
 *
 * Conformément à la spécification : journalise un avertissement, renvoie un
 * tableau vide, ne casse pas l'agrégation. La redirection vers leur recherche
 * pré-remplie reste proposée par ailleurs, ce qui laisse à l'utilisateur un
 * chemin réel vers l'offre.
 *
 * ## Le jour où l'accès existe
 *
 * Remplacer `search()` par l'appel au flux, garder `normalizeGites()` comme
 * point d'entrée du mapping, et retirer l'avertissement. Le reste de
 * l'application ne bouge pas : elle ne connaît que `AccommodationProvider`.
 */

import { debugLog } from '../debug'
import type { Accommodation, AccommodationProvider, ProviderHealth, SearchParams } from '../types'
import { nowIso } from '../types'

const REASON =
  'Gîtes de France ne publie ni API ni flux partenaire accessible. Aucune donnée n’est relevée ; ' +
  'la recherche pré-remplie sur leur site reste disponible.'

/** Prêt pour le jour où un flux existe. Pure, testable sans réseau. */
export function normalizeGites(row: Record<string, unknown>, context: SearchParams): Accommodation | null {
  const sourceId = typeof row.id === 'string' || typeof row.id === 'number' ? String(row.id) : undefined
  const title = typeof row.nom === 'string' ? row.nom.trim() : undefined
  if (!sourceId || !title) return null

  const total = typeof row.prix_sejour === 'number' ? row.prix_sejour : undefined
  return {
    source: 'gites-de-france',
    sourceId,
    title,
    url: typeof row.url === 'string' ? row.url : `https://www.gites-de-france.com/fr/recherche?ref=${sourceId}`,
    latitude: typeof row.latitude === 'number' ? row.latitude : undefined,
    longitude: typeof row.longitude === 'number' ? row.longitude : undefined,
    checkIn: context.checkIn,
    checkOut: context.checkOut,
    guests: typeof row.capacite === 'number' ? row.capacite : undefined,
    bedrooms: typeof row.chambres === 'number' ? row.chambres : undefined,
    totalPrice: total,
    currency: 'EUR',
    availability: undefined,
    availabilityStatus: 'unknown',
    priceConfidence: total != null ? 'total_confirmed' : 'unknown',
    retrievedAt: nowIso(),
    rawProviderData: row
  }
}

export class GitesDeFranceProvider implements AccommodationProvider {
  readonly name = 'gites-de-france'

  async search(_params: SearchParams): Promise<Accommodation[]> {
    // Tableau vide, pas exception : l'agrégation doit continuer sans nous.
    //
    // Et pas de `console.warn` : ce module ne fait aucune requête, il n'a donc
    // aucune nouvelle à donner à chaque recherche. Le motif est déjà porté par
    // `health()`, que l'écran Sources affiche, et par le contenu de ce fichier.
    // Répété dans le terminal du processus principal à chaque relevé, il ne
    // signalait plus rien — il faisait du bruit.
    debugLog('GitesDeFrance', 'Search skipped', { reason: 'aucun accès partenaire' })
    return []
  }

  async health(): Promise<ProviderHealth> {
    return { name: this.name, reachable: false, detail: REASON }
  }
}
