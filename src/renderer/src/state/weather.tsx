/**
 * Météo des domaines visibles.
 *
 * On n'interroge Open-Meteo que pour ce qui est réellement à l'écran — la tête
 * de la liste de résultats, le domaine dont la fiche est ouverte, celui dont on
 * consulte les logements. Demander les 277 domaines à chaque frappe dans les
 * filtres serait à la fois inutile et discourtois envers un service gratuit.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { DomainWeather, WeatherMap } from '@/data/weather'
import { fetchWeather } from '@/data/weather'
import { useApp } from './appState'
import { useDerived } from './selectors'

/** Nombre de domaines de tête pour lesquels on affiche la neige réelle. */
const VISIBLE_DOMAINS = 40

interface WeatherContextValue {
  weatherOf: (domainId: number) => DomainWeather | undefined
  loading: boolean
  /** Date du relevé le plus ancien encore affiché, ou `null` si rien n'est chargé. */
  fetchedAt: number | null
  /** Redemande la météo des domaines visibles, cache ignoré. */
  refresh: () => void
}

const WeatherContext = createContext<WeatherContextValue>({
  weatherOf: () => undefined,
  loading: false,
  fetchedAt: null,
  refresh: () => undefined
})

export function useWeather(): WeatherContextValue {
  return useContext(WeatherContext)
}

export function WeatherProvider({ children }: { children: ReactNode }): JSX.Element {
  const { state, domains } = useApp()
  const { filtered } = useDerived()
  const [map, setMap] = useState<WeatherMap>({})
  const [loading, setLoading] = useState(false)
  const inFlight = useRef(false)

  const wanted = useMemo(() => {
    const list = filtered.slice(0, VISIBLE_DOMAINS)
    const extra = [state.domFicheId, state.lodgingDomainId, state.selectedId]
      .filter((id): id is number => id != null)
      .map((id) => domains.find((d) => d.id === id))
      .filter((d): d is NonNullable<typeof d> => d != null)
    const seen = new Set(list.map((d) => d.id))
    return [...list, ...extra.filter((d) => !seen.has(d.id))]
    // La clé de dépendance est la liste d'identifiants, pas les objets : le
    // tableau `filtered` est recréé à chaque dérivation.
  }, [filtered, domains, state.domFicheId, state.lodgingDomainId, state.selectedId])

  const key = useMemo(() => wanted.map((d) => d.id).join(','), [wanted])
  // Incrémenté par `refresh` : c'est ce qui relance l'effet sans que la liste
  // des domaines voulus ait changé.
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (wanted.length === 0 || inFlight.current) return
    let cancelled = false
    inFlight.current = true
    setLoading(true)
    // Au-delà du premier tour, l'appel vient du bouton « actualiser » : le
    // cache est ignoré pour ce lot, sans quoi le clic ne ferait rien de visible.
    void fetchWeather(wanted, map, round > 0)
      .then((next) => {
        if (!cancelled) setMap((prev) => ({ ...prev, ...next }))
      })
      .finally(() => {
        inFlight.current = false
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // `map` est volontairement hors dépendances : il est relu à chaque appel et
    // l'inclure relancerait la requête à chaque réponse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, round])

  const fetchedAt = useMemo(() => {
    const stamps = Object.values(map).map((w) => w.fetchedAt)
    return stamps.length ? Math.min(...stamps) : null
  }, [map])

  const value = useMemo<WeatherContextValue>(
    () => ({
      weatherOf: (id) => map[id],
      loading,
      fetchedAt,
      refresh: () => setRound((n) => n + 1)
    }),
    [map, loading, fetchedAt]
  )

  return <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>
}
