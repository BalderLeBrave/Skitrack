import { useState } from 'react'
import { freshnessOf } from '@/data/lodgings'
import type { Lodging } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { avalancheIndex, snowDepths } from '@/data/weather'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { scoreBadgeColors, scoreLabel } from '@/domain/scoring'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useWeather } from '@/state/weather'

/** Pas du curseur de plafond, en euros par nuit. */
const NIGHT_STEP = 10

/**
 * Une offre du classement, telle que la retourne `derived.bestOffers`.
 *
 * Le type est reconstruit ici plutôt qu'importé : le sélecteur le compose à la
 * volée et n'en exporte pas le nom.
 */
interface Offer {
  d: Domain
  l: Lodging
  c: { total: number; lodging: number; forfaits: number; route: number; rental: number; lessons: number }
  alt: number
}

/**
 * Meilleures offres, tous domaines.
 *
 * L'écran renverse la question habituelle des comparateurs. On ne cherche pas
 * « quel logement à Val Thorens » mais « où partir cette semaine pour ce
 * budget » : pour chaque domaine qui passe les filtres, l'offre la moins chère
 * toutes dépenses comprises.
 *
 * Deux curseurs, deux rôles distincts. Celui du **budget total de séjour**
 * (`state.offresBudget`) filtre en amont : une offre au-dessus n'est pas
 * retournée par le sélecteur. Celui du **plafond par nuit** ne filtre rien du
 * tout — il partage la liste déjà retournée en deux colonnes, « dans le budget »
 * et « juste au-dessus ». Il vit donc en état local : aucune recherche n'en
 * dépend, et il repart au maximum à chaque visite, où le classement affiché est
 * exactement celui du sélecteur.
 */
export function OffersPage(): JSX.Element {
  const { t } = useI18n()
  const { dur, eur, fmt } = useFormat()
  const { lang } = useI18n()
  const { state, patch } = useApp()
  const derived = useDerived()
  const { weatherOf } = useWeather()
  const dark = state.theme === 'dark'

  /** `null` = plafond au maximum, quelle que soit la liste du moment. */
  const [nightCap, setNightCap] = useState<number | null>(null)

  const nights = Math.max(1, derived.nights)
  const perNight = (o: Offer): number => Math.round(o.c.lodging / nights)
  const offers = derived.bestOffers as unknown as Offer[]
  const values = offers.map(perNight)
  const floor = values.length ? Math.floor(Math.min(...values) / NIGHT_STEP) * NIGHT_STEP : 0
  const ceiling = values.length ? Math.ceil(Math.max(...values) / NIGHT_STEP) * NIGHT_STEP : 0
  const cap = nightCap ?? ceiling
  const within = offers.filter((o) => perNight(o) <= cap)
  const above = offers.filter((o) => perNight(o) > cap)

  /**
   * Ligne dense d'une offre.
   *
   * `ResultCard` reste réservée aux mosaïques à photo : ici, on compare vingt
   * domaines sur le prix, et une vignette par domaine ferait défiler ce qui doit
   * se lire d'un bloc. Aucun fait de l'ancienne vignette n'est perdu — ils
   * changent de disposition, pas de présence.
   */
  const OfferRow = ({ o }: { o: Offer }): JSX.Element => {
    const sc = Math.round(derived.scoreOf(o.d).total)
    const weather = weatherOf(o.d.id)
    const snow = snowDepths(weather)
    const risk = avalancheIndex(weather)
    const fresh = freshnessOf(o.l, lang)
    const travel = derived.worstTravel(o.d)
    return (
      <button
        type="button"
        className={`offerrow${fresh.stale ? ' offerrow--dim' : ''}`}
        aria-label={t('offers_card_label')
          .replace('{l}', o.l.name)
          .replace('{d}', o.d.name)
          .replace('{p}', eur(o.c.total))}
        onClick={() =>
          patch({
            tab: 'logements',
            lodgingDomainId: o.d.id,
            selectedId: o.d.id,
            // On vient cliquer une offre précise : elle s'ouvre sur la liste,
            // sans écran de relevé qui la recouvrirait.
            lodgPhase: 'results',
            ficheId: o.l.id
          })
        }
      >
        <span className="offerrow__score" style={scoreBadgeColors(sc, dark)}>
          {sc} · {scoreLabel(sc)}
        </span>

        <span className="offerrow__main">
          <span className="offerrow__place">
            {o.d.name} · {o.d.massif}
          </span>
          <span className="offerrow__name">{o.l.name}</span>
          <span className="offerrow__meta">
            domaine {fmt(o.d.min)}–{fmt(o.d.max)} m ·{' '}
            {travel != null ? `${dur(travel)} de route` : t('offers_route_unknown')} · {o.l.src}
            {o.alt > 0 ? ` · +${o.alt} autres logements` : ''}
          </span>
          <span className="offerrow__meta">
            {eur(o.c.lodging)} logement · {eur(o.c.forfaits)} forfaits · {eur(o.c.route)} route
            {o.c.rental + o.c.lessons > 0 ? ` · ${eur(o.c.rental + o.c.lessons)} matériel/cours` : ''}
          </span>
          <span className="offerrow__meta" style={{ color: fresh.stale ? 'var(--warn)' : 'var(--dim)' }}>
            {fresh.txt}
          </span>
        </span>

        {/* Jauge neige : bas et haut des pistes, « — » tant que le modèle n'a
            pas répondu. Le risque n'est affiché que s'il est relevé. */}
        <span className="offerrow__snow">
          <span className="offerrow__snowbar" aria-hidden>
            <span
              className="offerrow__snowfill"
              style={{ height: `${Math.min(100, ((snow.haut ?? 0) / 250) * 100)}%` }}
            />
          </span>
          <span className="offerrow__snowtxt u-num">
            {snow.bas != null ? `${fmt(snow.bas)}` : '—'} / {snow.haut != null ? `${fmt(snow.haut)} cm` : '—'}
            {risk != null ? ` · ~${risk}/5` : ''}
          </span>
        </span>

        <span className="offerrow__price">
          <strong className="offerrow__total u-num">{eur(o.c.total)}</strong>
          <span className="offerrow__unit">
            {t('offers_price_unit').replace('{n}', String(derived.nights))}
          </span>
          <span className="offerrow__unit">
            {t('offers_per_person').replace('{p}', eur(Math.round(o.c.total / state.travelers)))}
          </span>
        </span>
      </button>
    )
  }

  return (
    <div className="page">
      <div className="page__inner" style={{ maxWidth: 1180 }}>
        <header className="page-head" style={{ marginBottom: 6 }}>
          <h2>Meilleures offres, tous domaines</h2>
          <span className="u-muted" style={{ fontSize: 13 }}>
            {state.travelers} voyageurs · {derived.nights} nuits · logement + forfaits + route
          </span>
        </header>
        <p className="lede">
          La question n’est pas « quel logement à Val Thorens » mais « où partir cette semaine pour ce budget ». Pour
          chaque domaine qui passe vos filtres, l’offre la moins chère toutes dépenses comprises : logement, forfaits et
          route.
        </p>

        <div className="panel offers__bar">
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <label className="field-label">
              {t('budget_total_stay')}<strong>{eur(state.offresBudget)}</strong>
            </label>
            <input
              type="range"
              min={1500}
              max={9000}
              step={250}
              value={state.offresBudget}
              onChange={(e) => patch({ offresBudget: +e.target.value })}
            />
          </div>
          <div style={{ flex: '0 1 220px' }}>
            <label className="field-label" style={{ display: 'block' }}>
              Trier par
            </label>
            <select
              className="field"
              style={{ padding: '9px 10px' }}
              value={state.offresSort}
              onChange={(e) => patch({ offresSort: e.target.value as 'total' | 'score' | 'travel' })}
            >
              <option value="total">{t('offers_total_cost')}</option>
              <option value="score">Note du domaine</option>
              <option value="travel">Temps de trajet</option>
            </select>
          </div>
          <span className="u-muted" style={{ fontSize: 13, paddingBottom: 8 }}>
            {derived.bestOffers.length} domaine(s) dans le budget
          </span>
        </div>

        {/* Second curseur : purement local, il ne relance rien. Au maximum, la
            colonne de droite est vide et l'ordre affiché est celui du
            sélecteur. */}
        {offers.length > 0 && (
          <div className="panel offers__bar">
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <label className="field-label">
                {t('offers_per_night')}
                <strong className="u-num">{eur(cap)}</strong>
              </label>
              <input
                type="range"
                min={floor}
                max={ceiling}
                step={NIGHT_STEP}
                value={cap}
                aria-label={t('offers_per_night')}
                onChange={(e) => setNightCap(+e.target.value)}
              />
              <p className="offers__note">{t('offers_per_night_note')}</p>
            </div>
            {nightCap != null && (
              <button type="button" className="linkbtn" style={{ paddingBottom: 8 }} onClick={() => setNightCap(null)}>
                {t('filter_reset')}
              </button>
            )}
          </div>
        )}

        {derived.bestOffers.length === 0 && (
          <div className="panel panel--empty">
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Aucun domaine dans ce budget</p>
            <p className="u-muted" style={{ margin: 0, fontSize: 14, maxWidth: '46ch' }}>
              {t('offers_empty_hint')}
            </p>
          </div>
        )}

        <div className="offers__cols">
          <section className="offers__col">
            <h3 className="offers__coltitle">
              {t('offers_within')} <span className="u-num">({within.length})</span>
            </h3>
            {within.length === 0 ? (
              <p className="offers__empty">{t('offers_within_none')}</p>
            ) : (
              within.map((o) => <OfferRow key={o.d.id} o={o} />)
            )}
          </section>
          <section className="offers__col">
            <h3 className="offers__coltitle">
              {t('offers_above')} <span className="u-num">({above.length})</span>
            </h3>
            {above.length === 0 ? (
              <p className="offers__empty">{t('offers_above_none')}</p>
            ) : (
              above.map((o) => <OfferRow key={o.d.id} o={o} />)
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
