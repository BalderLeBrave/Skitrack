/**
 * CheckoutPanel — bloc « ecommerce checkout » 21st-inspired.
 * Récapitulatif à gauche (dates, personnes, chambres, total ventilé par
 * `sejourCost`, source OTA), formulaire court à droite. Aucun envoi serveur :
 * « Confirmer la demande » produit un récapitulatif texte et ouvre l'annonce
 * chez la source, ce que l'écran dit explicitement.
 */

import { useState } from 'react'
import type { Lodging } from '@/data/lodgings'
import { srcOf } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import type { SejourCost } from '@/domain/costs'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'

interface Props {
  lg: Lodging
  d: Domain
  cost: SejourCost
  nights: number
  url: string | null
  firm: boolean
}

export function CheckoutPanel({ lg, d, cost, nights, url, firm }: Props): JSX.Element {
  const { state } = useApp()
  const { eur, fmtStay, fmt } = useFormat()
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)
  const src = srcOf(lg)

  const recap = [
    `${t('rc_ck_title')} — ${d.name}`,
    `${t('rc_sb_dates')} : ${fmtStay(state.arrDate, state.depDate)} (${t('dp_nights').replace('{n}', String(nights))})`,
    `${t('nav_travelers')} : ${state.travelers}${state.rooms ? ` · ${t('sb_rooms')} : ${state.rooms}` : ''}`,
    `${t('rc_ck_lodging')} : ${lg.name} (${src})${url ? ` — ${url}` : ''}`,
    `${t('rc_ck_lodging_cost')} : ${firm ? eur(cost.lodging) : '—'}`,
    `${t('rc_ck_passes')} : ${eur(cost.forfaits)}`,
    cost.route > 0 ? `${t('rc_ck_route')} : ${eur(cost.route)}` : null,
    `${t('rc_ck_total')} : ${firm ? eur(cost.total) : '—'}`,
    name ? `${t('rc_ck_name')} : ${name}` : null,
    email ? `${t('rc_ck_email')} : ${email}` : null,
    note ? `${t('rc_ck_note')} : ${note}` : null
  ]
    .filter(Boolean)
    .join('\n')

  const confirm = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(recap)
      setCopied(true)
    } catch {
      setCopied(false)
    }
    if (url) void window.skitrack.openExternal(url)
  }

  return (
    <div className="rc-ck" data-testid="checkout-panel">
      <section className="rc-ck__recap" aria-label={t('rc_ck_recap')}>
        <h2 className="rc-h2">{t('rc_ck_recap')}</h2>
        <dl className="rc-ck__dl">
          <div><dt>{t('rc_ck_station')}</dt><dd>{d.name}</dd></div>
          <div><dt>{t('rc_sb_dates')}</dt><dd data-testid="checkout-dates">{fmtStay(state.arrDate, state.depDate)} · {t('dp_nights').replace('{n}', String(nights))}</dd></div>
          <div><dt>{t('nav_travelers')}</dt><dd data-testid="checkout-travelers">{state.travelers}</dd></div>
          <div><dt>{t('sb_rooms')}</dt><dd>{state.rooms === 0 ? t('sb_rooms_any') : state.rooms}</dd></div>
          <div><dt>{t('rc_ck_lodging')}</dt><dd>{lg.name} · {lg.type}{lg.ch ? ` · ${lg.ch} ch` : ''} · {t('rc_lodge_cap').replace('{n}', String(lg.pers))}</dd></div>
          <div><dt>{t('rc_ck_source')}</dt><dd data-testid="checkout-source">{src}</dd></div>
        </dl>
        <table className="rc-ck__total" data-testid="checkout-total">
          <tbody>
            <tr><th scope="row">{t('rc_ck_lodging_cost')}</th><td className="crn-releve">{firm ? eur(cost.lodging) : '—'}</td></tr>
            <tr><th scope="row">{t('rc_ck_passes')} · {fmt(cost.adults + cost.kids)} {t('rc_ck_pers')}</th><td className="crn-calcul">{eur(cost.forfaits)}</td></tr>
            {cost.route > 0 && <tr><th scope="row">{t('rc_ck_route')}</th><td className="crn-calcul">{eur(cost.route)}</td></tr>}
            <tr className="rc-ck__sum"><th scope="row">{t('rc_ck_total')}</th><td className="crn-calcul">{firm ? eur(cost.total) : '—'}</td></tr>
          </tbody>
        </table>
        {!firm && <p className="rc-notice rc-notice--warn">{t('rc_ck_not_firm')}</p>}
        {url && (
          <a className="rc-link" href={url} target="_blank" rel="noreferrer" data-testid="checkout-deeplink" onClick={(e) => { e.preventDefault(); void window.skitrack.openExternal(url) }}>
            {t('rc_ck_deeplink').replace('{s}', src)} ↗
          </a>
        )}
      </section>

      <form className="rc-ck__form" onSubmit={(e) => { e.preventDefault(); void confirm() }}>
        <h2 className="rc-h2">{t('rc_ck_form')}</h2>
        <p className="rc-muted">{t('rc_ck_form_note').replace('{s}', src)}</p>
        <label className="rc-field">
          <span>{t('rc_ck_name')}</span>
          <input className="rc-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" data-testid="checkout-name" />
        </label>
        <label className="rc-field">
          <span>{t('rc_ck_email')}</span>
          <input className="rc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" data-testid="checkout-email" />
        </label>
        <label className="rc-field">
          <span>{t('rc_ck_note')}</span>
          <textarea className="rc-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} data-testid="checkout-note" />
        </label>
        <button type="submit" className="rc-btn rc-btn--cta rc-btn--lg" data-testid="checkout-confirm">
          {t('rc_ck_confirm')}
        </button>
        {copied && <p className="rc-notice rc-notice--ok" data-testid="checkout-copied">{t('rc_ck_copied')}</p>}
        <pre className="rc-ck__pre" data-testid="checkout-recap-text">{recap}</pre>
      </form>
    </div>
  )
}
