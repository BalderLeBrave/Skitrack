/**
 * Liaison React de la couche `store/userData`.
 *
 * Un contexte plutôt qu'un `useState` par écran : l'étoile d'une vignette et la
 * page Favoris lisent la même liste, et deux copies indépendantes finiraient
 * par se contredire — on retirerait un favori depuis la page sans que l'étoile
 * de la carte s'éteigne. Le contexte tient le miroir en mémoire ; le `store`
 * reste la seule chose qui touche au support de stockage.
 *
 * Les mutations sont optimistes : elles remplacent l'état par ce que le `store`
 * renvoie, et le `store` renvoie toujours la liste complète après écriture.
 * Rien à recharger, donc rien à désynchroniser.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { PriceAlert } from '@/domain/priceAlerts'
import {
  addFavorite as storeAdd,
  getAlerts,
  getFavorites,
  getTrips,
  putAlert as storePutAlert,
  putAlerts as storePutAlerts,
  removeAlert as storeRemoveAlert,
  importTrip as storeImport,
  removeFavorite as storeRemove,
  removeTrip as storeRemoveTrip,
  saveTrip as storeSaveTrip,
  toggleFavorite as storeToggle,
  type FavoriteStation,
  type SavedTrip,
  type SavedTripInput
} from '@/store/userData'

export interface UserDataValue {
  favorites: FavoriteStation[]
  /** Appartenance en O(1) — appelé une fois par vignette de la liste. */
  isFavorite: (stationId: number) => boolean
  addFavorite: (stationId: number) => Promise<void>
  removeFavorite: (stationId: number) => Promise<void>
  toggleFavorite: (stationId: number) => Promise<void>
  trips: SavedTrip[]
  /**
   * Enregistre un séjour et renvoie **celui qui a été écrit** — avec son
   * identité définitive. L'appelant en a besoin : partager suppose l'identité
   * du séjour enregistré, et la relire dans `trips` juste après l'appel
   * donnerait la liste d'avant.
   */
  saveTrip: (trip: SavedTripInput) => Promise<SavedTrip | null>
  importTrip: (trip: SavedTrip) => Promise<void>
  removeTrip: (id: string) => Promise<void>
  alerts: PriceAlert[]
  /** Pose ou remplace l'alerte d'un élément suivi. */
  putAlert: (alert: PriceAlert) => Promise<void>
  /** Écrit un lot d'alertes — sortie d'un tour d'évaluation. */
  putAlerts: (alerts: readonly PriceAlert[]) => Promise<void>
  removeAlert: (trackedKey: string) => Promise<void>
  /** Faux tant que la première lecture n'a pas abouti. */
  ready: boolean
}

const UserDataContext = createContext<UserDataValue | null>(null)

export function useUserData(): UserDataValue {
  const ctx = useContext(UserDataContext)
  if (!ctx) throw new Error('useUserData doit être utilisé dans UserDataProvider')
  return ctx
}

export function UserDataProvider({ children }: { children: ReactNode }): JSX.Element {
  const [favorites, setFavorites] = useState<FavoriteStation[]>([])
  const [trips, setTrips] = useState<SavedTrip[]>([])
  const [alerts, setAlerts] = useState<PriceAlert[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [f, t, a] = await Promise.all([getFavorites(), getTrips(), getAlerts()])
      if (!alive) return
      setFavorites(f)
      setTrips(t)
      setAlerts(a)
      setReady(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.stationId)), [favorites])
  const isFavorite = useCallback((stationId: number) => favoriteIds.has(stationId), [favoriteIds])

  const addFavorite = useCallback(async (stationId: number) => {
    setFavorites(await storeAdd(stationId))
  }, [])
  const removeFavorite = useCallback(async (stationId: number) => {
    setFavorites(await storeRemove(stationId))
  }, [])
  const toggleFavorite = useCallback(async (stationId: number) => {
    setFavorites(await storeToggle(stationId))
  }, [])

  const saveTrip = useCallback(async (trip: SavedTripInput): Promise<SavedTrip | null> => {
    const next = await storeSaveTrip(trip)
    setTrips(next)
    // `store.saveTrip` place le séjour écrit en tête de la liste renvoyée.
    return next[0] ?? null
  }, [])
  const importTrip = useCallback(async (trip: SavedTrip) => {
    setTrips(await storeImport(trip))
  }, [])
  const removeTrip = useCallback(async (id: string) => {
    setTrips(await storeRemoveTrip(id))
  }, [])

  const putAlert = useCallback(async (alert: PriceAlert) => {
    setAlerts(await storePutAlert(alert))
  }, [])
  const putAlerts = useCallback(async (next: readonly PriceAlert[]) => {
    setAlerts(await storePutAlerts(next))
  }, [])
  const removeAlert = useCallback(async (trackedKey: string) => {
    setAlerts(await storeRemoveAlert(trackedKey))
  }, [])

  const value = useMemo<UserDataValue>(
    () => ({
      favorites,
      isFavorite,
      addFavorite,
      removeFavorite,
      toggleFavorite,
      trips,
      saveTrip,
      importTrip,
      removeTrip,
      alerts,
      putAlert,
      putAlerts,
      removeAlert,
      ready
    }),
    [
      favorites,
      isFavorite,
      addFavorite,
      removeFavorite,
      toggleFavorite,
      trips,
      saveTrip,
      importTrip,
      removeTrip,
      alerts,
      putAlert,
      putAlerts,
      removeAlert,
      ready
    ]
  )

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>
}
