/**
 * Météo des domaines visibles.
 *
 * On n'interroge Open-Meteo que pour ce qui est réellement à l'écran — la tête
 * de la liste de résultats, le domaine dont la fiche est ouverte, celui dont on
 * consulte les logements. Demander les 277 domaines à chaque frappe dans les
 * filtres serait à la fois inutile et discourtois envers un service gratuit.
 *
 * ## Ce qui déclenche un relevé
 *
 * Quatre événements, et un seul d'entre eux force la main au cache :
 *
 *  - la liste des domaines voulus change (défilement, ouverture d'une fiche) ;
 *  - l'horloge, toutes les {@link AUTO_REFRESH_MS} ;
 *  - le retour de la fenêtre au premier plan, et le retour de la connexion ;
 *  - le bouton « actualiser », le seul à ignorer le cache.
 *
 * Les trois premiers passent par `fetchWeather` **sans** `force` : le cache de
 * `data/weather.ts` (trois heures) décide seul s'il part une requête. Un tic
 * d'horloge sur une carte encore fraîche ne coûte donc rien qu'une comparaison
 * de dates — la politique de requêtes reste celle du module de données, et le
 * plafond de {@link VISIBLE_DOMAINS} domaines n'est jamais dépassé.
 *
 * ## Pourquoi trente minutes
 *
 * Le cache expire au bout de trois heures. Un rafraîchissement calé sur cette
 * même durée relèverait la péremption jusqu'à trois heures trop tard, et
 * afficherait donc des valeurs de six heures. Un tic quatre fois plus court
 * ramène le pire cas à trois heures et demie, sans multiplier les appels : le
 * nombre de requêtes réellement émises est fixé par le cache, pas par le tic.
 * Descendre plus bas n'améliorerait plus rien — Open-Meteo ne recalcule ses
 * modèles qu'une fois par heure.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Domain } from '@/data/referentiel'
import type { DomainWeather, WeatherMap } from '@/data/weather'
import { fetchWeather } from '@/data/weather'
import { useApp } from './appState'
import { useDerived } from './selectors'

/** Nombre de domaines de tête pour lesquels on affiche la neige réelle. */
const VISIBLE_DOMAINS = 40

/** Intervalle du rafraîchissement automatique. Voir l'en-tête du fichier. */
export const AUTO_REFRESH_MS = 30 * 60 * 1000

interface WeatherContextValue {
  weatherOf: (domainId: number) => DomainWeather | undefined
  loading: boolean
  /** Date du relevé le plus ancien encore affiché, ou `null` si rien n'est chargé. */
  fetchedAt: number | null
  /**
   * Fin du dernier relevé **abouti**, ou `null` si aucun n'a jamais abouti.
   *
   * Distinct de `fetchedAt`, qui date la donnée affichée : après une panne
   * d'Open-Meteo, la donnée reste celle d'avant — c'est légitime, elle est ce
   * qu'on a de mieux — mais on cesse de laisser croire qu'elle vient d'être
   * relevée.
   */
  lastSuccessAt: number | null
  /** Domaines dont le dernier relevé a échoué. `0` quand tout va bien. */
  failed: number
  /** Motif du dernier échec, `null` si le dernier relevé a abouti. */
  error: string | null
  /** Redemande la météo des domaines visibles, cache ignoré. */
  refresh: () => void
}

const WeatherContext = createContext<WeatherContextValue>({
  weatherOf: () => undefined,
  loading: false,
  fetchedAt: null,
  lastSuccessAt: null,
  failed: 0,
  error: null,
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
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null)
  const [failed, setFailed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const inFlight = useRef(false)
  /**
   * Une demande est arrivée pendant un appel en cours.
   *
   * L'ancienne version sortait sur `if (inFlight.current) return` et perdait la
   * demande : ouvrir une fiche pendant le relevé de la liste laissait ce
   * domaine sans météo jusqu'au prochain déclencheur. On la mémorise et on la
   * rejoue à la fin.
   */
  const pending = useRef(false)

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

  // `wanted` et `map` sont lus au moment de l'appel, jamais capturés : les
  // inclure dans les dépendances de `run` relancerait une requête à chaque
  // réponse.
  const wantedRef = useRef<Domain[]>(wanted)
  wantedRef.current = wanted
  const mapRef = useRef<WeatherMap>(map)
  mapRef.current = map

  /** Incrémenté par `refresh` : c'est ce qui relance un relevé forcé. */
  const [round, setRound] = useState(0)
  /** Incrémenté par l'horloge et le retour au premier plan : relevé ordinaire. */
  const [tick, setTick] = useState(0)
  const lastRound = useRef(0)

  const run = useCallback(async (force: boolean): Promise<void> => {
    if (wantedRef.current.length === 0) return
    if (inFlight.current) {
      pending.current = true
      return
    }
    inFlight.current = true
    setLoading(true)
    try {
      const res = await fetchWeather(wantedRef.current, mapRef.current, force)
      setMap((prev) => ({ ...prev, ...res.map }))
      // `requested === 0` : tout était frais, rien n'a été demandé. Ce n'est pas
      // un relevé, donc ni un succès à dater ni un échec à signaler.
      if (res.requested > 0) {
        setFailed(res.failed)
        setError(res.error)
        if (res.succeededAt != null) setLastSuccessAt(res.succeededAt)
      }
    } finally {
      inFlight.current = false
      setLoading(false)
      if (pending.current) {
        pending.current = false
        setTick((n) => n + 1)
      }
    }
  }, [])

  useEffect(() => {
    // Seul un passage par `refresh` force le cache ; un changement de liste ou
    // un tic d'horloge le respecte.
    const force = round > lastRound.current
    lastRound.current = round
    void run(force)
  }, [key, round, tick, run])

  useEffect(() => {
    const auto = (): void => setTick((n) => n + 1)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') auto()
    }
    const id = window.setInterval(auto, AUTO_REFRESH_MS)
    // `focus` et `visibilitychange` se recouvrent selon les plateformes ; les
    // deux sont posés, et le doublon ne coûte rien puisque le cache filtre.
    window.addEventListener('focus', auto)
    window.addEventListener('online', auto)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', auto)
      window.removeEventListener('online', auto)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  /**
   * Date du relevé le plus ancien **parmi les domaines affichés**.
   *
   * Le minimum était pris sur toute la carte météo, cache disque compris : au
   * lancement, une entrée d'hier pour un domaine hors écran suffisait à faire
   * afficher « relevées il y a 15 h » sous une liste dont chaque ligne venait
   * d'être rafraîchie. L'étiquette doit dater ce que l'écran montre, pas le
   * fond du cache.
   */
  const fetchedAt = useMemo(() => {
    const stamps = wanted
      .map((d) => map[d.id]?.fetchedAt)
      .filter((v): v is number => v != null)
    return stamps.length ? Math.min(...stamps) : null
  }, [map, wanted])

  const value = useMemo<WeatherContextValue>(
    () => ({
      weatherOf: (id) => map[id],
      loading,
      fetchedAt,
      lastSuccessAt,
      failed,
      error,
      refresh: () => setRound((n) => n + 1)
    }),
    [map, loading, fetchedAt, lastSuccessAt, failed, error]
  )

  return <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>
}
