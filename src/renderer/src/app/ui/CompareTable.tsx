/**
 * CompareTable — colonnes = stations cochées, lignes = critères du
 * référentiel. « — » quand la donnée manque ; « estimé » quand le forfait
 * vient d'une moyenne. Un seul CTA : voir les logements de la station choisie.
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { belongsToDomain, medianTotal } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { snowDepths } from '@/data/weather'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useWeather } from '@/state/weather'
import { openLodgings } from '../lib/journey'
import { PATHS } from '../router'
import { EmptyHonest } from './EmptyHonest'

const NONE = '—'

export function CompareTable({ stations }: { stations: Domain[] }): JSX.Element {
  const { state, patch } = useApp()
  const derived = useDerived()
  const { weatherOf } = useWeather()
  const { fmt, eur } = useFormat()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [chosen, setChosen] = useState<number | null>(null)

  if (stations.length === 0) {
    return <EmptyHonest testid="compare-empty" title={t('rc_cmp_empty_title')} hint={t('rc_cmp_empty_hint')} />
  }

  const pick = stations.find((d) => d.id === chosen) ?? stations[0]
  const remove = (id: number): void => patch({ stationCompareIds: state.stationCompareIds.filter((x) => x !== id) })

  const snowCell = (d: Domain): string => {
    const s = snowDepths(weatherOf(d.id))
    return s.releve && s.bas != null && s.haut != null && (s.bas > 0 || s.haut > 0) ? `${fmt(s.bas)} / ${fmt(s.haut)} cm` : NONE
  }
  const passCell = (d: Domain): JSX.Element => {
    const f = derived.forfaitOf(d)
    if (f.j6 == null) return <>{NONE}</>
    return (
      <>
        <span className={f.estimated ? '' : 'crn-releve'}>{eur(f.j6)}</span>
        {f.estimated && <small className="rc-est"> {t('estimated')}</small>}
      </>
    )
  }
  const medianCell = (d: Domain): string => {
    const stay = { checkIn: state.arrDate, checkOut: state.depDate }
    const priced = state.imported.filter(
      (l) => belongsToDomain(l, d) && l.total > 0 && l.priceCheckIn === stay.checkIn && l.priceCheckOut === stay.checkOut
    )
    return priced.length ? eur(medianTotal(priced)) : NONE
  }
  const travelCell = (d: Domain): string => {
    const txt = derived.travelText(d)
    return txt && !/aucune|—/i.test(txt) ? txt : NONE
  }

  const rows: { key: string; label: string; cell: (d: Domain) => React.ReactNode; mono?: boolean }[] = [
    { key: 'snow', label: t('rc_cmp_snow'), cell: snowCell, mono: true },
    { key: 'alt', label: t('rc_fact_alt'), cell: (d) => `${fmt(d.min)}–${fmt(d.max)} m`, mono: true },
    { key: 'km', label: t('rc_fact_km'), cell: (d) => `${fmt(d.km)} km`, mono: true },
    { key: 'lifts', label: t('rc_cmp_lifts'), cell: (d) => fmt(d.lifts), mono: true },
    { key: 'pass', label: t('rc_fact_pass'), cell: passCell },
    { key: 'median', label: t('rc_cmp_median'), cell: medianCell, mono: true },
    { key: 'travel', label: t('rc_cmp_travel'), cell: travelCell },
    { key: 'linked', label: t('rc_cmp_linked'), cell: (d) => d.pass ?? NONE },
    { key: 'glacier', label: t('rc_cmp_glacier'), cell: (d) => (d.glacier ? t('rc_yes') : t('rc_no')) },
    { key: 'region', label: t('rc_cmp_region'), cell: (d) => `${d.massif} · ${d.region}` }
  ]

  return (
    <div className="rc-cmp" data-testid="compare-table">
      <div className="rc-cmp__scroll">
        <table className="rc-cmp__table">
          <thead>
            <tr>
              <th scope="col" className="rc-cmp__crit">{t('rc_cmp_criteria')}</th>
              {stations.map((d) => (
                <th key={d.id} scope="col" className={`rc-cmp__col${pick.id === d.id ? ' rc-cmp__col--pick' : ''}`} data-testid={`compare-col-${d.id}`}>
                  <label className="rc-cmp__pick">
                    <input type="radio" name="rc-cmp-pick" checked={pick.id === d.id} onChange={() => setChosen(d.id)} data-testid={`compare-pick-${d.id}`} />
                    <span className="rc-cmp__name" title={d.name}>{d.name}</span>
                  </label>
                  <div className="rc-cmp__colacts">
                    <Link to={PATHS.station(d.id)} className="rc-link" data-testid={`compare-sheet-${d.id}`}>{t('rc_cmp_sheet')}</Link>
                    <button type="button" className="rc-link rc-link--muted" onClick={() => remove(d.id)} aria-label={t('rc_cmp_remove').replace('{d}', d.name)} data-testid={`compare-remove-${d.id}`}>✕</button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} data-testid={`compare-row-${r.key}`}>
                <th scope="row" className="rc-cmp__crit">{r.label}</th>
                {stations.map((d) => {
                  const v = r.cell(d)
                  return (
                    <td key={d.id} className={`${pick.id === d.id ? 'rc-cmp__col--pick' : ''}${r.mono && v !== NONE ? ' crn-releve' : ''}${v === NONE ? ' rc-cmp__none' : ''}`}>
                      {v}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rc-cmp__foot">
        <span className="rc-muted">{t('rc_cmp_note')}</span>
        <button type="button" className="rc-btn rc-btn--cta" data-testid="compare-see-lodgings" onClick={() => openLodgings(pick, patch, navigate)}>
          {t('rc_cmp_cta').replace('{d}', pick.name)}
        </button>
      </div>
    </div>
  )
}
