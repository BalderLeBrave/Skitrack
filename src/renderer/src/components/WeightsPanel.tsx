/**
 * Poids du classement.
 *
 * Ce réglage vivait dans les Réglages, entre l'apparence et la langue, alors
 * qu'il ne configure pas l'application : il pondère le **score** affiché sur
 * chaque vignette de la recherche. Sa place est auprès des filtres experts,
 * dans le panneau Avancé, où l'on voit la liste bouger en le déplaçant.
 *
 * Extrait tel quel : mêmes bornes, même pas, même remise à zéro.
 */

import { CRITERIA } from '@/domain/scoring'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'

export function WeightsPanel(): JSX.Element {
  const { state, patch } = useApp()
  const { t } = useI18n()

  return (
    <section id="set-weights" className="panel panel--flat settings__section">
      <h2>{t('settings_weights')}</h2>
      <p className="settings__help">{t('settings_weights_help')}</p>
      <div style={{ display: 'grid', gap: 14 }}>
        {CRITERIA.map((c) => {
          const w = state.weights[c.key] ?? c.weight
          return (
            <div key={c.key}>
              <label className="field-label">
                {c.label}
                <strong className="u-nowrap">{Math.round(w * 100)} %</strong>
              </label>
              <input
                type="range"
                min={0}
                max={50}
                step={5}
                value={Math.round(w * 100)}
                onChange={(e) => patch({ weights: { ...state.weights, [c.key]: +e.target.value / 100 } })}
              />
            </div>
          )
        })}
      </div>
      <button type="button" className="btn" style={{ marginTop: 14 }} onClick={() => patch({ weights: {} })}>
        {t('settings_weights_reset')}
      </button>
    </section>
  )
}
