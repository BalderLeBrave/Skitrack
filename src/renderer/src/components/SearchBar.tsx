/**
 * Barre de recherche en pilule — quatre segments et une loupe.
 *
 * Elle ne calcule rien et n'ouvre aucun écran de son propre chef : chaque
 * segment écrit dans **l'état existant** (`domainQuery`, `arrDate`/`depDate`,
 * `travelers`, `baseMin`/`baseMax`) et la loupe fait ce que faisait le bouton
 * « Comparer les domaines » — `patch({ tab: 'recherche' })`. Aucun second
 * système de dates : les semaines sont celles de `data/snow.ts`, les mêmes que
 * l'écran Logements applique.
 *
 * L'autocomplétion cherche dans les **deux** vocabulaires que l'utilisateur a
 * en tête : le nom du domaine relié (« Les Trois Vallées ») et celui de la
 * station (« Val Thorens »). Ne proposer que les domaines revenait à ignorer la
 * moitié des requêtes ; la sélection écrit le texte choisi dans `domainQuery`,
 * que la recherche sait déjà interpréter dans les deux sens.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { RangeFilter } from './RangeFilter'
import { WEEKS, weekByArrival } from '@/data/snow'
import { V25_STATIONS } from '@/data/stations'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'

/** Au-delà, la liste couvre le contenu au lieu de le compléter. */
const MAX_SUGGESTIONS = 8

/** Une lettre suffit à faire correspondre presque tout : deux, c'est un début. */
const MIN_QUERY = 2

const TRAVELERS_MAX = 12

type Segment = 'dest' | 'dates' | 'people' | 'alt'

interface Suggestion {
  text: string
  /** Vrai pour un nom de station, faux pour un nom de domaine. */
  station: boolean
}

export function SearchBar(): JSX.Element {
  const { state, patch, domains } = useApp()
  const { fmt } = useFormat()
  const { t } = useI18n()
  const [open, setOpen] = useState<Segment | null>(null)
  const [cursor, setCursor] = useState(-1)
  const root = useRef<HTMLDivElement>(null)

  // Un clic ailleurs referme le segment ouvert. Sans cela, le popover d'altitude
  // reste posé sur la page pendant qu'on lit les massifs en dessous.
  useEffect(() => {
    if (open === null) return
    const away = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(null)
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [open])

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = state.domainQuery.trim().toLowerCase()
    if (q.length < MIN_QUERY) return []
    const seen = new Set<string>()
    const out: Suggestion[] = []
    const push = (text: string, station: boolean): void => {
      const key = text.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      out.push({ text, station })
    }
    for (const d of domains) if (d.name.toLowerCase().includes(q)) push(d.name, false)
    for (const s of V25_STATIONS) if (s.toLowerCase().includes(q)) push(s, true)
    return out.slice(0, MAX_SUGGESTIONS)
  }, [state.domainQuery, domains])

  const listOpen = open === 'dest' && suggestions.length > 0

  /** Sélection : exactement ce que faisait la saisie libre suivie d'Entrée. */
  const go = (text: string): void => {
    setOpen(null)
    setCursor(-1)
    patch({ domainQuery: text, tab: 'recherche' })
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' && listOpen) {
      e.preventDefault()
      setCursor((c) => (c + 1) % suggestions.length)
      return
    }
    if (e.key === 'ArrowUp' && listOpen) {
      e.preventDefault()
      setCursor((c) => (c <= 0 ? suggestions.length - 1 : c - 1))
      return
    }
    if (e.key === 'Escape') {
      setOpen(null)
      return
    }
    if (e.key === 'Enter') {
      const picked = listOpen && cursor >= 0 ? suggestions[cursor] : null
      go(picked ? picked.text : state.domainQuery)
    }
  }

  const week = weekByArrival(state.arrDate)
  const segClass = (seg: Segment): string => `sb__seg${open === seg ? ' sb__seg--open' : ''}`

  return (
    <div className="sb" ref={root}>
      <div className="sb__seg sb__seg--dest">
        <span className="sb__label" id="sb-dest-label">
          {t('sb_destination')}
        </span>
        <input
          className="sb__input"
          value={state.domainQuery}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls="sb-dest-list"
          aria-labelledby="sb-dest-label"
          autoComplete="off"
          onChange={(e) => {
            setCursor(-1)
            setOpen('dest')
            patch({ domainQuery: e.target.value })
          }}
          onFocus={() => setOpen('dest')}
          onKeyDown={onKey}
          placeholder={t('home_search_placeholder')}
          aria-label={t('search_aria')}
        />
        {listOpen && (
          <ul className="sb__list" id="sb-dest-list" role="listbox">
            {suggestions.map((s, i) => (
              <li key={`${s.station ? 's' : 'd'}-${s.text}`} role="option" aria-selected={i === cursor}>
                <button
                  type="button"
                  className={`sb__opt${i === cursor ? ' sb__opt--on' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(s.text)}
                >
                  <span className="sb__opt-name">{s.text}</span>
                  <span className="sb__opt-kind">{s.station ? t('sb_station') : t('sb_domain')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={segClass('dates')}>
        <span className="sb__label">{t('sb_dates')}</span>
        <button
          type="button"
          className="sb__value"
          aria-expanded={open === 'dates'}
          onClick={() => setOpen(open === 'dates' ? null : 'dates')}
        >
          {week ? week.label : t('sb_week_any')}
        </button>
        {open === 'dates' && (
          <div className="sb__pop">
            {WEEKS.map((w) => (
              <button
                key={w.arr}
                type="button"
                className={`weekrow${w.arr === state.arrDate ? ' weekrow--on' : ''}`}
                onClick={() => {
                  patch({ arrDate: w.arr, depDate: w.dep })
                  setOpen(null)
                }}
              >
                <span>{w.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sb__seg">
        <span className="sb__label">{t('nav_travelers')}</span>
        {/* Boutons ronds à traits SVG : le glyphe « − » n'est pas centré dans sa
            gouttière et se lisait décalé de deux pixels dans un cercle de
            24 px. */}
        <div className="sb__stepper">
          <button
            type="button"
            className="sb__round"
            aria-label={t('sb_less')}
            disabled={state.travelers <= 1}
            onClick={() =>
              patch({
                travelers: Math.max(1, state.travelers - 1),
                children: Math.min(state.children, Math.max(1, state.travelers - 1) - 1)
              })
            }
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 12h10" />
            </svg>
          </button>
          <span className="sb__count u-num">{state.travelers}</span>
          <button
            type="button"
            className="sb__round"
            aria-label={t('sb_more')}
            disabled={state.travelers >= TRAVELERS_MAX}
            onClick={() => patch({ travelers: Math.min(TRAVELERS_MAX, state.travelers + 1) })}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 7v10M7 12h10" />
            </svg>
          </button>
        </div>
      </div>

      <div className={segClass('alt')}>
        <span className="sb__label">{t('altitude_bottom')}</span>
        <button
          type="button"
          className="sb__value"
          aria-expanded={open === 'alt'}
          onClick={() => setOpen(open === 'alt' ? null : 'alt')}
        >
          {`${fmt(state.baseMin)} m`}
        </button>
        {open === 'alt' && (
          <div className="sb__pop sb__pop--wide">
            <RangeFilter
              range="base"
              label={t('altitude_bottom')}
              openKey="range_all_altitudes"
              format={(v) => `${fmt(v)} m`}
              unit="m"
            />
          </div>
        )}
      </div>

      <button type="button" className="sb__go" title={t('sb_go')} aria-label={t('sb_go')} onClick={() => go(state.domainQuery)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
      </button>
    </div>
  )
}
