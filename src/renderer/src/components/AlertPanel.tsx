/**
 * Réglage de l'alerte d'un élément suivi.
 *
 * Une alerte par suivi, posée sur le total du séjour ou sur le prix par
 * personne. Le panneau ne décide de rien : il écrit une `PriceAlert` dans la
 * couche `store`, et c'est la boucle de relevé qui la confrontera aux prix
 * mesurés (`domain/priceAlerts`).
 *
 * **Saisie du seuil.** Le champ garde une chaîne pendant la frappe et ne borne
 * qu'à la sortie : borner à chaque touche empêche d'effacer « 1200 » pour
 * taper « 900 » — le champ repasserait à son minimum dès le premier caractère
 * retiré. C'est la règle de saisie déjà employée par les filtres chiffrés.
 */

import { useEffect, useState } from 'react'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import type { AlertMode, PriceAlert } from '@/domain/priceAlerts'
import type { TrackedItem } from '@/state/appState'
import { useUserData } from '@/state/userData'

interface Props {
  item: TrackedItem
  alert: PriceAlert | null
  /** Valeur courante dans le mode demandé — sert à armer à la création. */
  currentValue: (mode: AlertMode) => number
  /** Vrai quand au moins deux relevés confirmés existent. */
  hasMeasured: boolean
  initialArmed: (threshold: number, currentValue: number | null) => boolean
}

export function AlertPanel({ item, alert, currentValue, hasMeasured, initialArmed }: Props): JSX.Element {
  const { t, lang } = useI18n()
  const { eur } = useFormat()
  const { putAlert, removeAlert } = useUserData()

  const mode: AlertMode = alert?.mode ?? 'total'
  const [draft, setDraft] = useState<string>('')

  // Le brouillon suit l'alerte enregistrée quand on change d'élément suivi.
  useEffect(() => {
    setDraft(alert ? String(alert.threshold) : '')
  }, [alert?.trackedKey, alert?.threshold, item.key])

  const commit = (nextMode: AlertMode, rawValue: string, active: boolean): void => {
    const parsed = Math.round(Number(rawValue))
    if (!Number.isFinite(parsed) || parsed <= 0) return
    const threshold = Math.min(Math.max(parsed, 1), 10_000_000)
    void putAlert({
      trackedKey: item.key,
      mode: nextMode,
      threshold,
      active,
      // Le cran n'est recalculé qu'à la création ou au changement de seuil :
      // une alerte déjà armée qu'on remet simplement en marche garde son
      // histoire, sinon elle renotifierait au relevé suivant.
      armed:
        alert && alert.threshold === threshold && alert.mode === nextMode
          ? alert.armed
          : initialArmed(threshold, currentValue(nextMode)),
      lastNotifiedAt: alert?.lastNotifiedAt ?? null
    })
  }

  const lastFired =
    alert?.lastNotifiedAt != null
      ? new Date(alert.lastNotifiedAt).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        })
      : null

  return (
    <section className="alertpanel">
      <div className="alertpanel__head">
        <h4 className="alertpanel__title">{t('alert_section_title')}</h4>
        {alert && (
          <button type="button" className="linkbtn linkbtn--muted" onClick={() => void removeAlert(item.key)}>
            {t('alert_remove')}
          </button>
        )}
      </div>

      <div className="alertpanel__row">
        <div className="alertpanel__modes">
          {(['total', 'pp'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`chip${mode === m ? ' chip--on' : ''}`}
              aria-pressed={mode === m}
              onClick={() => {
                if (!draft) return
                commit(m, draft, alert?.active ?? true)
              }}
            >
              {m === 'total' ? t('alert_mode_total') : t('alert_mode_pp')}
            </button>
          ))}
        </div>

        <label className="alertpanel__field">
          <span className="u-muted">{t('alert_threshold_label')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            className="alertpanel__input u-num"
            value={draft}
            placeholder={String(Math.round(currentValue(mode)))}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (!draft) return
              commit(mode, draft, alert?.active ?? true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft) commit(mode, draft, alert?.active ?? true)
            }}
          />
          <span className="u-muted">€</span>
        </label>

        {alert && (
          <label className="check alertpanel__active">
            <input
              type="checkbox"
              checked={alert.active}
              onChange={(e) => commit(alert.mode, String(alert.threshold), e.target.checked)}
            />
            {t('alert_active')}
          </label>
        )}
      </div>

      {/* L'état de l'alerte se dit en toutes lettres. Une cloche seule laisse
          croire qu'un seuil posé suffit à être prévenu, alors que la
          notification suppose un relevé confirmé ET un franchissement. */}
      <p className="u-muted alertpanel__state">
        {!alert
          ? t('alert_none')
          : !hasMeasured
            ? t('alert_no_measure')
            : alert.armed
              ? t('alert_armed')
              : t('alert_waiting')}
      </p>

      {alert && (
        <p className="u-muted alertpanel__state">
          {alert.mode === 'total' ? t('alert_mode_total') : t('alert_mode_pp')} · {eur(alert.threshold)}
          {lastFired ? ` · ${t('alert_last_fired').replace('{d}', lastFired)}` : ''}
        </p>
      )}
    </section>
  )
}
