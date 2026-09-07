/** Widgets de données de la fiche station (météo, forfaits, BRA) — repris de l'ancienne fiche, logique inchangée. */
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

import { CloudIcon, RainIcon, SnowIcon, SunIcon } from '@/components/Icons'
import { BRA_LABELS, braColor, braKeyOf, braLevelOf, braLinks, useBra } from '@/data/bra'
import type { DomainWeatherDay, DomainWeatherLevel, SkyLabel } from '@/data/domainWeather'
import type { Domain } from '@/data/referentiel'
import { useFormat } from '@/hooks/useFormat'
import type { TranslationKey } from '@/i18n'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import type { ResolvedForfait } from '@/state/selectors'


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

export function DayIcon({ kind }: { kind: DomainWeatherDay['kind'] }): JSX.Element {
  if (kind === 'sun') return <SunIcon />
  if (kind === 'snow') return <SnowIcon />
  if (kind === 'rain') return <RainIcon />
  return <CloudIcon />
}

/** Une altitude du domaine : deux créneaux du jour, puis le résumé quotidien. */
export function LevelCard({ title, level }: { title: string; level: DomainWeatherLevel }): JSX.Element {
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
export function ForecastStrip({ title, days, locale }: { title: string; days: DomainWeatherDay[]; locale: string }): JSX.Element {
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
export function PassGrid({ forfait }: { forfait: ResolvedForfait }): JSX.Element {
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
export function AvalanchePanel({ domain }: { domain: Domain }): JSX.Element {
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

