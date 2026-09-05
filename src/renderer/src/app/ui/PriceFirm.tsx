/**
 * PriceFirm — un prix n'est affiché comme prix que s'il est FERME pour les
 * dates et le groupe. Sinon : tiret et motif, jamais un « dès … ».
 */

import type { AvailabilityVerdict } from '@/data/lodgingAvailability'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'

interface Props {
  total: number
  verdict: AvailabilityVerdict
  nights: number
  travelers: number
  size?: 'card' | 'hero'
  testid?: string
}

export function PriceFirm({ total, verdict, nights, travelers, size = 'card', testid }: Props): JSX.Element {
  const { eur } = useFormat()
  const { t } = useI18n()
  const showAmount = total > 0 && (verdict.status === 'confirmed' || verdict.status === 'unrated')

  if (!showAmount) {
    const why =
      verdict.reason === 'unpriced'
        ? t('rc_price_unpriced')
        : verdict.reason === 'other_dates'
          ? t('rc_price_other_dates')
          : verdict.status === 'gone'
            ? t('rc_price_gone')
            : t('rc_price_unrated')
    return (
      <div className={`rc-price rc-price--${size} rc-price--none`} data-testid={testid}>
        <strong className="rc-price__value">—</strong>
        <span className="rc-price__why">{why}</span>
      </div>
    )
  }

  return (
    <div className={`rc-price rc-price--${size}`} data-testid={testid}>
      <strong className="rc-price__value crn-releve">{eur(total)}</strong>
      <span className="rc-price__meta">
        {t('rc_price_stay').replace('{n}', String(nights))}
        {travelers > 0 && ` · ${eur(Math.round(total / travelers))} ${t('rc_price_pp')}`}
      </span>
      {verdict.status === 'confirmed' && <span className="rc-badge rc-badge--ok">{t('rc_price_firm')}</span>}
    </div>
  )
}
