/**
 * Bandeau de séjour — le pied fixe de l'écran Logements.
 *
 * Uniquement quand un logement a été **retenu** (bouton « Retenir »). Sans
 * ça, afficher un hôtel — même le moins cher, même en le disant — faisait
 * croire à un choix déjà fait. Le coût du moins cher reste dans l'en-tête,
 * légendé « sur le logement le moins cher ».
 */
import type { Domain } from '@/data/referentiel'
import { keptLodgingId } from '@/data/lodgings'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'

export function StayBar({ domain }: { domain: Domain }): JSX.Element | null {
  const { state, patch } = useApp()
  const derived = useDerived()
  const { eur } = useFormat()
  const { t } = useI18n()

  const keptId = keptLodgingId(state.selLodgings, domain.id, derived.lodgAll)
  const lodging = keptId != null ? derived.lodgAll.find((lg) => lg.id === keptId) ?? null : null
  if (!lodging) return null

  // Fiche ouverte : le bandeau s'efface. Il est à z-index 8, la fiche à 6 —
  // laissé en place, il passait devant elle et masquait ses boutons du bas,
  // dont « Ouvrir l'annonce ». La fiche porte ses propres actions ; le bandeau
  // revient à sa fermeture.
  if (state.ficheId != null) return null

  const cost = derived.sejourCost(lodging, domain)

  // Replié : une poignée discrète, le total, et de quoi rouvrir. Le repli est
  // retenu d'une session à l'autre — c'est un choix, pas un état transitoire.
  if (state.stayBarCollapsed) {
    return (
      <div className="staybar staybar--mini" data-testid="stay-bar">
        <span className="staybar__eyebrow">{t('stay_kept')}</span>
        <strong className="u-num crn-calcul" data-testid="stay-bar-total">
          {eur(cost.total)}
        </strong>
        <span className="u-spacer" />
        <button
          type="button"
          className="linkbtn linkbtn--sm"
          aria-expanded={false}
          onClick={() => patch({ stayBarCollapsed: false })}
        >
          {t('staybar_expand')} ▴
        </button>
      </div>
    )
  }

  return (
    <div className="staybar" data-testid="stay-bar">
      <div className="staybar__who">
        <span className="staybar__eyebrow">{t('stay_kept')}</span>
        <span className="staybar__name" title={lodging.name} data-testid="stay-bar-lodging">
          {lodging.name}
        </span>
        <span className="staybar__place">
          {domain.name} · {t('dp_nights').replace('{n}', String(derived.nights))} ·{' '}
          {t('lodg_travelers_count').replace('{n}', String(state.travelers))}
        </span>
      </div>

      <div className="staybar__cost">
        <strong className="staybar__total u-num crn-calcul" data-testid="stay-bar-total">
          {eur(cost.total)}
        </strong>
        <span className="staybar__scope">
          {t('stay_total_scope')
            .replace('{l}', eur(cost.lodging))
            .replace('{f}', eur(cost.forfaits))
            .replace('{r}', eur(cost.route))}
        </span>
      </div>

      <button
        type="button"
        className="staybar__share"
        data-testid="stay-bar-share"
        onClick={() => patch({ staySummaryOpen: true })}
      >
        {t('stay_share')}
      </button>
      <button
        type="button"
        className="btn btn--primary staybar__cta u-nowrap"
        data-testid="stay-bar-compare"
        onClick={() => patch({ tab: 'offres' })}
      >
        {t('stay_compare')} →
      </button>
      <button
        type="button"
        className="linkbtn linkbtn--sm staybar__collapse"
        aria-expanded
        title={t('staybar_collapse')}
        onClick={() => patch({ stayBarCollapsed: true })}
      >
        ▾
      </button>
    </div>
  )
}
