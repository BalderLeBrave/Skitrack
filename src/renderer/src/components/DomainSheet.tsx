/**
 * Fiche domaine, plein écran.
 *
 * Le tiroir de 520 px ne suffisait plus : la fiche répond maintenant à la
 * question « est-ce que ça vaut le déplacement cette semaine-là », ce qui
 * demande de mettre côte à côte des choses qui ne se lisent qu'ensemble — la
 * neige au sol en bas et en haut, la météo aux deux altitudes, l'isotherme
 * 0 °C qui décide si la précipitation tombe en pluie ou en neige, et le
 * bulletin d'avalanche. Empilées dans une colonne étroite, elles se
 * consultaient l'une après l'autre ; en pleine page, elles se comparent.
 *
 * Ce qui est modélisé est dit modélisé, et ce qui n'est pas relevé n'est pas
 * inventé : le risque d'avalanche affiché est celui que l'utilisateur a lu sur
 * le bulletin officiel, ou rien.
 */

import { useEffect, useMemo, useRef } from 'react'
import { CloseIcon, CloudIcon, ExternalIcon, RainIcon, SnowIcon, SunIcon } from './Icons'
import { DomainLogo } from './DomainLogo'
import { BRA_LABELS, braColor, braKeyOf, braLevelOf, braLinks, useBra } from '@/data/bra'
import type { DomainWeatherDay, DomainWeatherLevel, SkyLabel } from '@/data/domainWeather'
import { useDomainWeather } from '@/data/domainWeather'
import type { Domain } from '@/data/referentiel'
import { EXPOSURES, domainPriceHistory } from '@/data/snow'
import { snowDepths, snowfallText } from '@/data/weather'
import { webcamsFor } from '@/data/webcams'
import { useFormat } from '@/hooks/useFormat'
import { domainTags } from '@/domain/domainTags'
import { scoreBadgeColors, scoreLabel } from '@/domain/scoring'
import { useFocusTrap } from '@/hooks/useShortcuts'
import type { TranslationKey } from '@/i18n'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import type { ResolvedForfait } from '@/state/selectors'
import { useDerived } from '@/state/selectors'
import { useWeather } from '@/state/weather'

/** Silhouette de vallée partagée : le profil réel d'un domaine demanderait le
 *  MNT le long des pistes, qui n'est pas dans le référentiel. Seules les
 *  altitudes qui l'encadrent sont réelles, et elles sont légendées. */
const PROFILE_SHAPE: [number, number][] = [
  [0, 0],
  [14, 26],
  [30, 18],
  [46, 54],
  [62, 42],
  [78, 74],
  [92, 88],
  [100, 100]
]

const SKY_KEYS: Record<SkyLabel, TranslationKey> = {
  clear: 'sky_clear',
  fair: 'sky_fair',
  overcast: 'sky_overcast',
  fog: 'sky_fog',
  rain: 'sky_rain',
  snow: 'sky_snow',
  storm: 'sky_storm',
  variable: 'sky_variable',
  unknown: 'sky_unknown'
}

function DayIcon({ kind }: { kind: DomainWeatherDay['kind'] }): JSX.Element {
  if (kind === 'sun') return <SunIcon />
  if (kind === 'snow') return <SnowIcon />
  if (kind === 'rain') return <RainIcon />
  return <CloudIcon />
}

/** Une altitude du domaine : deux créneaux du jour, puis le résumé quotidien. */
function LevelCard({ title, level }: { title: string; level: DomainWeatherLevel }): JSX.Element {
  const { t } = useI18n()
  const temp = (v: number | null): string => (v == null ? '—' : `${v} °C`)

  const rows: [string, string][] = [
    [t('weather_min_max'), `${temp(level.tempMin)} / ${temp(level.tempMax)}`],
    [t('weather_wind_max'), level.windMax == null ? '—' : `${level.windMax} km/h`],
    [t('weather_precip_24h'), `${level.rain24} mm`],
    [t('weather_snowfall_24h'), level.snow24 > 0 ? `${level.snow24} cm` : '—'],
    [t('weather_snow_depth'), level.depth == null ? '—' : `${level.depth} cm`]
  ]

  return (
    <div className="wxlevel">
      <p className="wxlevel__title">{title}</p>
      <div className="wxlevel__slots">
        {[
          { label: t('weather_morning'), slot: level.morning },
          { label: t('weather_afternoon'), slot: level.afternoon }
        ].map(({ label, slot }) => (
          <div key={label}>
            <p className="u-muted" style={{ margin: 0, fontSize: 12 }}>
              {label}
            </p>
            <p className="wxlevel__temp">{temp(slot.temp)}</p>
            <p className="u-muted u-ellipsis" style={{ margin: 0, fontSize: 12 }}>
              {t(SKY_KEYS[slot.sky])}
            </p>
          </div>
        ))}
      </div>
      <dl className="wxlevel__dl">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="u-muted">{k}</dt>
            <dd className="u-num">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Bande de quatorze jours à une altitude donnée. */
function ForecastStrip({ title, days, locale }: { title: string; days: DomainWeatherDay[]; locale: string }): JSX.Element {
  return (
    <div style={{ minWidth: 0 }}>
      <p className="wxlevel__title">{title}</p>
      <div className="wxstrip">
        {days.map((day) => (
          <div key={day.date} className="wxstrip__day">
            <span className="u-muted u-nowrap" style={{ fontSize: 12 }}>
              {new Date(`${day.date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: '2-digit' })}
            </span>
            <DayIcon kind={day.kind} />
            <span className="u-num" style={{ fontSize: 12, fontWeight: 700 }}>
              {day.tempMax == null ? '—' : `${day.tempMax}°`}
            </span>
            <span className="u-muted u-num u-nowrap" style={{ fontSize: 12 }}>
              🌧 {day.rainMm} mm
            </span>
            <span
              className="u-num u-nowrap"
              style={{
                fontSize: 12,
                fontWeight: day.snowCm > 0 ? 700 : 400,
                color: day.snowCm > 0 ? 'var(--link)' : 'var(--dim)'
              }}
            >
              ❄ {day.snowCm > 0 ? `${day.snowCm} cm` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Grille des tarifs de forfait relevés (ou estimés) pour le domaine. */
function PassGrid({ forfait }: { forfait: ResolvedForfait }): JSX.Element {
  const { eur } = useFormat()
  const { t } = useI18n()
  const rows: [string, string][] = [
    ['Journée adulte', forfait.j1 != null ? eur(forfait.j1) : '—'],
    [t('pass_6d_adult'), forfait.j6 != null ? eur(forfait.j6) : '—'],
    ['Forfait 6 j enfant', forfait.enf6 != null ? eur(forfait.enf6) : '—'],
    ['Saison adulte', forfait.saison != null ? eur(forfait.saison) : '—'],
    [t('pass_zone'), forfait.zone ?? '—'],
    ['Relevé le', forfait.maj ?? '—']
  ]
  return (
    <dl className="passgrid">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="u-muted">{k}</dt>
          <dd className="u-num">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Bulletin d'avalanche : liens officiels et niveau relevé à la main.
 *
 * Les cinq boutons ne « calculent » rien — ils enregistrent ce que
 * l'utilisateur vient de lire sur le bulletin, daté, pour que la fiche puisse
 * le rappeler sans prétendre l'avoir déduit.
 */
function AvalanchePanel({ domain }: { domain: Domain }): JSX.Element {
  const { fmt } = useFormat()
  const { state, patch } = useApp()
  const { t, locale } = useI18n()
  const { bulletin, loading } = useBra(domain)

  const links = braLinks(domain)
  const key = braKeyOf(domain)
  const manual = braLevelOf(domain, state.braManual)
  // Le bulletin publié prime : c'est la source, la saisie n'en est qu'un
  // relais quand la clé manque ou que l'API ne répond pas.
  const level = bulletin?.risk ?? manual
  const fromApi = bulletin?.risk != null

  const setLevel = (n: number | null): void => {
    const next = { ...state.braManual }
    if (n == null || next[key]?.n === n) delete next[key]
    else next[key] = { n, at: Date.now() }
    patch({ braManual: next })
  }

  const origin = (): string => {
    if (loading) return t('loading')
    if (fromApi) {
      const when = bulletin?.issuedAt ? new Date(bulletin.issuedAt) : null
      const stamp = when && !isNaN(when.getTime()) ? ` · ${when.toLocaleString(locale)}` : ''
      return `${t('bra_from_api')}${stamp}`
    }
    if (bulletin?.message) return bulletin.message
    if (bulletin?.error) return bulletin.error
    if (manual != null) return t('bra_from_manual')
    return t('bra_not_read')
  }

  return (
    <section className="brapanel" style={{ borderColor: level == null ? 'var(--border)' : braColor(level) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          className="brapanel__badge"
          style={
            level == null
              ? { background: 'var(--surface)', color: 'var(--muted)', borderColor: 'var(--border)' }
              : { background: braColor(level), color: 'var(--bg)', borderColor: braColor(level) }
          }
        >
          {level == null ? '—' : `${level}/5`}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
            {t('bra_title')}
            {level != null ? ` · ${BRA_LABELS[level]}` : ''}
            {links.massif ? ` — ${links.massif.replace(/_/g, ' ')}` : ''}
          </p>
          <p className="u-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
            {origin()}
          </p>
          {fromApi && bulletin?.risk1 != null && bulletin.risk2 != null && (
            <p className="u-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
              {[
                `${bulletin.loc1 ?? '1'} ${bulletin.risk1}/5`,
                `${bulletin.loc2 ?? '2'} ${bulletin.risk2}/5`,
                bulletin.altitude != null ? `bascule ${fmt(bulletin.altitude)} m` : null
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a className="btn btn--primary btn--pill" href={links.mfUrl} target="_blank" rel="noreferrer">
          {t('bra_official')}
        </a>
        {links.daUrl && (
          <a className="btn btn--pill" href={links.daUrl} target="_blank" rel="noreferrer">
            BRA {links.massif?.replace(/_/g, ' ')} {t('bra_today')}
          </a>
        )}
      </div>

      {/* La saisie reste offerte même quand l'API répond : elle sert de relais
          hors saison, hors clé, et quand le bulletin n'est pas encore publié. */}
      <div className="brapanel__scale">
        <span className="u-muted" style={{ fontSize: 12 }}>
          {t('bra_level_read')}
        </span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`brabtn${manual === n ? ' brabtn--on' : ''}`}
            style={manual === n ? { borderColor: braColor(n), color: braColor(n) } : undefined}
            title={BRA_LABELS[n]}
            onClick={() => setLevel(n)}
          >
            {n}
          </button>
        ))}
        {manual != null && (
          <button type="button" className="linkbtn linkbtn--sm" onClick={() => setLevel(null)}>
            {t('clear_label')}
          </button>
        )}
      </div>

      <p className="u-muted" style={{ margin: 0, fontSize: 12 }}>
        {links.massif ? t('bra_note') : `${t('bra_massif_unknown')} ${t('bra_note')}`}
      </p>
    </section>
  )
}

export function DomainSheet(): JSX.Element | null {
  const { eur, fmt } = useFormat()
  const { state, patch, domains } = useApp()
  const derived = useDerived()
  const { weatherOf } = useWeather()
  const { t, locale } = useI18n()
  const ref = useRef<HTMLElement>(null)
  useFocusTrap(ref)

  const d = domains.find((x) => x.id === state.domFicheId) ?? null
  const { detail, loading, error } = useDomainWeather(d)
  // Le rapprochement domaine → webcam est textuel : inutile de le refaire à
  // chaque frappe dans le champ de logo.
  const cams = useMemo(() => (d ? webcamsFor(d) : []), [d])

  // La webcam choisie appartient au domaine ouvert : changer de fiche remet le
  // sélecteur sur la première caméra plutôt que de pointer un flux étranger.
  const camUrl = cams.some((c) => c.url === state.domCamUrl) ? state.domCamUrl : (cams[0]?.url ?? '')
  useEffect(() => {
    if (camUrl !== state.domCamUrl) patch({ domCamUrl: camUrl })
  }, [camUrl, state.domCamUrl, patch])

  if (!d) return null

  const score = Math.round(derived.scoreOf(d).total)
  const weather = weatherOf(d.id)
  const snow = snowDepths(weather)
  const forfait = derived.forfaitOf(d)
  const hist = domainPriceHistory(d)
  const dark = state.theme === 'dark'

  const profile = PROFILE_SHAPE.map(([x, y]) => `${x.toFixed(0)},${(96 - (y / 100) * 88).toFixed(1)}`).join(' ')
  const villageY = (96 - ((d.village - d.min) / Math.max(d.max - d.min, 1)) * 88).toFixed(1)

  const logo = state.logos[d.slug] ?? d.logo
  const close = (): void => patch({ domFicheId: null })

  const lowTitle = `${t('resort_base')} · ${fmt(Math.round(d.village || d.min))} m`
  const highTitle = `${t('resort_top')} · ${fmt(d.max)} m`

  return (
    <>
      <div className="scrim" style={{ zIndex: 15 }} onClick={close} />
      <aside
        ref={ref}
        className="domsheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('sheet_resort')}
      >
        <div className="domsheet__head">
          <DomainLogo name={d.name} website={d.website} logo={logo} dark={dark} />
          <h3>{d.name}</h3>
          <span className="u-muted u-ellipsis" style={{ fontSize: 13, flex: 1, minWidth: 0 }}>
            {[d.massif, d.region, d.pass].filter(Boolean).join(' · ')}
          </span>
          <button type="button" className="iconbtn" onClick={close} aria-label={t('close')}>
            <CloseIcon />
          </button>
        </div>

        <div className="domsheet__body">
          {/* Les étiquettes dérivées ont quitté la carte de domaine pour cette
              rangée : sur la carte elles disputaient l'attention aux trois
              chiffres clés, ici elles sont à leur place, à côté du score et de
              tout le détail. Le glacier n'est plus rendu à part, `domainTags`
              le porte déjà. */}
          <div className="domsheet__full" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="scorebadge" style={scoreBadgeColors(score, dark)}>
              <span className="crn-calcul">{score}</span> · {scoreLabel(score)}
            </span>
            {forfait.estimated && <span className="tag">{t('estimated')}</span>}
            {domainTags(d, forfait, { t, fmt, eur }).map((tag) => (
              <span
                key={tag.id}
                className="domcard__tag"
                style={{ background: tag.soft, color: tag.color }}
                title={tag.title}
              >
                {tag.txt}
              </span>
            ))}
          </div>

          {/* --- Profil altimétrique et carte d'identité ---------------- */}
          <div>
            <p className="sheet__label">{t('alti_profile')}</p>
            <svg
              width="100%"
              height="130"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              role="img"
              aria-label={t('alti_profile')}
              style={{ background: 'var(--surface)', borderRadius: 12 }}
            >
              <polyline
                points={profile}
                fill="none"
                stroke="var(--brand)"
                strokeWidth="1.4"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
              <line
                x1="0"
                x2="100"
                y1={villageY}
                y2={villageY}
                stroke="var(--dim)"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="u-muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
              <span>
                {t('altitude_bottom_lower')} {fmt(d.min)} m
              </span>
              <span>
                {t('altitude_village_lower')} {fmt(d.village)} m
              </span>
              <span>
                {t('altitude_top_lower')} {fmt(d.max)} m
              </span>
            </div>
          </div>

          <dl className="sheet__dl">
            <div>
              <dt>{t('altitude_range')}</dt>
              <dd style={{ fontWeight: 700 }}>{fmt(d.max - d.min)} m</dd>
            </div>
            <div>
              <dt>{t('slopes_lifts')}</dt>
              <dd style={{ fontWeight: 700 }}>
                {fmt(d.km)} km · {d.lifts}
              </dd>
            </div>
            <div>
              <dt>{t('pass_6d_adult')}</dt>
              <dd style={{ fontWeight: 700 }}>{forfait.j6 != null ? eur(forfait.j6) : '—'}</dd>
            </div>
            <div>
              <dt>{t('pass_zone')}</dt>
              <dd>{forfait.zone ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('travel_car')}</dt>
              <dd>{derived.travelText(d)}</dd>
            </div>
          </dl>

          {/* --- Neige au sol ------------------------------------------- */}
          <section className="domsheet__full inset snowblock">
            <p className="sheet__label">{t('snow_on_ground')}</p>
            <div className="snowblock__row">
              <div>
                <p className="u-muted" style={{ margin: 0, fontSize: 12 }}>
                  {t('resort_base')} · {fmt(d.village)} m
                </p>
                <p className="snowblock__value">
                  {detail?.low.depth ?? snow.bas ?? '—'}
                  <span style={{ fontSize: 18 }}> cm</span>
                </p>
              </div>
              <div>
                <p className="u-muted" style={{ margin: 0, fontSize: 12 }}>
                  {t('resort_top')} · {fmt(d.max)} m
                </p>
                <p className="snowblock__value">
                  {detail?.high.depth ?? snow.haut ?? '—'}
                  <span style={{ fontSize: 18 }}> cm</span>
                </p>
              </div>
              <p className="u-muted" style={{ margin: 0, fontSize: 12, flex: '1 1 200px', minWidth: 0 }}>
                {detail || snow.releve ? t('snow_modelled') : t('snow_from_ref')}
              </p>
            </div>
          </section>

          {/* --- Forfaits ----------------------------------------------- */}
          <section className="domsheet__full" style={{ display: 'grid', gap: 10 }}>
            <p className="sheet__label" style={{ margin: 0 }}>
              {t('passes_label')} · {forfait.zone ?? '—'}
            </p>
            <p className="u-muted" style={{ margin: 0, fontSize: 12 }}>
              {forfait.estimated
                ? `${t('source_derived')} — ${t('filter_forfait_help')}`
                : `${t('passes_note')} ${forfait.maj ?? '—'}`}
            </p>
            <PassGrid forfait={forfait} />
            <p className="u-muted" style={{ margin: 0, fontSize: 12 }}>
              {t('passes_family_note')}
            </p>
          </section>

          {/* --- Météo du domaine --------------------------------------- */}
          <section className="domsheet__full" style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <p className="sheet__label" style={{ margin: 0, flex: 1 }}>
                {t('resort_weather')}
              </p>
              <span className="u-muted" style={{ fontSize: 12 }}>
                Open-Meteo · {fmt(Math.round(d.village || d.min))} m / {fmt(d.max)} m
              </span>
            </div>
            {error && <p className="notice notice--warn">{`${t('weather_unavailable')} — ${error}`}</p>}
            {!detail && loading && (
              <p className="u-muted" style={{ margin: 0, fontSize: 12 }}>
                {t('weather_loading')}
              </p>
            )}
            {detail && (
              <>
                <div className="wxlevels">
                  <LevelCard title={lowTitle} level={detail.low} />
                  <LevelCard title={highTitle} level={detail.high} />
                </div>
                <p className="u-muted" style={{ margin: 0, fontSize: 12 }}>
                  {t('isotherm')}{' '}
                  <strong className="u-num" style={{ color: 'var(--text)' }}>
                    {detail.freezingLevel == null ? '—' : `${fmt(detail.freezingLevel)} m`}
                  </strong>{' '}
                  {t('isotherm_note')}
                </p>
              </>
            )}
          </section>

          {/* --- Prévisions 14 jours ------------------------------------ */}
          {detail && (
            <section className="domsheet__full" style={{ display: 'grid', gap: 16, minWidth: 0 }}>
              <p className="sheet__label" style={{ margin: 0 }}>
                {t('forecast_14')}
              </p>
              <ForecastStrip title={lowTitle} days={detail.low.days} locale={locale} />
              <ForecastStrip title={highTitle} days={detail.high.days} locale={locale} />
            </section>
          )}

          {/* --- Webcams ------------------------------------------------ */}
          <section className="domsheet__full" style={{ maxWidth: 860, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <p className="sheet__label" style={{ margin: 0, flex: 1 }}>
                {t('webcams_title')}
              </p>
              {cams.length > 1 && (
                <select
                  className="field"
                  style={{ maxWidth: 260, borderRadius: 999, fontSize: 12 }}
                  value={camUrl}
                  aria-label={t('webcam_choose')}
                  onChange={(e) => patch({ domCamUrl: e.target.value })}
                >
                  {cams.map((cam) => (
                    <option key={cam.id} value={cam.url}>
                      {cam.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {camUrl ? (
              <>
                <div className="camframe">
                  <iframe src={camUrl} title={t('webcam_title')} loading="lazy" allowFullScreen />
                </div>
                <p className="u-muted" style={{ margin: 0, fontSize: 12 }}>
                  {t('webcam_note')}{' '}
                  <a href={camUrl} target="_blank" rel="noreferrer">
                    {t('webcam_open_tab')}
                  </a>
                </p>
              </>
            ) : (
              <p className="u-muted" style={{ margin: 0, fontSize: 12 }}>
                {t('webcam_none')}
              </p>
            )}
          </section>

          {/* --- Exposition et tendance de prix ------------------------- */}
          <div>
            <p className="sheet__label">{t('exposure')}</p>
            <div style={{ display: 'grid', gap: 6 }}>
              {EXPOSURES.map(([label, pct]) => (
                <div key={label} className="expo">
                  <span className="u-muted">{label}</span>
                  <span className="bar" style={{ height: 7, borderRadius: 4 }}>
                    <span className="bar__fill" style={{ width: `${pct * 2}%` }} />
                  </span>
                  <span className="u-num" style={{ textAlign: 'right' }}>
                    {pct} %
                  </span>
                </div>
              ))}
            </div>
            <p className="u-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
              {t('exposure_note')}
            </p>
          </div>

          <div className="inset">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, flex: 1 }}>{t('avg_price')}</p>
              <span style={{ fontSize: 13, fontWeight: 600, color: hist.color }}>{hist.txt}</span>
            </div>
            <svg
              width="100%"
              height="42"
              viewBox="0 0 80 22"
              preserveAspectRatio="none"
              role="img"
              aria-label={t('avg_price')}
              style={{ marginTop: 8 }}
            >
              <polyline
                points={hist.pts}
                fill="none"
                stroke="var(--brand)"
                strokeWidth="1.4"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            </svg>
            <p className="u-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
              {t('avg_price_note')}
            </p>
          </div>

          {/* --- Risque d'avalanche ------------------------------------- */}
          <div className="domsheet__full" style={{ maxWidth: 860 }}>
            <AvalanchePanel domain={d} />
          </div>

          {/* --- Logo de la station ------------------------------------- */}
          <div className="domsheet__full">
            <p className="sheet__label">Logo de la station</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 520 }}>
              <input
                type="text"
                className="field"
                style={{ fontSize: 12 }}
                placeholder="https://…/logo.png"
                value={state.logos[d.slug] ?? ''}
                onChange={(e) => {
                  const next = { ...state.logos }
                  if (e.target.value.trim()) next[d.slug] = e.target.value.trim()
                  else delete next[d.slug]
                  patch({ logos: next })
                }}
              />
              {state.logos[d.slug] && (
                <button
                  type="button"
                  className="linkbtn linkbtn--sm u-nowrap"
                  onClick={() => {
                    const next = { ...state.logos }
                    delete next[d.slug]
                    patch({ logos: next })
                  }}
                >
                  {t('clear_label')}
                </button>
              )}
            </div>
            <p className="u-muted" style={{ margin: '6px 0 0', fontSize: 12, maxWidth: '70ch' }}>
              Collez l’adresse d’une image. À défaut, l’application essaie l’icône du site officiel
              {d.website ? '' : ' — non renseigné pour ce domaine'}, puis retombe sur les initiales. Pour en poser
              beaucoup d’un coup, ajoutez un champ <code>logo</code> à chaque domaine du référentiel JSON
              (Réglages → Sources de données → Gérer le référentiel).
            </p>
          </div>

          <p className="u-muted domsheet__full" style={{ margin: 0, fontSize: 12 }}>
            {t('snowfall_announced')} {snowfallText(weather)}
          </p>

          <div className="domsheet__full">
            <button
              type="button"
              className="btn btn--primary btn--round"
              onClick={() =>
                // Même entrée que le bouton de la vignette : on demande un
                // relevé, pas le formulaire de critères. Voir `DomainCard`.
                patch({
                  tab: 'logements',
                  lodgingDomainId: d.id,
                  domFicheId: null,
                  lodgPhase: 'searching',
                  lodgSearchMsg: null
                })
              }
            >
              {t('see_lodgings_of_resort')}
            </button>
            {d.website && (
              <a
                className="linkbtn"
                style={{ marginLeft: 16 }}
                href={d.website}
                target="_blank"
                rel="noreferrer"
              >
                {t('official_site')}
                <ExternalIcon />
              </a>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
