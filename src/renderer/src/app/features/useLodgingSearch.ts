/**
 * Orchestration du relevé de logements — logique reprise à l'identique de
 * l'ancien écran (contrat collecteur gelé) : Airbnb + connecteurs en
 * parallèle, résultats progressifs, enrichissement d'accès (distance aux
 * pistes) quand le GPS est connu, relance automatique en phase `searching`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { enrichWithAccess } from '@/data/lodgingAccess'
import type { Lodging } from '@/data/lodgings'
import { belongsToDomain } from '@/data/lodgings'
import { hasCoords } from '@/data/referentiel'
import { runAirbnbSearch } from '@/data/runAirbnbSearch'
import {
  lodgingsFromOutcome,
  mergeProviderReadings,
  outcomeSummary,
  runProviderSearch,
  sourceLabelOf,
  sourceStatuses
} from '@/data/runProviderSearch'
import { domainRadiusKm, domainZone } from '@shared/geo'
import { useI18n } from '@/i18n'
import { stayCriteriaReady, useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'

export function useLodgingSearch(): { searchError: string | null; elapsedSec: number; launch: () => Promise<void>; criteriaReady: boolean } {
  const { state, patch } = useApp()
  const derived = useDerived()
  const { t } = useI18n()
  const running = useRef(false)
  const d = derived.lodgDomain
  const [searchError, setSearchError] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const criteriaReady = stayCriteriaReady(state)

  useEffect(() => {
    if (state.lodgPhase !== 'searching') {
      setElapsedSec(0)
      return
    }
    const started = Date.now()
    const id = window.setInterval(() => setElapsedSec(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [state.lodgPhase])

  const launch = useCallback(async (): Promise<void> => {
    if (!d || !criteriaReady || running.current) return
    running.current = true
    setSearchError(null)
    patch({ lodgPhase: 'searching', lodgSearchMsg: 'Recherche des logements…', lodgEmpty: [], lodgFailed: [] })
    const searchParams = {
      domainId: d.id,
      domainName: d.name,
      lat: hasCoords(d) ? d.lat : undefined,
      lon: hasCoords(d) ? d.lon : undefined,
      radiusMeters: hasCoords(d) ? domainRadiusKm(d.km) * 1000 : undefined,
      checkIn: state.arrDate,
      checkOut: state.depDate,
      adults: state.travelers,
      children: state.children,
      nights: derived.nights,
      officialUrl: d.booking ?? d.website,
      existing: state.imported
    }
    const baseImported = state.imported
    const seen = new Set(baseImported.map((l) => l.url).filter(Boolean) as string[])
    const progressive: Lodging[] = []
    const progressiveOutcomes: ReturnType<typeof outcomeSummary>[] = []
    const unsub = window.skitrack.providers.onOutcome((raw) => {
      progressiveOutcomes.push(outcomeSummary(raw))
      const batch = lodgingsFromOutcome(raw, searchParams, seen)
      const label = sourceLabelOf(raw.provider)
      if (batch.length > 0) {
        progressive.push(...batch)
        patch({ imported: mergeProviderReadings(baseImported, progressive), lodgSearchMsg: `${label} · +${batch.length} — ${progressive.length} au total` })
      } else if (raw.error) {
        const soft = /délai|timeout|écartée|robots|navigateur|Chromium|Playwright/i.test(raw.error)
          ? t('lodg_src_unavailable').replace('{s}', label)
          : t('lodg_src_no_result').replace('{s}', label)
        patch({ lodgSearchMsg: progressive.length > 0 ? `${progressive.length} offre(s) — ${soft}` : soft })
      } else {
        patch({ lodgSearchMsg: progressive.length > 0 ? `${progressive.length} offre(s) — recherche en cours…` : `${label} : aucune offre pour ces dates` })
      }
    })
    try {
      const [airbnb, others] = await Promise.allSettled([
        runAirbnbSearch({
          domainId: d.id,
          engineDomainId: d.engineId,
          domainName: d.name,
          departement: d.region,
          villageOrMinAlt: d.village || d.min,
          checkIn: state.arrDate,
          checkOut: state.depDate,
          adults: state.travelers,
          children: state.children,
          capacity: state.travelers,
          nights: derived.nights,
          imported: state.imported,
          zone: hasCoords(d) ? domainZone(d) : null
        }),
        runProviderSearch(searchParams)
      ])
      const ok = airbnb.status === 'fulfilled' && airbnb.value.ok ? airbnb.value : null
      const base: Lodging[] = ok ? ok.imported : state.imported
      const otherLodgings = others.status === 'fulfilled' ? others.value.lodgings : progressive
      const outcomes = others.status === 'fulfilled' ? others.value.outcomes : progressiveOutcomes
      const queried = others.status === 'fulfilled' ? [...new Set(outcomes.map((o) => o.source))] : state.lodgQueried
      const merged = mergeProviderReadings(base, otherLodgings)
      const ofDomain = merged.filter((l) => belongsToDomain(l, d) && typeof l.lat === 'number' && typeof l.lon === 'number')
      let imported = merged
      if (ofDomain.length > 0) {
        const { lodgings: enriched } = await enrichWithAccess(ofDomain, d.engineId)
        const byId = new Map(enriched.map((l) => [l.id, l]))
        imported = merged.map((l) => byId.get(l.id) ?? l)
      }
      if (!ok && otherLodgings.length === 0) {
        const why = [
          airbnb.status === 'rejected' ? String(airbnb.reason) : airbnb.value.ok ? null : airbnb.value.error,
          others.status === 'rejected' ? String(others.reason) : null,
          ...new Set(outcomes.filter((o) => o.error).map((o) => `${o.source} : ${o.error}`))
        ].filter(Boolean)
        setSearchError(why.join(' · ') || t('scan_no_source_answered'))
        patch({ lodgPhase: 'criteria', lodgSearchMsg: null, lodgQueried: queried })
        return
      }
      const { failed, empty } = sourceStatuses(outcomes)
      patch({ imported, lodgPhase: 'results', lodgMapOpen: true, lodgSearchMsg: null, lodgQueried: queried, lodgFailed: failed, lodgEmpty: empty, lastScan: Date.now() })
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err))
      patch({ lodgPhase: 'criteria', lodgSearchMsg: null })
    } finally {
      unsub()
      running.current = false
    }
  }, [d, criteriaReady, state.arrDate, state.depDate, state.travelers, state.children, state.imported, state.lodgQueried, derived.nights, patch, t])

  const accessTried = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (!d || state.lodgPhase !== 'results' || accessTried.current.has(d.id)) return
    const pending = state.imported.filter((l) => belongsToDomain(l, d) && !l.accessComputed && typeof l.lat === 'number' && typeof l.lon === 'number')
    if (pending.length === 0) return
    accessTried.current.add(d.id)
    const snapshot = state.imported
    let cancelled = false
    void (async () => {
      const { lodgings: enriched } = await enrichWithAccess(pending, d.engineId)
      if (cancelled) return
      const measured = new Map(enriched.filter((l) => l.accessComputed).map((l) => [l.id, l]))
      if (measured.size === 0) return
      patch({ imported: snapshot.map((l) => measured.get(l.id) ?? l) })
    })()
    return () => {
      cancelled = true
    }
  }, [d, state.lodgPhase, state.imported, patch])

  useEffect(() => {
    if (state.lodgPhase !== 'searching' || running.current) return
    if (!d || !criteriaReady) {
      patch({ lodgPhase: 'criteria', lodgSearchMsg: null })
      return
    }
    void launch()
  }, [state.lodgPhase, d, criteriaReady, launch, patch])

  return { searchError, elapsedSec, launch, criteriaReady }
}
