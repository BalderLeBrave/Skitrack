/**
 * E2 — Comparer. Tableau comparatif des stations cochées + grille de
 * résultats filtrable (référentiel réel), carte des domaines en option.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DomainMap } from '@/components/DomainMap'
import { FilterPanel } from '@/components/FilterPanel'
import { FilterPopover } from '@/components/FilterPopover'
import { useActiveFilters } from '@/components/activeFilters'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import type { AppState, SortKey } from '@/state/appState'
import { FILTER_RANGES, useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { openLodgings } from '../lib/journey'
import { CompareTable } from '../ui/CompareTable'
import { EmptyHonest } from '../ui/EmptyHonest'
import { FilterChips, type Chip } from '../ui/FilterChips'
import { StationCard } from '../ui/StationCard'

const MAX_RESULTS = 40
const SORTS: [SortKey, string][] = [
  ['relevance', 'sort_relevance'],
  ['altitude_min_desc', 'sort_altitude_min_desc'],
  ['altitude_max_desc', 'sort_altitude_max_desc'],
  ['slopes_km_desc', 'sort_slopes_km_desc'],
  ['travel_time_asc', 'sort_travel_time_asc'],
  ['forfait_asc', 'sort_forfait_asc'],
  ['name_asc', 'sort_name_asc']
]

export function CompareScreen(): JSX.Element {
  const { state, patch, domains } = useApp()
  const derived = useDerived()
  const { fmt } = useFormat()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [mapOpen, setMapOpen] = useState(false)
  const { active, resetAll } = useActiveFilters()

  const compared = useMemo(
    () => state.stationCompareIds.map((id) => domains.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => d != null),
    [state.stationCompareIds, domains]
  )
  const list = derived.filtered.slice(0, MAX_RESULTS)

  const toggleRange = (on: boolean, set: Partial<AppState>, reset: Partial<AppState>): void => patch(on ? reset : set)
  const chips: Chip[] = [
    { id: 'large', label: t('home_sc_large'), on: state.kmMin >= 200, onToggle: () => toggleRange(state.kmMin >= 200, { kmMin: 200, kmMax: FILTER_RANGES.km.max }, { kmMin: FILTER_RANGES.km.min }) },
    { id: 'high', label: t('home_sc_high'), on: state.baseMin >= 1800, onToggle: () => toggleRange(state.baseMin >= 1800, { baseMin: 1800, baseMax: FILTER_RANGES.base.max }, { baseMin: FILTER_RANGES.base.min }) },
    { id: 'cheap', label: t('home_sc_cheap'), on: state.forfaitMax <= 260, onToggle: () => toggleRange(state.forfaitMax <= 260, { forfaitMin: 0, forfaitMax: 260 }, { forfaitMax: FILTER_RANGES.forfait.max }) },
    { id: 'near', label: t('home_sc_near'), on: state.travelMax <= 240, onToggle: () => toggleRange(state.travelMax <= 240, { travelMin: 0, travelMax: 240 }, { travelMax: FILTER_RANGES.travel.max }) },
    { id: 'glacier', label: t('rc_cmp_glacier'), on: state.glacier, onToggle: () => patch({ glacier: !state.glacier }) },
    { id: 'linked', label: t('rc_chip_linked'), on: state.linked, onToggle: () => patch({ linked: !state.linked }) },
    ...state.massifs.map((m) => ({ id: `massif-${m}`, label: m, on: true, onToggle: () => patch({ massifs: state.massifs.filter((x) => x !== m) }) }))
  ]
  const anyFilter = active.length > 0 || chips.some((c) => c.on) || state.domainQuery.trim() !== ''

  return (
    <div className="rc-page" data-testid="compare-screen">
      <header className="rc-page__head">
        <div>
          <span className="rc-eyebrow">{t('rc_step_1')}</span>
          <h1 className="rc-h1">{t('rc_cmp_title')}</h1>
          <p className="rc-muted">{t('rc_cmp_lead')}</p>
        </div>
      </header>

      <section className="rc-block" aria-label={t('rc_cmp_table')} data-testid="compare-block">
        <CompareTable stations={compared} />
      </section>

      <section className="rc-block" data-testid="compare-results">
        <div className="rc-toolbar">
          <FilterPopover
            open={state.searchFiltersOpen}
            onToggle={() => patch({ searchFiltersOpen: !state.searchFiltersOpen })}
            onClose={() => patch({ searchFiltersOpen: false })}
            label={t('rc_filters')}
            count={active.length}
            buttonClassName="rc-chip"
          >
            <FilterPanel />
          </FilterPopover>
          <FilterChips chips={chips} label={t('rc_filters')} testid="compare-chips" />
          <div className="rc-toolbar__right">
            <span className="rc-muted u-num" data-testid="compare-count">
              {t('rc_cmp_count').replace('{n}', fmt(derived.filtered.length)).replace('{t}', fmt(domains.length))}
            </span>
            {anyFilter && (
              <button type="button" className="rc-link rc-link--muted" data-testid="compare-reset" onClick={resetAll}>
                {t('rc_reset')}
              </button>
            )}
            <label className="rc-sort">
              <span>{t('sort_by')}</span>
              <select className="rc-select" value={state.sort} data-testid="compare-sort" onChange={(e) => patch({ sort: e.target.value as SortKey })}>
                {SORTS.map(([v, k]) => (
                  <option key={v} value={v}>{t(k as Parameters<typeof t>[0])}</option>
                ))}
              </select>
            </label>
            <button type="button" className={`rc-chip${mapOpen ? ' rc-chip--on' : ''}`} aria-pressed={mapOpen} data-testid="compare-map-toggle" onClick={() => { setMapOpen((o) => !o); patch({ searchMapOpen: !mapOpen, domMapSync: true }) }}>
              {t('rc_map')}
            </button>
          </div>
        </div>

        {mapOpen && (
          <div className="rc-mapwrap" data-testid="compare-map">
            <DomainMap />
          </div>
        )}

        {list.length === 0 ? (
          <EmptyHonest testid="compare-no-results" title={t('rc_cmp_none_title')} hint={t('rc_cmp_none_hint')} action={{ label: t('rc_reset'), onClick: resetAll, testid: 'compare-empty-reset' }} />
        ) : (
          <div className="rc-grid rc-grid--3">
            {list.map((d) => <StationCard key={d.id} d={d} onLodgings={(x) => openLodgings(x, patch, navigate)} />)}
          </div>
        )}
        {derived.filtered.length > MAX_RESULTS && (
          <p className="rc-muted rc-center">{t('rc_cmp_more').replace('{n}', fmt(derived.filtered.length - MAX_RESULTS))}</p>
        )}
      </section>
    </div>
  )
}
