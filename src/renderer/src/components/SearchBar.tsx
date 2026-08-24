/**
 * Barre de recherche en pilule — quatre segments et une loupe.
 *
 * Où l'on va, quand, à combien, pour combien. L'altitude en a occupé un
 * cinquième : c'est un critère qui départage deux stations déjà comparables,
 * pas une façon d'en chercher une. Elle est passée dans le panneau Avancé, où
 * elle vivait déjà.
 *
 * Elle ne calcule rien et n'ouvre aucun écran de son propre chef : chaque
 * segment écrit dans **l'état existant** (`domainQuery`, `arrDate`/`depDate`,
 * `travelers`, `budgetMax`) et la loupe fait ce que faisait le bouton
 * « Comparer les domaines » — `patch({ tab: 'recherche' })`. Aucun second
 * système de dates : les semaines sont celles de `data/snow.ts`, les mêmes que
 * l'écran Logements applique.
 *
 * L'autocomplétion cherche dans **tous** les vocabulaires que l'utilisateur a
 * en tête : le domaine (« Les Arcs – Peisey-Vallandry »), le forfait relié
 * (« Paradiski »), la station et le village (« Montchavin », « Val Claret »).
 * Chaque suggestion dit à quoi elle mène — « Montchavin · Paradiski » — parce
 * qu'un nom de village seul ne lève pas l'ambiguïté qu'il crée. La sélection
 * écrit dans `domainQuery` le **domaine ou le forfait** résolu, pas le mot
 * tapé : c'est ce qui fait qu'un village ouvre le même parcours que la
 * sélection directe du domaine. Voir `data/places.ts`.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { DateRangePicker } from './DateRangePicker'
import { placeIndex } from '@/data/places'
import type { PlaceSuggestion } from '@/data/places'
import { stationsNear } from '@/data/nearbyStations'
import type { NearbyResult } from '@/data/nearbyStations'
import { nightsBetween } from '@/domain/format'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'

/** Au-delà, la liste couvre le contenu au lieu de le compléter. */
const MAX_SUGGESTIONS = 8

/** Une lettre suffit à faire correspondre presque tout : deux, c'est un début. */
const MIN_QUERY = 2

const TRAVELERS_MAX = 12

/** Une frappe n'est pas une requete : on attend que la saisie se pose. */
const NEARBY_DEBOUNCE_MS = 450

/** Plafond de saisie : au-delà, le champ ne filtrerait plus rien. */
const BUDGET_MAX = 100_000

type Segment = 'dest' | 'dates' | 'people' | 'budget'

export function SearchBar(): JSX.Element {
  const { state, patch, domains } = useApp()
  const { eur, fmt, fmtStay } = useFormat()
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

  const suggestions = useMemo<PlaceSuggestion[]>(() => {
    const q = state.domainQuery.trim()
    if (q.length < MIN_QUERY) return []
    return placeIndex(domains).suggest(q, MAX_SUGGESTIONS)
  }, [state.domainQuery, domains])

  /**
   * Filet géographique : consulté seulement quand l'index s'est tu.
   *
   * Une recherche qui ne ramène rien sans rien dire est un cul-de-sac. On
   * géocode alors la saisie et on propose les stations les plus proches, par un
   * chemin visuellement distinct — l'utilisateur doit voir qu'on lui répond
   * autre chose que ce qu'il a demandé. Voir `data/nearbyStations.ts`.
   */
  const [nearby, setNearby] = useState<NearbyResult | null>(null)
  const [nearbyBusy, setNearbyBusy] = useState(false)
  const query = state.domainQuery.trim()
  const indexSilent = open === 'dest' && suggestions.length === 0 && query.length >= MIN_QUERY + 1

  useEffect(() => {
    if (!indexSilent) {
      setNearby(null)
      setNearbyBusy(false)
      return
    }
    const controller = new AbortController()
    // Une frappe n'est pas une requête : on laisse la saisie se poser avant
    // d'interroger un service public.
    const timer = window.setTimeout(() => {
      setNearbyBusy(true)
      stationsNear(query, domains, { signal: controller.signal })
        .then((result) => setNearby(result))
        .catch(() => setNearby(null))
        .finally(() => setNearbyBusy(false))
    }, NEARBY_DEBOUNCE_MS)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [indexSilent, query, domains])

  const nearbyOpen = indexSilent && (nearbyBusy || nearby != null)
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
      // Sans sélection, la saisie libre part telle quelle : `matchesFilters`
      // lit le même index et sait déjà résoudre un nom de village.
      go(picked ? picked.query : state.domainQuery)
    }
  }

  /**
   * Ce que montre le segment : la plage et le nombre de nuits.
   *
   * « 7 – 14 févr. · 7 nuits ». Le libellé de semaine relevée disait la même
   * chose en plus long et ne savait rien dire des dates hors liste.
   */
  const nights = nightsBetween(state.arrDate, state.depDate)
  const stayLabel =
    state.arrDate && state.depDate
      ? `${fmtStay(state.arrDate, state.depDate)} · ${t('dp_nights').replace('{n}', String(nights))}`
      : t('sb_week_any')

  const segClass = (seg: Segment): string => `sb__seg${open === seg ? ' sb__seg--open' : ''}`

  /**
   * Budget : la frappe reste une **chaîne**, le clamp attend la sortie du champ.
   *
   * Piloter un `number` à chaque touche rend la saisie inutilisable — effacer
   * « 1200 » pour taper « 900 » passe par la chaîne vide, qu'un `Number()`
   * transforme en zéro, lequel se réécrit aussitôt dans le champ. Vide veut
   * dire « pas de budget », pas « zéro ».
   *
   * `budgetMax` porte toujours le **total du groupe** ; le mode ne change que
   * la lecture et l'écriture, jamais la valeur enregistrée. C'est ce qui évite
   * qu'un aller-retour entre les deux modes déplace le plafond d'un euro.
   */
  const heads = Math.max(1, state.travelers)
  const toDraft = (total: number | null): string =>
    total == null ? '' : String(state.budgetMode === 'perso' ? Math.round(total / heads) : total)
  const [budgetDraft, setBudgetDraft] = useState(() => toDraft(state.budgetMax))

  const commitBudget = (): void => {
    const digits = budgetDraft.trim()
    if (!digits) {
      patch({ budgetMax: null, budgetShowOver: false })
      return
    }
    const saisi = Math.min(BUDGET_MAX, Math.max(1, Number(digits)))
    patch({
      budgetMax: state.budgetMode === 'perso' ? saisi * heads : saisi,
      budgetShowOver: false
    })
    setBudgetDraft(String(saisi))
  }

  const switchBudgetMode = (mode: 'total' | 'perso'): void => {
    if (mode === state.budgetMode) return
    // La valeur enregistrée ne bouge pas : seule sa lecture change.
    const total = state.budgetMax
    patch({ budgetMode: mode })
    setBudgetDraft(total == null ? '' : String(mode === 'perso' ? Math.round(total / heads) : total))
  }

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
              <li key={`${s.kind}-${s.label}-${s.query}`} role="option" aria-selected={i === cursor}>
                <button
                  type="button"
                  className={`sb__opt${i === cursor ? ' sb__opt--on' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(s.query)}
                >
                  <span className="sb__opt-name">{s.label}</span>
                  {/* « Montchavin · Paradiski » : le lieu, puis le domaine
                      auquel il mène. Sans le second, deux villages homonymes
                      de deux massifs sont indiscernables dans la liste. */}
                  {s.context && <span className="sb__opt-context">· {s.context}</span>}
                  <span className="sb__opt-kind">
                    {s.kind === 'station' ? t('sb_station') : s.kind === 'area' ? t('sb_domain') : t('sb_village')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* L'index n'a rien trouvé : on répond par la géographie, et on le dit.
            Le titre de section est ce qui distingue les deux chemins — sans
            lui, l'utilisateur croirait avoir trouvé ce qu'il cherchait. */}
        {nearbyOpen && (
          <ul className="sb__list sb__list--nearby" role="listbox" aria-label={t('sb_nearby')}>
            <li className="sb__nearby-head" role="presentation">
              {nearbyBusy
                ? t('sb_nearby_busy')
                : nearby && nearby.stations.length > 0
                  ? `${t('sb_nearby')} ${nearby.label}`
                  : t('sb_nearby_none')}
            </li>
            {(nearby?.stations ?? []).map((hit) => (
              <li key={hit.station.id} role="option" aria-selected={false}>
                <button type="button" className="sb__opt" onClick={() => go(hit.station.name)}>
                  <span className="sb__opt-name">{hit.station.name}</span>
                  {hit.station.pass && <span className="sb__opt-context">· {hit.station.pass}</span>}
                  <span className="sb__opt-kind u-num">{fmt(hit.km)} km</span>
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
          aria-haspopup="dialog"
          onClick={() => setOpen(open === 'dates' ? null : 'dates')}
        >
          {stayLabel}
        </button>
        {open === 'dates' && (
          <div className="sb__pop sb__pop--cal">
            <DateRangePicker
              arr={state.arrDate}
              dep={state.depDate}
              onChange={(arr, dep) => patch({ arrDate: arr, depDate: dep })}
              onClose={() => setOpen(null)}
            />
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

      <div className={segClass('budget')}>
        <span className="sb__label">{t('budget_label')}</span>
        <button
          type="button"
          className="sb__value"
          aria-expanded={open === 'budget'}
          onClick={() => setOpen(open === 'budget' ? null : 'budget')}
        >
          {state.budgetMax != null
            ? `${eur(state.budgetMax)} ${state.budgetMode === 'perso' ? t('budget_per_person') : t('budget_total')}`
            : t('budget_any')}
        </button>
        {open === 'budget' && (
          <div className="sb__pop">
            <input
              type="text"
              inputMode="numeric"
              className="field field--panel"
              aria-label={t('budget_label')}
              value={budgetDraft}
              onChange={(e) => setBudgetDraft(e.target.value.replace(/[^\d]/g, ''))}
              onBlur={commitBudget}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitBudget()
                  setOpen(null)
                }
              }}
              placeholder={t('budget_any')}
            />
            <div className="seg" role="group" aria-label={t('budget_label')}>
              {(['total', 'perso'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`seg__btn${state.budgetMode === mode ? ' seg__btn--on' : ''}`}
                  aria-pressed={state.budgetMode === mode}
                  onClick={() => switchBudgetMode(mode)}
                >
                  {mode === 'total' ? t('budget_total') : t('budget_per_person')}
                </button>
              ))}
            </div>
            <p className="u-muted" style={{ margin: 0, fontSize: 12, maxWidth: '34ch' }}>
              {t('budget_hint')}
            </p>
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
