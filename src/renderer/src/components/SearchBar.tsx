/**
 * Barre de recherche en pilule — destination, dates, groupe, altitude, loupe.
 *
 * Elle ne calcule rien et n'ouvre aucun écran de son propre chef : chaque
 * segment écrit dans **l'état existant** (`domainQuery`, `arrDate`/`depDate`,
 * `travelers`/`rooms`, `baseMin`/`baseMax`) et la loupe fait ce que faisait le
 * bouton « Comparer les domaines » — `patch({ tab: 'recherche' })`. Aucun
 * second système de dates : les semaines sont celles de `data/snow.ts`, les
 * mêmes que l'écran Logements applique.
 *
 * L'autocomplétion cherche dans **tous** les vocabulaires que l'utilisateur a
 * en tête : le domaine (« Les Arcs – Peisey-Vallandry »), le forfait relié
 * (« Paradiski »), la station et le village (« Montchavin », « Val Claret »).
 * Chaque suggestion dit à quoi elle mène — « Montchavin · Paradiski » — parce
 * qu'un nom de village seul ne lève pas l'ambiguïté qu'il crée. La sélection
 * écrit dans `domainQuery` le **domaine ou le forfait** résolu, pas le mot
 * tapé : c'est ce qui fait qu'un village ouvre le même parcours que la
 * sélection directe du domaine. Voir `data/places.ts`.
 *
 * Le groupe (voyageurs + chambres min) se règle ici, pas seulement sur
 * Logements : un plancher posé trop tard laissait croire que la recherche
 * d'accueil n'avait pas de critère de chambres.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { DateRangePicker } from './DateRangePicker'
import { RangeFilter } from './RangeFilter'
import { CountStepper } from '@/components/CountStepper'
import { PARTY_LIMITS } from '@/data/partyLimits'
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

/** Une frappe n'est pas une requete : on attend que la saisie se pose. */
const NEARBY_DEBOUNCE_MS = 450

type Segment = 'dest' | 'dates' | 'party' | 'alt'

export function SearchBar(): JSX.Element {
  const { state, patch, setPeople, domains } = useApp()
  const { fmt, fmtStay } = useFormat()
  const { t } = useI18n()
  const [open, setOpen] = useState<Segment | null>(null)
  const [cursor, setCursor] = useState(-1)
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

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

  /**
   * Choisir une destination — et rien d'autre.
   *
   * Sélectionner n'est pas lancer. Le clic sur une suggestion changeait d'écran
   * sur-le-champ : impossible de choisir « Méribel » puis d'ajuster ses dates,
   * ses voyageurs ou son budget avant de comparer, alors que ce sont les trois
   * segments voisins dans la même pilule. Le champ est rempli, la liste se
   * ferme, le focus revient à la saisie — et l'écran ne bouge pas.
   */
  const select = (text: string): void => {
    patch({ domainQuery: text })
    // L'ordre compte : `focus()` déclenche `onFocus` de façon synchrone, et
    // `onFocus` rouvre la liste. Fermer d'abord puis rendre le focus rouvrirait
    // aussitôt la liste qu'on vient de refermer — on rend donc le focus, *puis*
    // on ferme.
    input.current?.focus()
    setOpen(null)
    setCursor(-1)
  }

  /**
   * Lancer la comparaison — le seul geste qui ouvre un écran.
   *
   * La loupe, et Entrée quand aucune suggestion n'est surlignée. C'est ce que
   * l'en-tête de ce fichier décrit depuis toujours ; le code ne le respectait
   * plus.
   */
  const submit = (text: string): void => {
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
      if (picked) {
        // Entrée sur une suggestion surlignée la choisit, comme le clic. Un
        // second Entrée lance : c'est le comportement attendu d'une liste de
        // complétion, et il laisse la place à un ajustement des dates.
        select(picked.query)
        return
      }
      // Sans sélection, la saisie libre part telle quelle : `matchesFilters`
      // lit le même index et sait déjà résoudre un nom de village.
      submit(state.domainQuery)
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

  const partyLabel =
    state.rooms > 0
      ? t('sb_party_with_rooms')
          .replace('{p}', String(state.travelers))
          .replace('{r}', String(state.rooms))
      : t('sb_party_people').replace('{p}', String(state.travelers))

  /**
   * Même chemin que le tiroir Voyageurs : la liste des personnes est la source,
   * `travelers` en est le décompte. Un `patch({ travelers })` ici et un
   * `setPeople` ailleurs, c'est le groupe affiché qui n'était plus le groupe
   * facturé.
   */
  const setTravelers = (n: number): void => {
    const next = Math.min(PARTY_LIMITS.travelers.max, Math.max(PARTY_LIMITS.travelers.min, n))
    if (state.people.length > 0) {
      if (next <= state.people.length) {
        setPeople(state.people.slice(0, next))
        return
      }
      const extra = Array.from({ length: next - state.people.length }, (_, i) => ({
        id: Date.now() + i,
        first: `Voyageur ${state.people.length + i + 1}`,
        last: '',
        age: 30,
        home: 0
      }))
      setPeople([...state.people, ...extra])
      return
    }
    patch({ travelers: next, children: Math.min(state.children, next - 1) })
  }

  const segClass = (seg: Segment): string => `sb__seg${open === seg ? ' sb__seg--open' : ''}`

  return (
    <div className="sb" ref={root}>
      <div className="sb__seg sb__seg--dest">
        <span className="sb__label" id="sb-dest-label">
          {t('sb_destination')}
        </span>
        <input
          ref={input}
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
                  onClick={() => select(s.query)}
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
                <button type="button" className="sb__opt" onClick={() => select(hit.station.name)}>
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

      <div className={segClass('party')}>
        <span className="sb__label">{t('sb_party')}</span>
        <button
          type="button"
          className="sb__value"
          aria-expanded={open === 'party'}
          aria-haspopup="dialog"
          onClick={() => setOpen(open === 'party' ? null : 'party')}
        >
          {partyLabel}
        </button>
        {open === 'party' && (
          <div className="sb__pop sb__pop--party" role="dialog" aria-label={t('sb_party')}>
            <div className="sb__party-row">
              <p className="sb__party-label">{t('lodg_travelers_field')}</p>
              <CountStepper
                value={state.travelers}
                min={PARTY_LIMITS.travelers.min}
                max={PARTY_LIMITS.travelers.max}
                label={t('lodg_travelers_field')}
                onChange={setTravelers}
              />
            </div>
            <div className="sb__party-row">
              <p className="sb__party-label">{t('lodg_rooms_field')}</p>
              <CountStepper
                value={state.rooms}
                min={PARTY_LIMITS.rooms.min}
                max={PARTY_LIMITS.rooms.max}
                label={t('lodg_rooms_field')}
                minLabel={t('lodg_rooms_studio')}
                onChange={(n) => patch({ rooms: n })}
              />
            </div>
            <p className="sb__party-help">{t('sb_party_help')}</p>
          </div>
        )}
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

      <button type="button" className="sb__go" title={t('sb_go')} aria-label={t('sb_go')} onClick={() => submit(state.domainQuery)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
      </button>
    </div>
  )
}
