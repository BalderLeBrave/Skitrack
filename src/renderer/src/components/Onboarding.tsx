/**
 * Premier lancement — parcours guidé.
 *
 * Phrase type : « Je cherche un appart pour 4 à La Plagne du 7 au 14 févr. »
 * Dates + groupe + station → ouverture directe des logements.
 */

import { useMemo, useRef, useState } from 'react'
import { LogoIcon } from './Icons'
import { StayDatesField } from './StayDatesField'
import { CountStepper } from '@/components/CountStepper'
import { PARTY_LIMITS } from '@/data/partyLimits'
import { useFocusTrap } from '@/hooks/useShortcuts'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useI18n } from '@/i18n'
import type { Domain } from '@/data/referentiel'

const SUGGESTIONS = ['La Plagne', 'Chamonix', 'Méribel', 'Tignes', 'Val Thorens', 'Megève']

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function matchDomain(domains: Domain[], query: string): Domain | null {
  const q = fold(query)
  if (!q) return null
  const exact = domains.find((d) => fold(d.name) === q)
  if (exact) return exact
  return (
    domains.find((d) => fold(d.name).startsWith(q)) ||
    domains.find((d) => fold(d.name).includes(q)) ||
    null
  )
}

function fmtShort(iso: string, lang: string): string {
  if (!iso) return '…'
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
      day: 'numeric',
      month: 'short'
    })
  } catch {
    return iso
  }
}

export function Onboarding(): JSX.Element {
  const { t, lang } = useI18n()
  const { state, patch, domains } = useApp()
  const { origins, nights } = useDerived()
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)

  const [stationQuery, setStationQuery] = useState('La Plagne')
  const matched = useMemo(() => matchDomain(domains, stationQuery), [domains, stationQuery])

  const sentence = useMemo(() => {
    const who = state.travelers
    const where = matched?.name ?? (stationQuery.trim() || '…')
    const from = fmtShort(state.arrDate, lang)
    const to = fmtShort(state.depDate, lang)
    return t('onb_summary')
      .replace('{w}', String(who))
      .replace('{p}', where)
      .replace('{f}', from)
      .replace('{t}', to)
  }, [state.travelers, state.arrDate, state.depDate, matched, stationQuery, lang, t])

  const finish = (goLodgings: boolean): void => {
    if (goLodgings && matched) {
      patch({
        onboard: false,
        selectedId: matched.id,
        lodgingDomainId: matched.id,
        tab: 'logements',
        lodgPhase: 'criteria',
        lodgSearchMsg: null
      })
      return
    }
    patch({ onboard: false })
  }

  return (
    <div className="onboard">
      <div
        ref={ref}
        className="onboard__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Premier lancement"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoIcon size={28} fill="var(--text)" />
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Bienvenue dans SKITRACK
          </h2>
        </div>
        <p className="u-muted" style={{ margin: 0, fontSize: 14 }}>
          {t('welcome_sub')}
        </p>

        {/* Phrase guidée — ancre mentale du parcours. */}
        <p className="onboard__sentence" aria-live="polite">
          {sentence}
        </p>

        <div>
          <p className="sheet__label">{t('your_stay')}</p>
          <StayDatesField />
          <p className="filters__help">{nights} nuit(s)</p>
        </div>

        <div className="filters__pair filters__pair--wide">
          <div>
            <p className="sheet__label">{t('nav_travelers')}</p>
            {/* Mêmes bornes qu'ailleurs, et pour cause : elles vivent
                maintenant dans `data/partyLimits.ts`. Recopiées ici et dans
                `LodgingFilters`, elles valaient 12 et 6 et personne ne pouvait
                demander un chalet de huit chambres. */}
            <CountStepper
              value={state.travelers}
              min={PARTY_LIMITS.travelers.min}
              max={PARTY_LIMITS.travelers.max}
              label={t('nav_travelers')}
              onChange={(n) =>
                patch({ travelers: n, children: Math.min(state.children, n - 1) })
              }
            />
          </div>
          <div>
            <p className="sheet__label">{t('lodg_rooms_field')}</p>
            <CountStepper
              value={state.rooms}
              min={PARTY_LIMITS.rooms.min}
              max={PARTY_LIMITS.rooms.max}
              label={t('lodg_rooms_field')}
              minLabel={t('lodg_rooms_studio')}
              onChange={(n) => patch({ rooms: n })}
            />
          </div>
        </div>

        <div>
          <p className="sheet__label">Station</p>
          <input
            type="search"
            className="field"
            style={{ padding: '9px 10px' }}
            value={stationQuery}
            placeholder="La Plagne, Chamonix…"
            aria-label="Station"
            onChange={(e) => setStationQuery(e.target.value)}
          />
          <div className="onboard__chips" role="list">
            {SUGGESTIONS.map((name) => (
              <button
                key={name}
                type="button"
                className={`chip${fold(stationQuery) === fold(name) ? ' chip--on' : ''}`}
                onClick={() => setStationQuery(name)}
              >
                {name}
              </button>
            ))}
          </div>
          {stationQuery.trim() && !matched && (
            <p className="filters__help" style={{ color: 'var(--warn)' }}>
              {t('onb_station_unknown')}
            </p>
          )}
          {matched && (
            <p className="filters__help">
              {matched.name}
              {matched.massif ? ` · ${matched.massif}` : ''}
            </p>
          )}
        </div>

        <div>
          <p className="sheet__label">{t('start_point_car')}</p>
          <select
            className="field"
            style={{ padding: '9px 10px' }}
            value={state.people[0]?.home ?? 0}
            onChange={(e) => {
              const home = parseInt(e.target.value, 10) || 0
              patch({ people: state.people.map((p) => ({ ...p, home })) })
            }}
          >
            {origins.map((o, i) => (
              <option key={o.id} value={i}>
                {o.fullLabel}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="sheet__label">{t('theme_label')}</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`chip${state.theme !== 'dark' ? ' chip--on' : ''}`}
              onClick={() => patch({ theme: 'light' })}
            >
              Clair
            </button>
            <button
              type="button"
              className={`chip${state.theme === 'dark' ? ' chip--on' : ''}`}
              onClick={() => patch({ theme: 'dark' })}
            >
              Sombre
            </button>
          </div>
        </div>

        <div className="onboard__actions">
          <button
            type="button"
            className="btn btn--primary btn--round"
            disabled={!matched}
            onClick={() => finish(true)}
          >
            Voir les logements
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => finish(false)}>
            Explorer les domaines
          </button>
        </div>
      </div>
    </div>
  )
}
