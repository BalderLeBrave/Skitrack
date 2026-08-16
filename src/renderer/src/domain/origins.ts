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

/**
 * Renvoie l'identifiant du départ correspondant dans la base du moteur, en le
 * créant au besoin. Lève une erreur explicite quand l'adresse est vide ou que
 * le géocodage échoue — l'appelant l'affiche telle quelle.
 */
export async function ensureSidecarOrigin(place: Origin): Promise<number> {
  const address = addressOf(place)
  if (!address) {
    throw new Error(`Le départ « ${place.label} » n’a pas d’adresse — complétez-la dans Voyageurs.`)
  }

  const existing = await api.origins()
  if (place.originId != null) {
    const byId = existing.find((o) => o.id === place.originId)
    if (byId) return byId.id
  }
  const byAddress = existing.find((o) => normalise(o.address) === normalise(address))
  if (byAddress) return byAddress.id

  try {
    const created = await api.createOrigin(place.label || 'Départ', address)
    return created.id
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(`Géocodage impossible pour « ${address} » : ${err.message}`)
    }
    throw err
  }
}
