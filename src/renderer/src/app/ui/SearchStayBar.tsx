/**
 * SearchStayBar — bloc « search » 21st-inspired (no registry).
 * Station + Dates + Voyageurs + Chambres + un CTA. Écrit dans le store unique
 * (`domainQuery`, `arrDate`/`depDate`, `travelers`, `rooms`) : rien n'est
 * perdu d'un écran à l'autre. `compact` = rangée fine sous la barre haute.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DateRangePicker } from '@/components/DateRangePicker'
import { placeIndex, type PlaceSuggestion } from '@/data/places'
import { stationsNear, type NearbyResult } from '@/data/nearbyStations'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { PATHS } from '../router'
import { ROOMS_MAX, TRAVELERS_MAX, stayDatesLabel } from '../lib/stay'

const MAX_SUGGESTIONS = 8
const MIN_QUERY = 2
const NEARBY_DEBOUNCE_MS = 450

type Seg = 'station' | 'dates'

function Stepper({
  value,
  label,
  min,
  max,
  onChange,
  testid,
  lessLabel,
  moreLabel
}: {
  value: number
  label: string
  min: number
  max: number
  onChange: (n: number) => void
  testid: string
  lessLabel: string
  moreLabel: string
}): JSX.Element {
  return (
    <div className="rc-sb__stepper">
      <button type="button" className="rc-sb__round" aria-label={lessLabel} disabled={value <= min} data-testid={`${testid}-less`} onClick={() => onChange(value - 1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12h10" /></svg>
      </button>
      <span className="rc-sb__count u-num" data-testid={`${testid}-count`}>{label}</span>
      <button type="button" className="rc-sb__round" aria-label={moreLabel} disabled={value >= max} data-testid={`${testid}-more`} onClick={() => onChange(value + 1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v10M7 12h10" /></svg>
      </button>
    </div>
  )
}

export function SearchStayBar({ compact = false }: { compact?: boolean }): JSX.Element {
  const { state, patch, domains } = useApp()
  const { fmtStay, fmt } = useFormat()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [open, setOpen] = useState<Seg | null>(null)
  const [cursor, setCursor] = useState(-1)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open === null) return
    const away = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(null)
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [open])

  const query = state.domainQuery.trim()
  const suggestions = useMemo<PlaceSuggestion[]>(
    () => (query.length < MIN_QUERY ? [] : placeIndex(domains).suggest(query, MAX_SUGGESTIONS)),
    [query, domains]
  )
  const listOpen = open === 'station' && suggestions.length > 0

  const [nearby, setNearby] = useState<NearbyResult | null>(null)
  const [nearbyBusy, setNearbyBusy] = useState(false)
  const indexSilent = open === 'station' && suggestions.length === 0 && query.length >= MIN_QUERY + 1
  useEffect(() => {
    if (!indexSilent) {
      setNearby(null)
      setNearbyBusy(false)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setNearbyBusy(true)
      stationsNear(query, domains, { signal: controller.signal })
        .then(setNearby)
        .catch(() => setNearby(null))
        .finally(() => setNearbyBusy(false))
    }, NEARBY_DEBOUNCE_MS)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [indexSilent, query, domains])
  const nearbyOpen = indexSilent && (nearbyBusy || nearby != null)

  const go = (text: string): void => {
    setOpen(null)
    setCursor(-1)
    patch({ domainQuery: text })
    navigate(PATHS.compare)
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' && listOpen) {
      e.preventDefault()
      setCursor((c) => (c + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && listOpen) {
      e.preventDefault()
      setCursor((c) => (c <= 0 ? suggestions.length - 1 : c - 1))
    } else if (e.key === 'Escape') {
      setOpen(null)
    } else if (e.key === 'Enter') {
      const picked = listOpen && cursor >= 0 ? suggestions[cursor] : null
      go(picked ? picked.query : state.domainQuery)
    }
  }

  const datesLabel = stayDatesLabel(state, fmtStay, (n) => t('dp_nights').replace('{n}', String(n)), t('rc_sb_dates_any'))
  const kindOf = (k: PlaceSuggestion['kind']): string => (k === 'station' ? t('sb_station') : k === 'area' ? t('sb_domain') : t('sb_village'))

  return (
    <div className={`rc-sb${compact ? ' rc-sb--compact' : ''}`} ref={root} data-testid={compact ? 'search-stay-bar-compact' : 'search-stay-bar'}>
      <div className="rc-sb__seg rc-sb__seg--station">
        <span className="rc-sb__label" id="rc-sb-station">{t('rc_sb_station')}</span>
        <input
          className="rc-sb__input"
          value={state.domainQuery}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls="rc-sb-list"
          aria-labelledby="rc-sb-station"
          autoComplete="off"
          placeholder={t('home_search_placeholder')}
          data-testid="sb-station-input"
          onChange={(e) => {
            setCursor(-1)
            setOpen('station')
            patch({ domainQuery: e.target.value })
          }}
          onFocus={() => setOpen('station')}
          onKeyDown={onKey}
        />
        {listOpen && (
          <ul className="rc-sb__list" id="rc-sb-list" role="listbox" data-testid="sb-suggestions">
            {suggestions.map((s, i) => (
              <li key={`${s.kind}-${s.label}-${s.query}`} role="option" aria-selected={i === cursor}>
                <button type="button" className={`rc-sb__opt${i === cursor ? ' rc-sb__opt--on' : ''}`} onMouseEnter={() => setCursor(i)} onClick={() => go(s.query)}>
                  <span className="rc-sb__opt-name">{s.label}</span>
                  {s.context && <span className="rc-sb__opt-ctx">· {s.context}</span>}
                  <span className="rc-sb__opt-kind">{kindOf(s.kind)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {nearbyOpen && (
          <ul className="rc-sb__list" role="listbox" aria-label={t('sb_nearby')}>
            <li className="rc-sb__head" role="presentation">
              {nearbyBusy ? t('sb_nearby_busy') : nearby && nearby.stations.length > 0 ? `${t('sb_nearby')} ${nearby.label}` : t('sb_nearby_none')}
            </li>
            {(nearby?.stations ?? []).map((hit) => (
              <li key={hit.station.id} role="option" aria-selected={false}>
                <button type="button" className="rc-sb__opt" onClick={() => go(hit.station.name)}>
                  <span className="rc-sb__opt-name">{hit.station.name}</span>
                  {hit.station.pass && <span className="rc-sb__opt-ctx">· {hit.station.pass}</span>}
                  <span className="rc-sb__opt-kind u-num">{fmt(hit.km)} km</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`rc-sb__seg${open === 'dates' ? ' rc-sb__seg--open' : ''}`}>
        <span className="rc-sb__label">{t('rc_sb_dates')}</span>
        <button type="button" className="rc-sb__value" aria-haspopup="dialog" aria-expanded={open === 'dates'} data-testid="sb-dates" onClick={() => setOpen(open === 'dates' ? null : 'dates')}>
          {datesLabel}
        </button>
        {open === 'dates' && (
          <div className="rc-sb__pop">
            <DateRangePicker arr={state.arrDate} dep={state.depDate} onChange={(arr, dep) => patch({ arrDate: arr, depDate: dep })} onClose={() => setOpen(null)} />
          </div>
        )}
      </div>

      <div className="rc-sb__seg">
        <span className="rc-sb__label">{t('nav_travelers')}</span>
        <Stepper
          value={state.travelers}
          label={String(state.travelers)}
          min={1}
          max={TRAVELERS_MAX}
          testid="sb-travelers"
          lessLabel={t('sb_less')}
          moreLabel={t('sb_more')}
          onChange={(n) => patch({ travelers: n, children: Math.min(state.children, Math.max(0, n - 1)), ...(state.people.length > 0 && state.people.length !== n ? { people: [] } : {}) })}
        />
      </div>

      <div className="rc-sb__seg">
        <span className="rc-sb__label">{t('sb_rooms')}</span>
        <Stepper
          value={state.rooms}
          label={state.rooms === 0 ? t('sb_rooms_any') : String(state.rooms)}
          min={0}
          max={ROOMS_MAX}
          testid="sb-rooms"
          lessLabel={t('sb_rooms_less')}
          moreLabel={t('sb_rooms_more')}
          onChange={(n) => patch({ rooms: n })}
        />
      </div>

      <button type="button" className="rc-btn rc-btn--cta rc-sb__go" data-testid="sb-go" onClick={() => go(state.domainQuery)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <span>{t('sb_go')}</span>
      </button>
    </div>
  )
}
