import { freshnessOf } from '@/data/lodgings'
import { ResultCard } from '@/components/ResultCard'
import { ResultGrid } from '@/components/ResultGrid'
import { avalancheIndex } from '@/data/weather'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { scoreBadgeColors, scoreLabel } from '@/domain/scoring'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useWeather } from '@/state/weather'

/**
 * Meilleures offres, tous domaines.
 *
 * L'écran renverse la question habituelle des comparateurs. On ne cherche pas
 * « quel logement à Val Thorens » mais « où partir cette semaine pour ce
 * budget » : pour chaque domaine qui passe les filtres, l'offre la moins chère
 * toutes dépenses comprises.
 */
export function OffersPage(): JSX.Element {
  const { t } = useI18n()
  const { dur, eur, fmt } = useFormat()
  const { lang } = useI18n()
  const { state, patch } = useApp()
  const derived = useDerived()
  const { weatherOf } = useWeather()
  const dark = state.theme === 'dark'

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

        {derived.bestOffers.length === 0 && (
          <div className="panel panel--empty">
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Aucun domaine dans ce budget</p>
            <p className="u-muted" style={{ margin: 0, fontSize: 14, maxWidth: '46ch' }}>
              {t('offers_empty_hint')}
            </p>
          </div>
        )}

        <ResultGrid label="Meilleure offre par domaine">
          {derived.bestOffers.map((o) => {
            const sc = Math.round(derived.scoreOf(o.d).total)
            const weather = weatherOf(o.d.id)
            const risk = avalancheIndex(weather)
            const fresh = freshnessOf(o.l, lang)
            const travel = derived.worstTravel(o.d)
            return (
              <ResultCard
                key={o.d.id}
                title={o.l.name}
                // Ligne 2 : la station et son massif. Ici, contrairement à
                // l'écran Logements, ils changent d'une carte à l'autre — c'est
                // même la question que pose cet écran.
                place={`${o.d.name} · ${o.d.massif}`}
                factLeft={`domaine ${fmt(o.d.min)}–${fmt(o.d.max)} m`}
                // Le temps de route est une estimation tant que les itinéraires
                // n'ont pas été calculés : `travelNote` le dit sous la carte
                // plutôt que de laisser croire à un trajet mesuré.
                factRight={travel != null ? `${dur(travel)} de route` : t('offers_route_unknown')}
                price={{ amount: eur(o.c.total), unit: t('offers_price_unit').replace('{n}', String(derived.nights)) }}
                image={o.l.image ?? null}
                dimmed={fresh.stale}
                ariaLabel={t('offers_card_label')
                  .replace('{l}', o.l.name)
                  .replace('{d}', o.d.name)
                  .replace('{p}', eur(o.c.total))}
                badges={
                  <span className="lodgcard__badge lodgcard__badge--ski" style={scoreBadgeColors(sc, dark)}>
                    {sc} · {scoreLabel(sc)}
                  </span>
                }
                onOpen={() =>
                  patch({
                    tab: 'logements',
                    lodgingDomainId: o.d.id,
                    selectedId: o.d.id,
                    // On vient cliquer une offre précise : elle s'ouvre sur la
                    // liste, sans écran de relevé qui la recouvrirait.
                    lodgPhase: 'results',
                    ficheId: o.l.id
                  })
                }
              >
                <div className="lodgcard__extra">
                  <p className="lodgcard__sub">
                    {eur(o.c.lodging)} logement · {eur(o.c.forfaits)} forfaits · {eur(o.c.route)} route
                    {o.c.rental + o.c.lessons > 0 ? ` · ${eur(o.c.rental + o.c.lessons)} matériel/cours` : ''}
                  </p>
                  <p className="lodgcard__sub">
                    {t('offers_per_person').replace('{p}', eur(Math.round(o.c.total / state.travelers)))}
                    {' · '}
                    {o.l.src}
                    {o.alt > 0 ? ` · +${o.alt} autres logements` : ''}
                  </p>
                  <p className="lodgcard__sub">
                    Neige {weather ? `${weather.snowBas ?? '—'} / ${weather.snowHaut ?? '—'} cm` : '…'}
                    {risk != null ? ` · risque ~${risk}/5` : ''}
                  </p>
                  <p
                    className="lodgcard__sub"
                    style={{ fontSize: 11, color: fresh.stale ? 'var(--warn)' : 'var(--muted)' }}
                  >
                    {fresh.txt}
                  </p>
                </div>
              </ResultCard>
            )
          })}
        </ResultGrid>
      </div>
    </div>
  )
}
