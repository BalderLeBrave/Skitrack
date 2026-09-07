/**
 * Rapprochement des départs saisis dans l'application et des départs connus du
 * moteur local.
 *
 * Les adresses sont saisies librement dans le panneau Voyageurs ; le moteur, lui,
 * a besoin d'un point géocodé pour calculer une isochrone ou une matrice
 * d'itinéraires. Le géocodage passe par la Base Adresse Nationale, côté moteur,
 * et le résultat est mémorisé sur le départ pour ne pas regéocoder à chaque
 * clic.
 */

import { ApiError, api } from '@/api/client'
import type { Origin } from './travel'

export function addressOf(place: Pick<Origin, 'addr' | 'cp' | 'city'>): string {
  return [place.addr, [place.cp, place.city].filter(Boolean).join(' ')].filter(Boolean).join(' ').trim()
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Un départ résolu côté moteur : son identifiant **et** sa position. */
export interface ResolvedOrigin {
  id: number
  lat: number
  lon: number
}

/**
 * Résout un départ dans la base du moteur, en le créant au besoin, et rend sa
 * position géocodée.
 *
 * Rendre les coordonnées et non le seul identifiant n'est pas un détail : sans
 * elles, `travelOf` ne peut rien estimer et `computeRoutes` écarte le départ
 * (`origins.filter(hasCoordinates)`). Elles n'étaient jamais demandées, jamais
 * enregistrées, et **saisir une adresse ne changeait donc rien** — ni temps de
 * voiture, ni distance, ni péage, ni carburant. Toute la chaîne trajet
 * attendait un géocodage que personne ne déclenchait.
 *
 * Lève une erreur explicite quand l'adresse est vide ou que le géocodage
 * échoue — l'appelant l'affiche telle quelle.
 */
export async function resolveSidecarOrigin(place: Origin): Promise<ResolvedOrigin> {
  const address = addressOf(place)
  if (!address) {
    throw new Error(`Le départ « ${place.label} » n’a pas d’adresse — complétez-la dans Voyageurs.`)
  }

  const existing = await api.origins()
  if (place.originId != null) {
    const byId = existing.find((o) => o.id === place.originId)
    if (byId) return { id: byId.id, lat: byId.lat, lon: byId.lon }
  }
  const byAddress = existing.find((o) => normalise(o.address) === normalise(address))
  if (byAddress) return { id: byAddress.id, lat: byAddress.lat, lon: byAddress.lon }

  try {
    const created = await api.createOrigin(place.label || 'Départ', address)
    return { id: created.id, lat: created.lat, lon: created.lon }
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(`Géocodage impossible pour « ${address} » : ${err.message}`)
    }
    throw err
  }
}

/** Compatibilité : l'identifiant seul, pour les appelants qui n'ont que faire
 *  de la position (isochrones de la carte). */
export async function ensureSidecarOrigin(place: Origin): Promise<number> {
  return (await resolveSidecarOrigin(place)).id
}
