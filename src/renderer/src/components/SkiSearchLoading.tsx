/**
 * Bandeau de relevé logements — volontairement minimal.
 * Un titre, les critères, une barre de progression. Pas de liste source par source.
 */

import type { Domain } from '@/data/referentiel'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'

interface Props {
  domain: Domain
  /** Message de progression (ex. « Centrale · +12 »), optionnel. */
  message?: string | null
  elapsedSec?: number
  timeoutSec?: number
  /** Conservé pour compatibilité d’appel — non affiché. */
  known?: unknown[]
}

export function SkiSearchLoading({
  domain,
  message,
  elapsedSec = 0,
  timeoutSec = 120
}: Props): JSX.Element {
  const { state } = useApp()
  const { fmtDate } = useFormat()
  const { t } = useI18n()

  const criteria = [
    `${fmtDate(state.arrDate)} → ${fmtDate(state.depDate)}`,
    `${state.travelers} ${t('scan_travelers')}`,
    `${state.rooms} ${t('scan_rooms_min')}`
  ].join(' · ')

  const progress = Math.min(0.95, elapsedSec / Math.max(1, timeoutSec))
  const subtitle = message?.trim() || criteria

  return (
    <div className="lodgscan lodgscan--banner" role="status" aria-live="polite" aria-busy="true">
      <div className="lodgscan__head">
        <div className="lodgscan__spinner" aria-hidden />
        <div className="lodgscan__ident">
          <p className="lodgscan__title">
            Recherche d&apos;appartement à {domain.name}
          </p>
          <p className="lodgscan__criteria">{subtitle}</p>
        </div>
      </div>
      <div className="lodgscan__bar">
        <div className="lodgscan__bar-fill" style={{ width: `${Math.max(4, progress * 100)}%` }} />
      </div>
    </div>
  )
}
