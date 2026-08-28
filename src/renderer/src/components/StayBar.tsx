/**
 * Bandeau de séjour — le pied fixe de l'écran Logements.
 *
 * L'étape 2 du parcours se terminait sans rien dire : on retenait un logement,
 * et il fallait retrouver seul le chemin de la comparaison. Ce bandeau tient
 * le fil — la station, le logement retenu, le total du séjour — et porte les
 * deux seuls gestes qui closent l'étape : partager le récapitulatif, ou aller
 * trancher.
 *
 * Il ne calcule rien de neuf : `sejourCost` est le même appel que les écrans
 * Offres et Décision, pour que le total ne diverge pas d'un écran à l'autre.
 * Sans logement retenu, il annonce le moins cher **et le dit**, plutôt que de
 * laisser croire à un choix déjà fait.
 */
import type { Domain } from '@/data/referentiel'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'

export function StayBar({ domain }: { domain: Domain }): JSX.Element | null {
  const { state, patch } = useApp()
  const derived = useDerived()
  const { eur } = useFormat()
  const { t } = useI18n()

  const keptId = state.selLodgings[domain.id]
  const kept = keptId != null ? derived.lodgAll.find((lg) => lg.id === keptId) ?? null : null
  const cheapest = derived.lodgAll.filter((lg) => lg.total > 0).sort((a, b) => a.total - b.total)[0] ?? null
  const lodging = kept ?? cheapest
  if (!lodging) return null

  const cost = derived.sejourCost(lodging, domain)

  return (
    <div className="staybar" data-testid="stay-bar">
      <div className="staybar__who">
        <span className="staybar__eyebrow">{kept ? t('stay_kept') : t('stay_cheapest')}</span>
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
    </div>
  )
}
