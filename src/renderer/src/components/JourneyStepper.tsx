/**
 * Fil du parcours — orientation en trois temps.
 *
 * L'application a longtemps posé neuf onglets à plat : rien ne disait qu'on
 * choisit d'abord une station, puis un logement *dans* cette station, puis
 * qu'on compare pour trancher. Ce ruban rend cet ordre visible et cliquable.
 * Il ne remplace pas la barre : il la double sur les seuls écrans du parcours,
 * là où la question « où suis-je, et après ? » se pose.
 *
 * Purement UI : chaque étape rejoue les mêmes `patch({ tab })` que les onglets,
 * aucune logique de sélection ni de calcul n'est touchée. L'étape « Logement »
 * reste verrouillée tant qu'aucune station n'est ouverte — exactement la
 * condition de l'onglet Logements.
 */
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'

/** Coche des étapes franchies. Inline : c'est le seul endroit qui l'emploie.
 *
 *  Montée à neuf quand l'étape passe de « à faire » à « franchie » — le numéro
 *  cède la place au SVG, donc React monte un élément neuf et l'animation de
 *  tracé part d'elle-même, sans minuterie ni état à tenir. */
function CheckMark(): JSX.Element {
  return (
    <span className="journey__check">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/** Écrans où le fil a un sens : ceux de la tâche « trouver un séjour ». */
type StepState = 'active' | 'done' | 'todo' | 'locked'

export function JourneyStepper(): JSX.Element | null {
  const { state, patch, screen } = useApp()
  const { lodgDomain } = useDerived()
  const { t } = useI18n()

  // L'accueil a son propre héros ; les écrans utilitaires (favoris, suivi,
  // réglages) ne font pas partie du parcours. Le fil ne s'affiche donc que sur
  // les trois temps de la recherche d'un séjour.
  const stepOf: Partial<Record<typeof screen, 1 | 2 | 3>> = {
    recherche: 1,
    'import-referentiel': 1,
    logements: 2,
    offres: 3,
    combinaisons: 3,
    decision: 3
  }
  const current = stepOf[screen]
  if (current == null) return null

  const stationChosen = state.lodgingDomainId != null || state.selDomains.length > 0
  const lodgingChosen =
    Object.keys(state.selLodgings).length > 0 || state.decision?.lodgingId != null
  const decided = state.decision != null

  const stateFor = (n: 1 | 2 | 3, done: boolean, locked = false): StepState => {
    if (n === current) return 'active'
    if (locked) return 'locked'
    return done ? 'done' : 'todo'
  }

  const steps: {
    n: 1 | 2 | 3
    label: string
    sub: string
    state: StepState
    onClick?: () => void
  }[] = [
    {
      n: 1,
      label: t('journey_station'),
      // Une fois la station ouverte, son nom remplace la consigne : le fil
      // rappelle *quelle* station on explore, pas seulement l'étape.
      // `lodgDomain` retombe sur le premier domaine quand rien n'est ouvert —
      // on ne montre donc le nom que si une station est réellement choisie.
      sub: state.lodgingDomainId != null && lodgDomain ? lodgDomain.name : t('journey_station_sub'),
      state: stateFor(1, stationChosen),
      onClick: () => patch({ tab: 'recherche' })
    },
    {
      n: 2,
      label: t('journey_lodging'),
      sub: t('journey_lodging_sub'),
      state: stateFor(2, lodgingChosen, state.lodgingDomainId == null),
      onClick:
        state.lodgingDomainId != null ? () => patch({ tab: 'logements' }) : undefined
    },
    {
      n: 3,
      label: t('journey_decision'),
      sub: t('journey_decision_sub'),
      state: stateFor(3, decided),
      onClick: () => patch({ tab: 'offres' })
    }
  ]

  return (
    <nav className="journey" aria-label={t('journey_aria')} data-testid="journey-stepper">
      <ol className="journey__list">
        {steps.map((s, i) => (
          <li key={s.n} className="journey__item">
            {i > 0 && (
              <span
                className="journey__sep"
                data-done={steps[i - 1].state === 'done' ? 'true' : undefined}
                aria-hidden
              />
            )}
            <button
              type="button"
              className="journey__step"
              data-state={s.state}
              data-testid={`journey-step-${s.n}`}
              aria-current={s.state === 'active' ? 'step' : undefined}
              disabled={s.state === 'locked'}
              title={s.state === 'locked' ? t('journey_locked') : undefined}
              onClick={s.onClick}
            >
              <span className="journey__num" aria-hidden>
                {s.state === 'done' ? <CheckMark /> : s.n}
              </span>
              <span className="journey__body">
                <span className="journey__eyebrow">
                  {t('journey_step')} {s.n}
                </span>
                <span className="journey__label">{s.label}</span>
                <span className="journey__sub">{s.sub}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
