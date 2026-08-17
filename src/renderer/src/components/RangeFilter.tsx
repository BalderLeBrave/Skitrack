/**
 * Un filtre chiffré complet : en-tête sur deux lignes, puis le slicer.
 *
 * L'en-tête tient sur deux lignes et non sur une. La valeur d'une plage
 * (« 1 400 m – 1 800 m ») est bien plus longue que celle d'une borne unique
 * (« 1 400 m »), et sur un panneau de filtres réduit à 220 px la mettre en
 * regard du libellé écrasait la colonne de gauche — le titre partait sur cinq
 * lignes. Empilées, les deux tiennent quelle que soit la largeur.
 *
 * Ce composant fait le pont entre l'état applicatif et `RangeSlicer`, qui reste
 * présentationnel : il connaît la clé du filtre, ses bornes et son format.
 */

import { RangeSlicer } from './RangeSlicer'
import type { AppState, FilterRangeKey } from '@/state/appState'
import { FILTER_RANGES, useApp } from '@/state/appState'
import { rangeOpen } from '@/state/selectors'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'

interface Props {
  range: FilterRangeKey
  /** Intitulé neutre : les deux bornes se règlent, pas seulement l'une. */
  label: string
  /** Texte affiché quand la plage est grande ouverte — donc inactive. */
  openKey: TranslationKey
  format: (value: number) => string
  unit?: string
  help?: string
}

export function RangeFilter({ range, label, openKey, format, unit, help }: Props): JSX.Element {
  const { state, patch } = useApp()
  const { t } = useI18n()
  const spec = FILTER_RANGES[range]

  const lo = state[spec.lo] as number
  const hi = state[spec.hi] as number
  const open = rangeOpen(lo, hi, spec.max)

  // Une borne haute au plafond ne se lit pas « 2 400 m » mais « sans limite » :
  // c'est ce que le filtre fait, et le plafond n'est qu'un détail d'échelle.
  const valueText = open
    ? t(openKey)
    : `${format(lo)} – ${hi >= spec.max ? t('range_no_limit') : format(hi)}`

  return (
    <div className="rangefilter">
      <div className="rangefilter__head">
        <span className="rangefilter__label">{label}</span>
        <strong className="rangefilter__value u-num">{valueText}</strong>
      </div>
      <RangeSlicer
        min={spec.min}
        max={spec.max}
        step={spec.step}
        lo={lo}
        hi={hi}
        format={format}
        unit={unit}
        label={label}
        loLabel={t('range_low')}
        hiLabel={t('range_high')}
        onChange={(nextLo, nextHi) =>
          patch({ [spec.lo]: nextLo, [spec.hi]: nextHi } as unknown as Partial<AppState>)
        }
      />
      {help && <p className="filters__help">{help}</p>}
    </div>
  )
}
