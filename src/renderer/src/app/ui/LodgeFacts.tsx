/**
 * Ligne de métadonnées identique sur carte et fiche.
 * [source]  [altitude IGN]  [distance pistes]  [chambres/pièces]  [pers.]
 * Un trou s'affiche « — », jamais un 0 inventé.
 */

import {
  altitudeMOf,
  altitudeSourceOf,
  capacityMaxOf,
  distToRunsMOf,
  formatAltitude,
  isFuzzyLocation
} from '@/data/canonical'
import type { Lodging } from '@/data/lodgings'
import { sizeLabel, srcOf } from '@/data/lodgings'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'

export function LodgeFacts({ lg, testid }: { lg: Lodging; testid?: string }): JSX.Element {
  const { fmt } = useFormat()
  const { t } = useI18n()
  const src = srcOf(lg)
  const fuzzy = isFuzzyLocation(lg)
  const alt = formatAltitude(altitudeMOf(lg), altitudeSourceOf(lg), fuzzy, fmt)
  const runsM = distToRunsMOf(lg)
  const size = sizeLabel(lg, t)
  const pers = capacityMaxOf(lg)
  const dash = t('rc_lodge_fact_none')

  return (
    <ul className="rc-lodgefacts" data-testid={testid ?? `lodge-facts-${lg.id}`}>
      <li className="rc-lodgefacts__src">{src}</li>
      <li className={alt ? 'crn-releve' : 'rc-muted'} title={alt ? t('rc_lodge_alt_hint') : undefined}>
        {alt ? `${alt.text}${alt.source ? ` ${alt.source}` : ''}` : dash}
      </li>
      <li
        className={runsM != null ? (fuzzy ? 'rc-muted' : 'crn-releve') : 'rc-muted'}
        title={fuzzy ? t('rc_lodge_fuzzy') : undefined}
      >
        {runsM != null ? t('rc_lodge_dist').replace('{m}', fmt(runsM)) : t('rc_lodge_dist_unknown')}
      </li>
      <li>{size ?? dash}</li>
      <li>{pers != null ? t('rc_lodge_cap').replace('{n}', String(pers)) : dash}</li>
    </ul>
  )
}