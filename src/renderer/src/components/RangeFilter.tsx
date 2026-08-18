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
 *
 * ## Deux échelles, et pourquoi
 *
 * `FILTER_RANGES` porte l'échelle **sémantique** (0 – 600 km), sur laquelle se
 * décide si une plage est grande ouverte. `useFilterBounds` rend l'échelle
 * **réelle**, celle qu'occupent les domaines chargés. Le curseur parcourt la
 * seconde ; la traduction se fait ici, dans les deux sens :
 *
 * * une borne basse posée au plancher du référentiel redevient `spec.min` ;
 * * une borne haute poussée au plafond du référentiel redevient `spec.max`.
 *
 * Sans cette traduction, un curseur poussé à fond aurait laissé une plage
 * techniquement « posée » — puce active, liste restreinte — alors que l'écran
 * la montre grande ouverte.
 */

import { RangeSlicer } from './RangeSlicer'
import { useFilterBounds } from './filterBounds'
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
  const bounds = useFilterBounds(range)

  const lo = state[spec.lo] as number
  const hi = state[spec.hi] as number
  const open = rangeOpen(lo, hi, spec.max)

  // Le curseur ne peut montrer que sa propre échelle : une borne enregistrée
  // hors de la plage réelle est ramenée à son extrémité, sans être réécrite
  // dans l'état — la valeur enregistrée reste celle que l'utilisateur a posée.
  const shownLo = Math.min(bounds.max, Math.max(bounds.min, lo))
  const shownHi = Math.min(bounds.max, Math.max(bounds.min, hi))

  // Une borne haute au plafond ne se lit pas « 2 400 m » mais « sans limite » :
  // c'est ce que le filtre fait, et le plafond n'est qu'un détail d'échelle.
  const valueText = open
    ? t(openKey)
    : `${format(shownLo)} – ${hi >= spec.max || shownHi >= bounds.max ? t('range_no_limit') : format(shownHi)}`

  return (
    <div className="rangefilter">
      <div className="rangefilter__head">
        <span className="rangefilter__label">{label}</span>
        <strong className="rangefilter__value u-num">{valueText}</strong>
      </div>
      <RangeSlicer
        min={bounds.min}
        max={bounds.max}
        step={spec.step}
        lo={shownLo}
        hi={shownHi}
        format={format}
        unit={unit}
        label={label}
        loLabel={t('range_low')}
        hiLabel={t('range_high')}
        onChange={(nextLo, nextHi) =>
          patch({
            // Aux extrémités de l'échelle réelle, on réécrit les bornes
            // sémantiques : c'est ce qui rend la plage « grande ouverte » et
            // fait disparaître la puce de filtre actif.
            [spec.lo]: nextLo <= bounds.min ? spec.min : nextLo,
            [spec.hi]: nextHi >= bounds.max ? spec.max : nextHi
          } as unknown as Partial<AppState>)
        }
      />
      {help && <p className="filters__help">{help}</p>}
    </div>
  )
}
