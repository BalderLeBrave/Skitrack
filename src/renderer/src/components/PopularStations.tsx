/**
 * « Stations populaires » — grille de cartes photo sur l'accueil.
 *
 * Bloc 21st-inspired (product card + grid), sans registre. Aucune donnée
 * n'est inventée : la liste est **les plus grands domaines du référentiel**
 * (km de pistes), et la note de section le dit. L'enneigement ne s'affiche
 * que si `snowDepths().releve` est vrai ; sinon la ligne est absente.
 *
 * Deux gestes : la carte ouvre la fiche station ; « Comparer » coche la
 * station pour le tableau comparatif de l'écran Stations.
 */

import { massifPhoto, stationPhoto } from '@/components/photos'
import { creditPhoto } from '@/data/stationPhotos'
import type { Domain } from '@/data/referentiel'
import { snowDepths } from '@/data/weather'
import { massifColor } from '@/domain/massif'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useWeather } from '@/state/weather'

const MAX_POPULAR = 6

function PopularCard({ d }: { d: Domain }): JSX.Element {
  const { state, patch } = useApp()
  const { weatherOf } = useWeather()
  const { fmt } = useFormat()
  const { t } = useI18n()

  const credit = creditPhoto(d.name)
  const own = credit ? stationPhoto(d.slug) : null
  const photo = own ?? massifPhoto(d.massif)
  const snow = snowDepths(weatherOf(d.id))
  const checked = state.stationCompareIds.includes(d.id)

  const toggleCompare = (): void =>
    patch({
      stationCompareIds: checked
        ? state.stationCompareIds.filter((id) => id !== d.id)
        : [...state.stationCompareIds, d.id]
    })

  return (
    <article className={`popcard${checked ? ' popcard--checked' : ''}`} data-testid={`popcard-${d.id}`}>
      <button
        type="button"
        className="popcard__media"
        aria-label={t('home_popular_open').replace('{d}', d.name)}
        data-testid={`popcard-open-${d.id}`}
        style={photo ? { backgroundImage: `url(${photo})` } : { background: massifColor(d.massif).soft }}
        onClick={() => patch({ domFicheId: d.id })}
      >
        {own && credit && (
          <span className="popcard__credit">
            {credit.licence}
            {credit.auteur ? ` · ${credit.auteur}` : ''}
          </span>
        )}
        {snow.releve && snow.haut != null && snow.bas != null && (
          <span className="popcard__snow crn-releve" data-testid={`popcard-snow-${d.id}`}>
            {fmt(snow.bas)} / {fmt(snow.haut)} cm
          </span>
        )}
      </button>
      <div className="popcard__body">
        <div className="popcard__head">
          <strong className="popcard__name" title={d.name}>
            {d.name}
          </strong>
          <span className="popcard__sub" title={`${d.massif}${d.pass ? ` · ${d.pass}` : ''}`}>
            {d.massif}
            {d.pass ? ` · ${d.pass}` : ''}
          </span>
        </div>
        <dl className="popcard__facts">
          <div>
            <dt>{t('home_popular_km')}</dt>
            <dd className="crn-releve">{fmt(d.km)}</dd>
          </div>
          <div>
            <dt>{t('home_popular_alt')}</dt>
            <dd className="crn-releve">
              {fmt(d.min)}–{fmt(d.max)} m
            </dd>
          </div>
        </dl>
        <label className="popcard__compare" data-testid={`popcard-compare-${d.id}`}>
          <input type="checkbox" checked={checked} onChange={toggleCompare} />
          <span>{checked ? t('home_popular_comparing') : t('home_popular_compare')}</span>
        </label>
      </div>
    </article>
  )
}

export function PopularStations(): JSX.Element | null {
  const { state, patch, domains } = useApp()
  const { t } = useI18n()
  if (domains.length === 0) return null

  // Une carte par domaine relié : les villages d'un même forfait partagent
  // leurs km de pistes et rempliraient la grille de la même vallée.
  // Représentant d'un forfait : la station qui a sa propre photo créditée,
  // puis la plus haute — un critère lisible, pas une « popularité » inventée.
  const rank = (d: Domain): number => (creditPhoto(d.name) && stationPhoto(d.slug) ? 100000 : 0) + d.village
  const seen = new Set<string>()
  const top = [...domains]
    .sort((a, b) => b.km - a.km || rank(b) - rank(a))
    .filter((d) => {
      const key = d.pass ?? d.name
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_POPULAR)
  const n = state.stationCompareIds.length

  return (
    <section className="home__popular" data-testid="home-popular">
      <div className="home__popular-head">
        <div>
          <h2 className="home__h2">{t('home_popular')}</h2>
          <p className="home__section-note">{t('home_popular_note')}</p>
        </div>
        {n >= 2 ? (
          <button
            type="button"
            className="linkbtn home__popular-go"
            data-testid="home-popular-compare-go"
            onClick={() => patch({ tab: 'recherche' })}
          >
            {t('home_popular_compare_go').replace('{n}', String(n))}
          </button>
        ) : n === 1 ? (
          <span className="home__section-note home__popular-hint">{t('home_popular_compare_one')}</span>
        ) : null}
      </div>
      <div className="home__popular-grid">
        {top.map((d) => (
          <PopularCard key={d.id} d={d} />
        ))}
      </div>
    </section>
  )
}
