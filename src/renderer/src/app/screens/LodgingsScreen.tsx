/**
 * E4 — Logements. Filtres prix / type / sources, cartes produit à prix FERME,
 * compteurs honnêtes (prix non extrait ≠ « pas d'annonce »), carte en option.
 * Règle client gelée dans `selectors.tsx` : disponible + capacité + chambres +
 * prix ferme pour les dates et le groupe.
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { LodgingMap } from '@/components/LodgingMap'
import { ImportListingForm } from '@/components/ImportListingForm'
import { FilterPopover } from '@/components/FilterPopover'
import { LodgingFilters } from '@/components/LodgingFilters'
import { useActiveLodgingFilters } from '@/components/activeLodgingFilters'
import { availabilityOf } from '@/data/lodgingAvailability'
import { LODG_TYPES, srcOf } from '@/data/lodgings'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import type { LodgSortKey } from '@/state/appState'
import { FILTER_RANGES, useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useLodgingSearch } from '../features/useLodgingSearch'
import { stayDatesLabel } from '../lib/stay'
import { PATHS } from '../router'
import { EmptyHonest } from '../ui/EmptyHonest'
import { FilterChips, type Chip } from '../ui/FilterChips'
import { LodgeCard } from '../ui/LodgeCard'
import { LodgeSheet } from '../ui/LodgeSheet'
import { StationRibbon } from '../ui/StationRibbon'
import { stationPhotoOf } from '../ui/StationCard'
import { StayBar } from '../ui/StayBar'

const BUDGETS = [1000, 2000, 3000, 5000]
const SORTS: [LodgSortKey, string][] = [['pp_asc', 'rc_sort_pp'], ['total_asc', 'rc_sort_total'], ['dist_asc', 'rc_sort_dist'], ['note_desc', 'rc_sort_note']]

export function LodgingsScreen(): JSX.Element {
  const { state, patch, narrow } = useApp()
  const derived = useDerived()
  const { fmt, fmtStay } = useFormat()
  const { t } = useI18n()
  const { searchError, elapsedSec, launch, criteriaReady } = useLodgingSearch()
  const lodgActive = useActiveLodgingFilters()
  const d = derived.lodgDomain

  const rejected = useMemo(() => {
    const by = { unpriced: 0, other_dates: 0, gone: 0, other: 0 }
    for (const r of derived.lodgRejected) {
      if (r.verdict.reason === 'unpriced') by.unpriced++
      else if (r.verdict.reason === 'other_dates') by.other_dates++
      else if (r.verdict.status === 'gone') by.gone++
      else by.other++
    }
    return by
  }, [derived.lodgRejected])

  const stay = { checkIn: state.arrDate, checkOut: state.depDate }
  const best = useMemo(() => {
    const firm = derived.lodgList.filter((lg) => lg.total > 0 && availabilityOf(lg, stay).status === 'confirmed')
    const cheapest = firm.length > 1 ? [...firm].sort((a, b) => a.total - b.total)[0] : null
    const measured = derived.lodgList.filter((lg) => lg.accessComputed === true)
    const closest = measured.length > 1 ? [...measured].sort((a, b) => (a.skiIn ? 0 : a.dist) - (b.skiIn ? 0 : b.dist))[0] : null
    const out = new Map<number, string[]>()
    if (cheapest) out.set(cheapest.id, [t('rc_lodg_best_price')])
    if (closest) out.set(closest.id, [...(out.get(closest.id) ?? []), t('rc_lodg_closest')])
    return out
  }, [derived.lodgList, stay.checkIn, stay.checkOut, t])

  if (!d) return <EmptyHonest testid="lodgings-no-domain" title={t('lodg_no_domain')} />
  const fallback = stationPhotoOf(d).src

  const sources = [...new Set(derived.lodgAll.map((lg) => srcOf(lg)))]
  const types = LODG_TYPES.filter((ty) => derived.lodgAll.some((lg) => lg.type === ty))
  const budgetOn = state.lodgBudgetMax < FILTER_RANGES.lodgBudget.max
  const chips: Chip[] = [
    ...BUDGETS.map((b) => ({ id: `budget-${b}`, label: t('rc_lodg_budget').replace('{n}', fmt(b)), on: state.lodgBudgetMax === b, onToggle: () => patch({ lodgBudgetMin: 0, lodgBudgetMax: state.lodgBudgetMax === b ? FILTER_RANGES.lodgBudget.max : b }) })),
    ...types.map((ty) => ({ id: `type-${ty}`, label: ty, on: state.lodgTypes.includes(ty), onToggle: () => patch({ lodgTypes: state.lodgTypes.includes(ty) ? state.lodgTypes.filter((x) => x !== ty) : [...state.lodgTypes, ty] }) })),
    { id: 'annul', label: t('rc_lodge_free_cancel'), on: state.lodgAnnul, onToggle: () => patch({ lodgAnnul: !state.lodgAnnul }) },
    ...sources.map((s) => ({ id: `src-${s}`, label: s, on: !state.lodgSrcOff.includes(s), onToggle: () => patch({ lodgSrcOff: state.lodgSrcOff.includes(s) ? state.lodgSrcOff.filter((x) => x !== s) : [...state.lodgSrcOff, s] }) }))
  ]
  const anyFilter = budgetOn || state.lodgTypes.length > 0 || state.lodgAnnul || state.lodgSrcOff.length > 0 || lodgActive.active.length > 0
  const searching = state.lodgPhase === 'searching'
  const mapOpen = state.lodgMapOpen && !narrow

  return (
    <div className={`rc-page${mapOpen ? ' rc-page--map' : ''}`} data-testid="lodgings-screen">
      <header className="rc-page__head rc-page__head--split">
        <div>
          <span className="rc-eyebrow">{t('rc_step_2')}</span>
          <h1 className="rc-h1" data-testid="lodgings-station-name">{t('rc_lodg_title').replace('{d}', d.name)}</h1>
          <p className="rc-muted" data-testid="lodgings-context">
            {stayDatesLabel(state, fmtStay, (n) => t('dp_nights').replace('{n}', String(n)), t('rc_sb_dates_any'))} · {t(state.travelers === 1 ? 'rc_lodg_group_one' : 'rc_lodg_group').replace('{p}', String(state.travelers)).replace('{r}', state.rooms === 0 ? t('sb_rooms_any').toLowerCase() : String(state.rooms))}
            {' · '}<Link to={PATHS.station(d.id)} data-testid="lodgings-station-link">{t('rc_cmp_sheet')}</Link>
          </p>
        </div>
        <div className="rc-page__acts">
          <button type="button" className="rc-btn rc-btn--ghost" data-testid="lodgings-import" onClick={() => patch({ importOpen: true })}>
            {t('import_open')}
          </button>
          <button type="button" className="rc-btn rc-btn--ghost" data-testid="lodgings-refresh" disabled={searching || !criteriaReady} onClick={() => void launch()}>
            {searching ? t('rc_lodg_searching').replace('{s}', String(elapsedSec)) : t('rc_lodg_refresh')}
          </button>
        </div>
      </header>

      <StationRibbon d={d} />

      <section className="rc-block rc-block--rule" data-testid="lodgings-rule">
        <span className="rc-badge rc-badge--ok">{t('rc_lodg_rule_avail')}</span>
        <span className="rc-badge">{t('rc_lodg_rule_cap').replace('{n}', String(state.travelers))}</span>
        {state.rooms > 0 && <span className="rc-badge">{t('rc_lodg_rule_rooms').replace('{n}', String(state.rooms))}</span>}
        <span className="rc-badge">{t('rc_lodg_rule_firm')}</span>
        <span className="rc-muted rc-small">{t('rc_lodg_rule_note')}</span>
      </section>

      {!criteriaReady && <p className="rc-notice rc-notice--warn" data-testid="lodgings-need-dates">{t('rc_lodg_need_dates')}</p>}
      {searching && (
        <div className="rc-progress" role="status" data-testid="lodgings-progress">
          <span className="rc-progress__bar" />
          <span>{state.lodgSearchMsg ?? t('rc_lodg_searching').replace('{s}', String(elapsedSec))}</span>
        </div>
      )}
      {searchError && <p className="rc-notice rc-notice--warn" data-testid="lodgings-error">{searchError}</p>}

      <section className="rc-block" data-testid="lodgings-results">
        <div className="rc-toolbar">
          <FilterPopover
            open={state.lodgFiltersOpen}
            onToggle={() => patch({ lodgFiltersOpen: !state.lodgFiltersOpen })}
            onClose={() => patch({ lodgFiltersOpen: false })}
            label={t('rc_filters')}
            count={lodgActive.active.length}
            buttonClassName="rc-chip"
          >
            <LodgingFilters />
          </FilterPopover>
          <FilterChips chips={chips} label={t('rc_filters')} testid="lodgings-chips" />
          <div className="rc-toolbar__right">
            <span className="rc-muted u-num" data-testid="lodgings-count">{t(derived.lodgList.length === 1 ? 'rc_lodg_count_one' : 'rc_lodg_count').replace('{n}', fmt(derived.lodgList.length))}</span>
            {anyFilter && <button type="button" className="rc-link rc-link--muted" data-testid="lodgings-reset" onClick={lodgActive.resetAll}>{t('rc_reset')}</button>}
            <label className="rc-sort">
              <span>{t('sort_by')}</span>
              <select className="rc-select" value={state.lodgSort} data-testid="lodgings-sort" onChange={(e) => patch({ lodgSort: e.target.value as LodgSortKey })}>
                {SORTS.map(([v, k]) => <option key={v} value={v}>{t(k as Parameters<typeof t>[0])}</option>)}
              </select>
            </label>
            {!narrow && (
              <button type="button" className={`rc-chip${mapOpen ? ' rc-chip--on' : ''}`} aria-pressed={mapOpen} data-testid="lodgings-map-toggle" onClick={() => patch({ lodgMapOpen: !state.lodgMapOpen })}>
                {t('rc_map')}
              </button>
            )}
          </div>
        </div>

        <div className={`rc-lodgsplit${mapOpen ? ' rc-lodgsplit--map' : ''}`}>
          <div className="rc-lodgsplit__list">
            {derived.lodgList.length === 0 && !searching ? (
              <EmptyHonest
                testid="lodgings-empty"
                title={derived.lodgAll.length === 0 ? t('rc_lodg_empty_title') : t('lodg_empty_hidden_title').replace('{n}', String(derived.lodgHidden + derived.lodgRejected.length))}
                hint={derived.lodgAll.length === 0 ? t('rc_lodg_empty_hint') : t('lodg_empty_hidden_hint').replace('{d}', d.name)}
                action={derived.lodgAll.length === 0 && criteriaReady ? { label: t('rc_lodg_refresh'), onClick: () => void launch(), testid: 'lodgings-empty-launch' } : anyFilter ? { label: t('rc_reset'), onClick: lodgActive.resetAll, testid: 'lodgings-empty-reset' } : undefined}
              />
            ) : (
              <div className={`rc-grid ${mapOpen ? 'rc-grid--2' : 'rc-grid--3'}`}>
                {derived.lodgList.map((lg) => <LodgeCard key={lg.id} lg={lg} d={d} nights={derived.nights} badges={best.get(lg.id)} fallback={fallback} />)}
              </div>
            )}
          </div>
          {mapOpen && <div className="rc-lodgsplit__map" data-testid="lodgings-map"><LodgingMap domain={d} /></div>}
        </div>
      </section>

      <section className="rc-block rc-counters" data-testid="lodgings-counters">
        <h2 className="rc-h3">{t('rc_lodg_counters')}</h2>
        <ul>
          <li><b className="u-num">{fmt(derived.lodgAll.length)}</b> {t('rc_cnt_collected')}{state.lodgQueried.length ? ` · ${state.lodgQueried.join(', ')}` : ''}</li>
          <li><b className="u-num">{fmt(derived.lodgList.length)}</b> {t('rc_cnt_shown')}</li>
          <li data-testid="counter-unpriced"><b className="u-num">{fmt(rejected.unpriced)}</b> {t('rc_cnt_unpriced')}</li>
          <li><b className="u-num">{fmt(rejected.other_dates)}</b> {t('rc_cnt_other_dates')}</li>
          <li><b className="u-num">{fmt(rejected.gone)}</b> {t('rc_cnt_gone')}</li>
          <li><b className="u-num">{fmt(derived.lodgHidden)}</b> {t('rc_cnt_filtered')}</li>
          {state.lodgFailed.length > 0 && <li className="rc-warn-text">{t('rc_cnt_failed').replace('{s}', state.lodgFailed.join(', '))}</li>}
          {state.lodgEmpty.length > 0 && <li>{t('rc_cnt_empty').replace('{s}', state.lodgEmpty.join(', '))}</li>}
        </ul>
      </section>

      <StayBar d={d} list={derived.lodgList} />
      {state.ficheId != null && <LodgeSheet domain={d} />}
      {state.importOpen && <ImportListingForm domain={d} />}
    </div>
  )
}
