/**
 * E1 — Accueil. Bloc hero + search (21st-inspired), stations populaires
 * (données réelles ou état vide), massifs, chiffres du référentiel.
 */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import heroJpg from '@/assets/hero.jpg'
import { Flocons } from '@/components/Flocons'
import { massifPhoto, stationPhoto } from '@/components/photos'
import { BASE_SOURCES } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { creditPhoto } from '@/data/stationPhotos'
import { massifColor } from '@/domain/massif'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import type { AppState } from '@/state/appState'
import { FILTER_RANGES, useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { PATHS } from '../router'
import { EmptyHonest } from '../ui/EmptyHonest'
import { LiquidGlass } from '../ui/LiquidGlass'
import { SearchStayBar } from '../ui/SearchStayBar'
import { StationCard } from '../ui/StationCard'

const MAX_POPULAR = 6
const MAX_MASSIFS = 6

/** Fond photo de l’accueil. */
function HeroPhoto(): JSX.Element {
  return (
    <div
      className="rc-hero__photo"
      style={{ backgroundImage: `url(${heroJpg})` }}
      data-testid="home-hero-photo"
      aria-hidden
    />
  )
}

/** Un domaine par forfait relié ; représentant = photo créditée, puis le plus haut. */
export function popularStations(domains: Domain[]): Domain[] {
  const rank = (d: Domain): number => (creditPhoto(d.name) && stationPhoto(d.slug) ? 100000 : 0) + d.village
  const seen = new Set<string>()
  return [...domains]
    .sort((a, b) => b.km - a.km || rank(b) - rank(a))
    .filter((d) => {
      const key = d.pass ?? d.name
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_POPULAR)
}

export function HomeScreen(): JSX.Element {
  const { state, patch, domains } = useApp()
  const { forfaitOf } = useDerived()
  const { eur, fmt } = useFormat()
  const { t } = useI18n()
  const navigate = useNavigate()

  const popular = useMemo(() => popularStations(domains), [domains])
  const massifCount = new Set(domains.map((d) => d.massif).filter(Boolean)).size

  const massifs = useMemo(() => {
    const by = new Map<string, Domain[]>()
    for (const d of domains) {
      const key = d.massif || t('massif_other')
      by.set(key, [...(by.get(key) ?? []), d])
    }
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, MAX_MASSIFS)
  }, [domains, t])

  const stats = useMemo(() => {
    if (domains.length === 0) return []
    const prices = domains.map((d) => forfaitOf(d)).filter((f) => !f.estimated && f.j6 != null).map((f) => f.j6 as number).sort((a, b) => a - b)
    const median = prices.length ? prices[Math.floor(prices.length / 2)] : null
    const biggest = [...domains].sort((a, b) => b.km - a.km)[0]
    const sources = [...new Set([...BASE_SOURCES, ...state.lodgQueried])]
    return [
      { label: t('home_stat_domains'), value: fmt(domains.length), note: t('home_stat_domains_note') },
      { label: t('home_stat_median_pass'), value: median != null ? eur(median) : '—', note: t('rc_stat_median_note').replace('{n}', String(prices.length)) },
      { label: t('home_stat_biggest'), value: `${fmt(biggest.km)} km`, note: biggest.name },
      { label: t('home_stat_sources'), value: String(sources.length), note: sources.join(', ') }
    ]
  }, [domains, forfaitOf, state.lodgQueried, eur, fmt, t])

  const shortcuts: { label: string; filter: Partial<AppState> }[] = [
    { label: t('home_sc_large'), filter: { kmMin: 200, kmMax: FILTER_RANGES.km.max } },
    { label: t('home_sc_high'), filter: { baseMin: 1800, baseMax: FILTER_RANGES.base.max } },
    { label: t('home_sc_cheap'), filter: { forfaitMin: 0, forfaitMax: 260 } },
    { label: t('home_sc_near'), filter: { travelMin: 0, travelMax: 240 } }
  ]

  const openMassif = (name: string, first: Domain | undefined): void => {
    patch({ massifs: [name], domainQuery: '', pinnedId: null, domBounds: null, domMapSync: false, domFitWanted: true, selectedId: first?.id ?? null })
    navigate(PATHS.compare)
  }

  return (
    <div className="rc-home" data-testid="home-screen">
      <section className="rc-hero" data-testid="home-hero">
        <div className="rc-hero__scene" aria-hidden data-testid="home-scene">
          <HeroPhoto />
        </div>
        <div className="rc-hero__veil" aria-hidden />
        <Flocons
          count={240}
          sizeMin={0.45}
          sizeMax={1.8}
          speedMin={0.22}
          speedMax={0.95}
          wind={0.14}
          windVariation={0.4}
          opacityMin={22}
          opacityMax={68}
        />
        <div className="rc-hero__inner">
          <span className="rc-hero__eyebrow" data-testid="home-badge">
            {t('home_badge').replace('{n}', fmt(domains.length)).replace('{m}', String(massifCount))}
          </span>
          <h1 className="rc-hero__title">
            {t('home_title_1')} <em>{t('home_title_2')}</em>
          </h1>
          <p className="rc-hero__lead">{t('home_lead')}</p>
          <LiquidGlass className="rc-hero__glass">
            <SearchStayBar />
          </LiquidGlass>
          <div className="rc-hero__shortcuts">
            {shortcuts.map((sc) => (
              <button key={sc.label} type="button" className="rc-chip rc-chip--glass" data-testid="home-shortcut" onClick={() => { patch(sc.filter); navigate(PATHS.compare) }}>
                {sc.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rc-section" data-testid="home-popular">
        <header className="rc-section__head">
          <div>
            <h2 className="rc-h2">{t('home_popular')}</h2>
            <p className="rc-muted">{t('home_popular_note')}</p>
          </div>
          {state.stationCompareIds.length >= 2 && (
            <button type="button" className="rc-link rc-link--strong" data-testid="home-compare-go" onClick={() => navigate(PATHS.compare)}>
              {t('home_popular_compare_go').replace('{n}', String(state.stationCompareIds.length))}
            </button>
          )}
        </header>
        {popular.length === 0 ? (
          <EmptyHonest testid="home-popular-empty" title={t('rc_home_empty_title')} hint={t('rc_home_empty_hint')} />
        ) : (
          <div className="rc-grid rc-grid--3">
            {popular.map((d) => <StationCard key={d.id} d={d} />)}
          </div>
        )}
      </section>

      <section className="rc-section" data-testid="home-massifs">
        <header className="rc-section__head">
          <div>
            <h2 className="rc-h2">{t('home_by_massif')} {t('home_by_massif_word')}</h2>
            <p className="rc-muted">{t('home_massif_note').replace('{m}', String(massifCount)).replace('{n}', fmt(domains.length))}</p>
          </div>
          <button type="button" className="rc-link rc-link--strong" data-testid="home-all-stations" onClick={() => { patch({ massifs: [] }); navigate(PATHS.compare) }}>
            {t('home_all_domains')}
          </button>
        </header>
        <div className="rc-grid rc-grid--3 rc-grid--tiles">
          {massifs.map(([name, list]) => {
            const photo = massifPhoto(name)
            return (
              <button
                key={name}
                type="button"
                className="rc-tile"
                data-testid={`massif-tile-${name}`}
                style={photo ? { backgroundImage: `url(${photo})` } : { background: massifColor(name).soft }}
                onClick={() => openMassif(name, [...list].sort((a, b) => b.km - a.km)[0])}
              >
                <span className="rc-tile__name">{name}</span>
                <span className="rc-tile__sub">{t('home_massif_count').replace('{n}', fmt(list.length))}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="rc-section rc-section--last" data-testid="home-stats">
        <div className="rc-grid rc-grid--4">
          {stats.map((s) => (
            <div key={s.label} className="rc-stat">
              <span className="rc-stat__label">{s.label}</span>
              <strong className="rc-stat__value u-num">{s.value}</strong>
              <span className="rc-stat__note">{s.note}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
