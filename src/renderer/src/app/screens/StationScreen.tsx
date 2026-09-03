/**
 * E3 — Fiche station. Hero média + carte collante (dates, groupe, CTA
 * logements). Photos, météo, forfaits, webcams, BRA : seulement si présents ;
 * absent → « — », jamais 0. Le profil altimétrique dessiné et les expositions
 * de l'ancienne fiche étaient des constantes inventées : retirés.
 */

import { useEffect, useMemo } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useDomainWeather } from '@/data/domainWeather'
import { snowDepths } from '@/data/weather'
import { webcamsFor } from '@/data/webcams'
import { domainTags } from '@/domain/domainTags'
import { scoreBadgeColors, scoreLabel } from '@/domain/scoring'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useWeather } from '@/state/weather'
import { openLodgings } from '../lib/journey'
import { stayDatesLabel } from '../lib/stay'
import { PATHS } from '../router'
import { stationPhotoOf } from '../ui/StationCard'
import { AvalanchePanel, ForecastStrip, LevelCard, PassGrid } from '../widgets/StationWidgets'

export function StationScreen(): JSX.Element {
  const { id } = useParams()
  const { state, patch, domains } = useApp()
  const derived = useDerived()
  const { weatherOf } = useWeather()
  const { eur, fmt, fmtStay } = useFormat()
  const { t, locale } = useI18n()
  const navigate = useNavigate()

  const d = domains.find((x) => String(x.id) === id) ?? null
  const { detail, loading, error } = useDomainWeather(d)
  const cams = useMemo(() => (d ? webcamsFor(d) : []), [d])
  // Déclare la station ouverte : le relevé météo de la liste la couvre alors
  // même si elle n'est pas en tête des résultats filtrés.
  useEffect(() => {
    if (d && state.domFicheId !== d.id) patch({ domFicheId: d.id })
  }, [d, state.domFicheId, patch])
  if (!d) return domains.length === 0 ? <div className="rc-page" /> : <Navigate to={PATHS.compare} replace />

  const photo = stationPhotoOf(d)
  const snow = snowDepths(weatherOf(d.id))
  const forfait = derived.forfaitOf(d)
  const score = Math.round(derived.scoreOf(d).total)
  const cost = derived.sejourCost({ total: 0 }, d)
  const compared = state.stationCompareIds.includes(d.id)
  const saved = state.selDomains.includes(d.id)
  const travel = derived.travelText(d)
  const camUrl = cams[0]?.url ?? ''
  const low = detail?.low.depth ?? (snow.releve ? snow.bas : null)
  const high = detail?.high.depth ?? (snow.releve ? snow.haut : null)

  return (
    <div className="rc-page rc-station" data-testid="station-screen">
      <nav className="rc-crumbs" aria-label={t('rc_crumbs')}>
        <Link to={PATHS.compare} data-testid="station-back">← {t('rc_cmp_title')}</Link>
      </nav>

      <section className="rc-shero" style={photo.src ? { backgroundImage: `url(${photo.src})` } : undefined} data-testid="station-hero">
        <div className="rc-shero__veil" aria-hidden />
        <div className="rc-shero__text">
          <span className="rc-eyebrow rc-eyebrow--light">{[d.massif, d.region, d.pass].filter(Boolean).join(' · ')}</span>
          <h1 className="rc-h1 rc-h1--light" data-testid="station-name">{d.name}</h1>
          <div className="rc-shero__tags">
            <span className="rc-score" style={scoreBadgeColors(score, true)}><b className="crn-calcul">{score}</b> · {scoreLabel(score)}</span>
            {domainTags(d, forfait, { t, fmt, eur }).map((tag) => (
              <span key={tag.id} className="rc-tag" style={{ background: tag.soft, color: tag.color }} title={tag.title}>{tag.txt}</span>
            ))}
          </div>
        </div>
        {photo.credit && <span className="rc-shero__credit">{photo.credit}</span>}
        {detail && (
          <div className="rc-shero__wx" data-testid="station-hero-weather">
            <span className="rc-eyebrow rc-eyebrow--light">{t('rc_wx_today')}</span>
            <div className="rc-shero__wxrow">
              <span><b className="u-num">{detail.high.afternoon.temp == null ? '—' : `${detail.high.afternoon.temp} °C`}</b> {t('rc_wx_top')} · {t(`sky_${detail.high.afternoon.sky}` as Parameters<typeof t>[0])}</span>
              <span><b className="u-num">{detail.low.afternoon.temp == null ? '—' : `${detail.low.afternoon.temp} °C`}</b> {t('rc_wx_base')}</span>
              <span><b className="u-num">{detail.high.snow24 > 0 ? `${fmt(detail.high.snow24)} cm` : '—'}</b> {t('rc_wx_snow24')}</span>
            </div>
          </div>
        )}
      </section>

      <div className="rc-station__cols">
        <div className="rc-station__main">
          <dl className="rc-facts rc-facts--wide" data-testid="station-facts">
            <div><dt>{t('rc_fact_alt')}</dt><dd className="crn-releve">{fmt(d.min)}–{fmt(d.max)} m</dd></div>
            <div><dt>{t('rc_fact_village')}</dt><dd className="crn-releve">{d.village ? `${fmt(d.village)} m` : '—'}</dd></div>
            <div><dt>{t('rc_fact_km')}</dt><dd className="crn-releve">{fmt(d.km)} km</dd></div>
            <div><dt>{t('rc_cmp_lifts')}</dt><dd className="crn-releve">{d.lifts ? fmt(d.lifts) : '—'}</dd></div>
            <div><dt>{t('rc_fact_pass')}</dt><dd className={forfait.estimated ? '' : 'crn-releve'}>{forfait.j6 != null ? eur(forfait.j6) : '—'}{forfait.j6 != null && forfait.estimated && <small className="rc-est"> {t('estimated')}</small>}</dd></div>
            <div><dt>{t('rc_cmp_travel')}</dt><dd data-testid="station-travel">{travel && !/aucune/i.test(travel) ? travel : '—'}</dd></div>
          </dl>

          <section className="rc-card rc-snow" data-testid="station-snow">
            <h2 className="rc-h3">{t('snow_on_ground')}</h2>
            <div className="rc-snow__row">
              <div><span className="rc-muted">{t('resort_base')} · {fmt(d.village || d.min)} m</span><strong className="crn-releve">{low != null ? `${fmt(low)} cm` : '—'}</strong></div>
              <div><span className="rc-muted">{t('resort_top')} · {fmt(d.max)} m</span><strong className="crn-releve">{high != null ? `${fmt(high)} cm` : '—'}</strong></div>
              <p className="rc-muted">{low != null || high != null ? t('snow_modelled') : t('rc_snow_none')}</p>
            </div>
          </section>

          <section className="rc-card" data-testid="station-passes">
            <h2 className="rc-h3">{t('passes_label')} · {forfait.zone ?? '—'}</h2>
            <p className="rc-muted">{forfait.estimated ? `${t('source_derived')} — ${t('filter_forfait_help')}` : `${t('passes_note')} ${forfait.maj ?? '—'}`}</p>
            <PassGrid forfait={forfait} />
          </section>

          <section className="rc-card" data-testid="station-weather">
            <div className="rc-card__head">
              <h2 className="rc-h3">{t('resort_weather')}</h2>
              <span className="rc-muted">Open-Meteo · {fmt(Math.round(d.village || d.min))} m / {fmt(d.max)} m</span>
            </div>
            {error && <p className="rc-notice rc-notice--warn">{t('weather_unavailable')} — {error}</p>}
            {!detail && loading && <p className="rc-muted">{t('weather_loading')}</p>}
            {!detail && !loading && !error && <p className="rc-muted">—</p>}
            {detail && (
              <>
                <div className="rc-two">
                  <LevelCard title={`${t('resort_base')} · ${fmt(Math.round(d.village || d.min))} m`} level={detail.low} />
                  <LevelCard title={`${t('resort_top')} · ${fmt(d.max)} m`} level={detail.high} />
                </div>
                <p className="rc-muted">{t('isotherm')} <b className="u-num">{detail.freezingLevel == null ? '—' : `${fmt(detail.freezingLevel)} m`}</b> {t('isotherm_note')}</p>
                <h3 className="rc-h3">{t('forecast_14')}</h3>
                <ForecastStrip title={`${t('resort_base')} · ${fmt(Math.round(d.village || d.min))} m`} days={detail.low.days} locale={locale} />
                <ForecastStrip title={`${t('resort_top')} · ${fmt(d.max)} m`} days={detail.high.days} locale={locale} />
              </>
            )}
          </section>

          <section className="rc-card" data-testid="station-webcams">
            <h2 className="rc-h3">{t('webcams_title')}</h2>
            {camUrl ? (
              <>
                <div className="rc-camframe"><iframe src={camUrl} title={t('webcam_title')} loading="lazy" allowFullScreen /></div>
                <p className="rc-muted">{t('webcam_note')} <a href={camUrl} target="_blank" rel="noreferrer">{t('webcam_open_tab')}</a></p>
              </>
            ) : (
              <p className="rc-muted">{t('webcam_none')}</p>
            )}
          </section>

          <section className="rc-card" data-testid="station-bra"><AvalanchePanel domain={d} /></section>
        </div>

        <aside className="rc-sticky" data-testid="station-sticky">
          <div className="rc-card rc-sticky__card">
            <span className="rc-eyebrow">{t('rc_sticky_title')}</span>
            <dl className="rc-ck__dl">
              <div><dt>{t('rc_sb_dates')}</dt><dd data-testid="station-sticky-dates">{stayDatesLabel(state, fmtStay, (n) => t('dp_nights').replace('{n}', String(n)), t('rc_sb_dates_any'))}</dd></div>
              <div><dt>{t('nav_travelers')}</dt><dd data-testid="station-sticky-group">{state.travelers}{state.rooms ? ` · ${state.rooms} ${t('sb_rooms').toLowerCase()}` : ''}</dd></div>
              <div><dt>{t('rc_ck_passes')}</dt><dd className="crn-calcul">{cost.forfaits > 0 ? eur(cost.forfaits) : '—'}</dd></div>
            </dl>
            <button type="button" className="rc-btn rc-btn--cta rc-btn--lg rc-btn--block" data-testid="station-see-lodgings" onClick={() => openLodgings(d, patch, navigate)}>
              {t('rc_station_cta')}
            </button>
            <div className="rc-sticky__acts">
              <button type="button" className={`rc-chip${compared ? ' rc-chip--on' : ''}`} aria-pressed={compared} data-testid="station-compare" onClick={() => patch({ stationCompareIds: compared ? state.stationCompareIds.filter((x) => x !== d.id) : [...state.stationCompareIds, d.id] })}>
                {compared ? t('home_popular_comparing') : t('home_popular_compare')}
              </button>
              <button type="button" className={`rc-chip${saved ? ' rc-chip--on' : ''}`} aria-pressed={saved} data-testid="station-save" onClick={() => patch({ selDomains: saved ? state.selDomains.filter((x) => x !== d.id) : [...state.selDomains, d.id] })}>
                {saved ? t('rc_saved') : t('rc_save')}
              </button>
            </div>
            <p className="rc-muted rc-small">{t('rc_sticky_note')}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
