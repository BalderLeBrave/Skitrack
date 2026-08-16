import { useRef } from 'react'
import { LogoIcon } from './Icons'
import { useFocusTrap } from '@/hooks/useShortcuts'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useI18n } from '@/i18n'

/**
 * Premier lancement.
 *
 * Trois réglages, pas dix : les dates du séjour, la taille du groupe et le
 * point de départ suffisent à rendre tous les chiffres de l'application justes.
 * Tout le reste a une valeur par défaut raisonnable et se règle en route.
 */
export function Onboarding(): JSX.Element {
  const { t } = useI18n()
  const { state, patch } = useApp()
  const { origins, nights } = useDerived()
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)

  return (
    <div className="onboard">
      <div ref={ref} className="onboard__panel" role="dialog" aria-modal="true" aria-label="Premier lancement">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoIcon size={28} fill="var(--text)" />
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Bienvenue dans SKITRACK
          </h2>
        </div>
        <p className="u-muted" style={{ margin: 0, fontSize: 14 }}>
          {t('welcome_sub')}
        </p>

        <div>
          <p className="sheet__label">{t('your_stay')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input
              type="date"
              className="field"
              style={{ padding: '9px 10px' }}
              value={state.arrDate}
              aria-label="Date d’arrivée"
              onChange={(e) => patch({ arrDate: e.target.value })}
            />
            <input
              type="date"
              className="field"
              style={{ padding: '9px 10px' }}
              value={state.depDate}
              aria-label="Date de départ"
              onChange={(e) => patch({ depDate: e.target.value })}
            />
          </div>
          <p className="filters__help">{nights} nuit(s)</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <p className="sheet__label">Voyageurs</p>
            <div className="stepper" style={{ padding: '6px 10px' }}>
              <button
                type="button"
                className="stepper__btn"
                style={{ fontSize: 16 }}
                onClick={() => patch({ travelers: Math.max(1, state.travelers - 1) })}
              >
                −
              </button>
              <span className="stepper__value">{state.travelers}</span>
              <button
                type="button"
                className="stepper__btn"
                style={{ fontSize: 16 }}
                onClick={() => patch({ travelers: Math.min(12, state.travelers + 1) })}
              >
                +
              </button>
            </div>
          </div>
          <div>
            <p className="sheet__label">Chambres min</p>
            <div className="stepper" style={{ padding: '6px 10px' }}>
              <button
                type="button"
                className="stepper__btn"
                style={{ fontSize: 16 }}
                onClick={() => patch({ rooms: Math.max(1, state.rooms - 1) })}
              >
                −
              </button>
              <span className="stepper__value">{state.rooms}</span>
              <button
                type="button"
                className="stepper__btn"
                style={{ fontSize: 16 }}
                onClick={() => patch({ rooms: Math.min(6, state.rooms + 1) })}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div>
          <p className="sheet__label">{t('start_point_car')}</p>
          <select
            className="field"
            style={{ padding: '9px 10px' }}
            value={state.people[0]?.home ?? 0}
            onChange={(e) => {
              // Le départ choisi ici devient celui de tout le groupe : au premier
              // lancement, personne n'a encore réparti les voyageurs par foyer.
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

        <button type="button" className="btn btn--primary btn--round" onClick={() => patch({ onboard: false })}>
          Commencer
        </button>
      </div>
    </div>
  )
}
