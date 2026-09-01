/**
 * Récapitulatif du séjour — la fiche qu'on envoie aux autres voyageurs.
 *
 * Un séjour se décide rarement seul : il faut pouvoir sortir de l'application
 * ce qui a été retenu — la station, les dates, le logement, et le détail du
 * coût — sous une forme qui se colle dans un message. C'est du texte brut et
 * non une image : il se relit, se corrige, et passe partout.
 *
 * Rien n'est recalculé ici : `sejourCost` est le même appel que le bandeau de
 * séjour et l'écran Décision. Les montants du récapitulatif sont donc, au
 * centime, ceux qui étaient affichés à l'écran.
 */
import { useEffect, useState } from 'react'
import { CloseIcon } from './Icons'
import { srcOf } from '@/data/lodgings'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'

export function StaySummary(): JSX.Element | null {
  const { state, patch } = useApp()
  const derived = useDerived()
  const { eur, fmtDay } = useFormat()
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const close = (): void => patch({ staySummaryOpen: false })

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') patch({ staySummaryOpen: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [patch])

  const domain = derived.lodgDomain
  if (!domain) return null

  const keptId = state.selLodgings[domain.id]
  const retenu = keptId != null ? derived.lodgAll.find((lg) => lg.id === keptId) ?? null : null
  /*
   * Repli sur le moins cher, **dit** et non tu.
   *
   * Le récapitulatif écrivait « Logement : … » sur le moins cher exactement
   * comme sur celui qu'on avait retenu, sans qu'aucune ligne ne distingue les
   * deux : le texte qu'on copie ou qu'on envoie affirmait donc un choix qui
   * n'avait pas été fait. La barre de séjour, elle, le disait déjà
   * (`stay_cheapest`) ; le récapitulatif s'aligne.
   */
  const lodging =
    retenu ??
    derived.lodgAll.filter((lg) => lg.total > 0).sort((a, b) => a.total - b.total)[0] ??
    null

  const cost = lodging ? derived.sejourCost(lodging, domain) : null
  const heads = cost ? Math.max(1, cost.adults + cost.kids) : 1

  // Le texte est composé ligne à ligne, sans gabarit : chaque poste absent
  // disparaît au lieu de s'écrire « 0 € ».
  const lines = [
    `${t('stay_recap_title')} — ${domain.name}${domain.massif ? ` (${domain.massif})` : ''}`,
    '',
    `${t('lodg_ctx_dates')} : ${fmtDay(state.arrDate)} → ${fmtDay(state.depDate)} (${t('dp_nights').replace('{n}', String(derived.nights))})`,
    `${t('lodg_ctx_group')} : ${t('lodg_travelers_count').replace('{n}', String(state.travelers))}`,
    `${t('altitude_span')} : ${domain.min} – ${domain.max} m`,
    ''
  ]

  if (lodging && cost) {
    lines.push(
      `${t('stay_recap_lodging')} : ${lodging.name} — ${srcOf(lodging)}${
        retenu ? '' : ` (${t('stay_cheapest')})`
      }`,
      ...(lodging.url ? [`${t('stay_recap_link')} : ${lodging.url}`] : []),
      '',
      `${t('stay_recap_costs')} :`,
      `· ${t('stay_recap_c_lodging')} : ${eur(cost.lodging)}`,
      `· ${t('stay_recap_c_passes')} : ${eur(cost.forfaits)}`,
      `· ${t('stay_recap_c_route')} : ${eur(cost.route)}`,
      ...(cost.rental > 0 ? [`· ${t('stay_recap_c_rental')} : ${eur(cost.rental)}`] : []),
      ...(cost.lessons > 0 ? [`· ${t('stay_recap_c_lessons')} : ${eur(cost.lessons)}`] : []),
      '',
      `${t('stay_recap_total')} : ${eur(cost.total)} (${eur(Math.round(cost.total / heads))} ${t('stay_recap_per_head')})`
    )
  } else {
    lines.push(t('stay_recap_no_lodging'))
  }

  const text = lines.join('\n')

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const mail = (): void => {
    const url = `mailto:?subject=${encodeURIComponent(`${t('stay_recap_title')} — ${domain.name}`)}&body=${encodeURIComponent(text)}`
    void window.skitrack.openExternal(url)
  }

  return (
    <>
      <div className="scrim scrim--local" style={{ zIndex: 9 }} onClick={close} />
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('stay_recap_title')}
        data-testid="stay-summary"
      >
        <div className="drawer__head">
          <h3>{t('stay_recap_title')}</h3>
          <span className="u-spacer" />
          <button type="button" className="iconbtn" onClick={close} aria-label={t('close')} data-testid="stay-summary-close">
            <CloseIcon />
          </button>
        </div>

        <div style={{ padding: '18px 22px' }}>
          <p className="u-muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
            {t('stay_recap_help')}
          </p>
          <textarea
            className="field staysum__text"
            readOnly
            rows={14}
            value={text}
            data-testid="stay-summary-text"
          />
        </div>

        <div className="modal__footer">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void copy()}
            data-testid="stay-summary-copy"
          >
            {copied ? `✓ ${t('stay_recap_copied')}` : t('stay_recap_copy')}
          </button>
          <button type="button" className="btn" onClick={mail} data-testid="stay-summary-mail">
            {t('stay_recap_mail')}
          </button>
        </div>
      </div>
    </>
  )
}
