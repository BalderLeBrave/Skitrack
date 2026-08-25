/**
 * Premier lancement — parcours guidé.
 *
 * Il pose ce qui vaut pour **toute** recherche : les dates, le groupe, le
 * point de départ, les massifs, le budget. Pas la station.
 *
 * Demander une station d'entrée de jeu supposait qu'on sache déjà où aller, ce
 * qui est exactement la question que l'application sert à trancher — « pas quel
 * logement à Val Thorens, mais où partir cette semaine pour ce budget ». Le
 * parcours pré-remplit donc les critères, et rend la main à l'écran Domaines,
 * qui est l'endroit où l'on choisit.
 */

import { useMemo, useRef } from 'react'
import { LogoIcon } from './Icons'
import { useFocusTrap } from '@/hooks/useShortcuts'
import { useApp } from '@/state/appState'
import { useUserData } from '@/state/userData'
import { useDerived } from '@/state/selectors'
import { useI18n } from '@/i18n'

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
  const { setOnboarded } = useUserData()
  const { origins, nights } = useDerived()
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)

  /**
   * Massifs proposés — dérivés du référentiel chargé, jamais écrits en dur.
   * Une liste figée finirait par proposer un massif que le catalogue ne porte
   * plus, et le filtre correspondant ne rendrait alors aucun domaine.
   */
  const massifs = useMemo(() => {
    const seen = new Set<string>()
    for (const d of domains) if (d.massif) seen.add(d.massif)
    return [...seen].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [domains])

  const sentence = useMemo(() => {
    return t('onb_summary')
      .replace('{w}', String(state.travelers))
      .replace('{f}', fmtShort(state.arrDate, lang))
      .replace('{t}', fmtShort(state.depDate, lang))
  }, [state.travelers, state.arrDate, state.depDate, lang, t])

  /**
   * Referme le parcours.
   *
   * Le drapeau part dans la couche `store`, pas dans les préférences : purger
   * les filtres ou changer de schéma de préférences ne doit pas reproposer
   * l'accueil, et le rejouer depuis les Réglages ne doit rien effacer.
   *
   * Les réponses ont déjà été appliquées au fur et à mesure — chaque champ
   * écrit dans l'état à la frappe. Il n'y a donc rien à « valider » ici, et
   * « Passer » laisse en place ce qui a été renseigné avant d'abandonner :
   * un parcours interrompu ne défait pas ce qu'il a déjà servi à régler.
   */
  /**
   * `explore` distingue les deux issues, qui sinon feraient la même chose :
   * les champs s'appliquent à la frappe, il n'y a rien à « valider ». Le
   * bouton principal mène donc où son libellé le dit, et « Passer » laisse sur
   * l'accueil — d'où l'on part quand on ne sait pas encore par quel bout
   * prendre la question.
   */
  const finish = (explore: boolean): void => {
    void setOnboarded(true)
    patch({ onboard: false, ...(explore ? { tab: 'recherche' as const } : {}) })
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input
              type="date"
              className="field"
              style={{ padding: '9px 10px' }}
              value={state.arrDate}
              aria-label={t('onb_arrival_label')}
              onChange={(e) => patch({ arrDate: e.target.value })}
            />
            <input
              type="date"
              className="field"
              style={{ padding: '9px 10px' }}
              value={state.depDate}
              aria-label={t('onb_departure_label')}
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

        {massifs.length > 0 && (
          <div>
            <p className="sheet__label">{t('onb_massif_label')}</p>
            <div className="onboard__chips" role="list">
              {massifs.map((name) => {
                const on = state.massifs.includes(name)
                return (
                  <button
                    key={name}
                    type="button"
                    className={`chip${on ? ' chip--on' : ''}`}
                    aria-pressed={on}
                    onClick={() =>
                      patch({
                        massifs: on ? state.massifs.filter((m) => m !== name) : [...state.massifs, name]
                      })
                    }
                  >
                    {name}
                  </button>
                )
              })}
            </div>
            <p className="filters__help">{t('onb_massif_help')}</p>
          </div>
        )}

        <div>
          <p className="sheet__label">{t('onb_budget_label')}</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button
              type="button"
              className={`chip${state.budgetMode === 'total' ? ' chip--on' : ''}`}
              aria-pressed={state.budgetMode === 'total'}
              onClick={() => patch({ budgetMode: 'total' })}
            >
              {t('alert_mode_total')}
            </button>
            <button
              type="button"
              className={`chip${state.budgetMode === 'perso' ? ' chip--on' : ''}`}
              aria-pressed={state.budgetMode === 'perso'}
              onClick={() => patch({ budgetMode: 'perso' })}
            >
              {t('alert_mode_pp')}
            </button>
          </div>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className="field"
            style={{ padding: '9px 10px' }}
            value={state.budgetMax ?? ''}
            placeholder={t('onb_budget_placeholder')}
            aria-label={t('onb_budget_label')}
            onChange={(e) => {
              const raw = e.target.value.trim()
              // Vider le champ remet le plafond à « absent », et non à zéro :
              // zéro serait un budget nul, qui masquerait toutes les stations.
              const parsed = raw === '' ? null : Math.round(Number(raw))
              patch({ budgetMax: parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : null })
            }}
          />
          <p className="filters__help">{t('onb_budget_help')}</p>
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
          {/* Une seule issue positive : le parcours pose des critères, il ne
              choisit pas de destination. C'est l'écran Domaines qui le fait. */}
          <button type="button" className="btn btn--primary btn--round" onClick={() => finish(true)}>
            {t('onb_explore')}
          </button>
          <span className="u-spacer" />
          {/* « Passer » est toujours visible et n'est jamais désactivé : le
              parcours pré-remplit des filtres, il ne conditionne l'accès à
              rien. */}
          <button type="button" className="linkbtn linkbtn--muted" onClick={() => finish(false)}>
            {t('onb_skip')}
          </button>
        </div>
      </div>
    </div>
  )
}
