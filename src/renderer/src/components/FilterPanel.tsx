import { useState } from 'react'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { computeRoutes, routesCoverage } from '@/domain/travel'
import { useFormat } from '@/hooks/useFormat'
import { RangeFilter } from './RangeFilter'
import { useActiveFilters } from './activeFilters'

/** Ordre canonique des massifs français, du plus fourni au moins fourni. */
const MASSIF_ORDER = ['Alpes du Nord', 'Alpes du Sud', 'Pyrénées', 'Massif central', 'Jura', 'Vosges']

export function FilterPanel(): JSX.Element {
  const { dur, eur, fmt } = useFormat()
  const { state, patch, domains } = useApp()
  const { origins, hh } = useDerived()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  const coverage = routesCoverage(origins, domains, state.routes)
  const peopleAt = (i: number): number => state.people.filter((p) => p.home === i).length

  /**
   * Filtres posés. Le panneau n'en affiche plus les puces — elles vivent
   * au-dessus de la liste, où elles restent visibles panneau fermé — mais il
   * garde le compteur et la remise à zéro, qui appartiennent au réglage.
   */
  const { active, resetAll } = useActiveFilters()

  const massifSummary =
    state.massifs.length === 0
      ? t('all_label')
      : `${state.massifs.length} ${t('selected_pl')}`
  const optionsSummary =
    [state.glacier ? t('glacier') : null, state.linked ? t('linked_short') : null]
      .filter(Boolean)
      .join(' · ') || t('none_fem')

  // Les compteurs viennent du référentiel chargé, pas d'une table figée : un
  // référentiel maison doit afficher ses propres massifs.
  const massifCounts = MASSIF_ORDER.map((name) => ({
    name,
    count: domains.filter((d) => d.massif === name).length
  })).filter((m) => m.count > 0)

  const onComputeRoutes = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    patch({ routeBusy: true, routeMsg: 'Calcul des itinéraires…' })
    const { routes, failed } = await computeRoutes(origins, domains, state.routes, (message) =>
      patch({ routeMsg: message })
    )
    patch({
      routes,
      routeBusy: false,
      routeMsg: failed
        ? `${failed} départ(s) n’ont pas pu être calculés — estimation conservée`
        : 'Itinéraires calculés et enregistrés'
    })
    setBusy(false)
  }

  return (
    <aside className="filters">
      <div className="filters__head">
        <h2 className="filters__title">{t('filters')}</h2>
        {active.length > 0 && (
          <>
            <span className="filters__badge">
              {active.length} {t('filters_active')}
            </span>
            <button type="button" className="linkbtn linkbtn--sm u-nowrap" onClick={resetAll}>
              {t('filter_clear_all')}
            </button>
          </>
        )}
      </div>

      <section className="filters__section">
        <RangeFilter
          range="base"
          label={t('altitude_village')}
          openKey="range_all_altitudes"
          format={(v) => `${fmt(v)} m`}
          unit="m"
          help={t('filter_altitude_min_help')}
        />
        <RangeFilter
          range="summit"
          label={t('altitude_top')}
          openKey="range_all_summits"
          format={(v) => `${fmt(v)} m`}
          unit="m"
        />
        <RangeFilter
          range="km"
          label={t('filter_km_range')}
          openKey="range_all_sizes"
          format={(v) => `${fmt(v)} km`}
          unit="km"
          help={t('filter_km_help')}
        />
      </section>

      <section className="filters__section">
        <h3 className="filters__legend">Trajet en voiture</h3>
        <div style={{ display: 'grid', gap: 6 }}>
          {origins.map((o, i) => (
            <div
              key={o.id}
              className="hh-row"
              style={{ color: peopleAt(i) ? 'var(--text)' : 'var(--muted)' }}
            >
              <span style={{ color: peopleAt(i) ? 'var(--ok)' : 'var(--border)' }}>●</span>
              <span style={{ flex: 1, minWidth: 0 }}>{o.fullLabel}</span>
            </div>
          ))}
        </div>
        <p className="filters__help filters__help--tight">
          {t('households_note')}
        </p>
        <button type="button" className="linkbtn" onClick={() => patch({ peopleOpen: true })}>
          {t('manage_travelers')}
        </button>

        <div style={{ margin: '8px 0' }}>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => void onComputeRoutes()}
            disabled={state.routeBusy}
          >
            {state.routeBusy ? 'Calcul en cours…' : 'Calculer les temps de trajet'}
          </button>
          <p className="filters__help">
            {t('origin_precompute_help')}
          </p>
          <p
            className="filters__help"
            style={{ color: coverage.done ? 'var(--muted)' : 'var(--warn)' }}
          >
            {coverage.done === 0
              ? 'Aucun itinéraire calculé : les durées affichées sont des estimations'
              : coverage.done >= coverage.total
                ? `Les ${coverage.total} itinéraires sont calculés`
                : `${coverage.done} itinéraire(s) sur ${coverage.total} calculés — les autres restent estimés`}
          </p>
          {state.routeMsg && <p className="notice notice--info" style={{ marginTop: 4, fontSize: 12 }}>{state.routeMsg}</p>}
        </div>

        <RangeFilter
          range="travel"
          label={t('filter_travel_range')}
          openKey="range_all_travels"
          format={(v) => dur(v)}
          unit={t('minutes')}
        />
        <RangeFilter
          range="dist"
          label={t('filter_dist_range')}
          openKey="range_all_distances"
          format={(v) => `${fmt(v)} km`}
          unit="km"
        />
        <label className="check">
          <input
            type="checkbox"
            checked={state.avoidTolls}
            onChange={(e) => patch({ avoidTolls: e.target.checked })}
          />
          {t('filter_avoid_tolls')}
        </label>
      </section>

      <section className="filters__section">
        <RangeFilter
          range="forfait"
          label={t('filter_pass_range')}
          openKey="range_all_prices"
          format={(v) => eur(v)}
          unit="€"
          help={t('filter_forfait_help')}
        />
      </section>

      {/* Massif et Options sont repliés : ce sont les deux sections qu'on ne
          règle qu'une fois, et déroulées elles repoussaient le bouton de
          réinitialisation hors de l'écran. Le résumé dit l'état sans ouvrir. */}
      <details className="filters__section filters__details">
        <summary>
          {t('filter_massif')} <span className="filters__summary">{massifSummary}</span>
        </summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {massifCounts.map((m) => {
            const on = state.massifs.includes(m.name)
            return (
              <button
                key={m.name}
                type="button"
                className={`chip${on ? ' chip--on' : ''}`}
                onClick={() =>
                  patch({
                    massifs: on ? state.massifs.filter((x) => x !== m.name) : [...state.massifs, m.name]
                  })
                }
              >
                {m.name} <span className="chip__count">{m.count}</span>
              </button>
            )
          })}
        </div>
      </details>

      <details className="filters__section filters__details">
        <summary>
          {t('filter_options')} <span className="filters__summary">{optionsSummary}</span>
        </summary>
        <label className="check" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={state.glacier} onChange={(e) => patch({ glacier: e.target.checked })} />
          {t('filter_glacier')}
        </label>
        <label className="check">
          <input type="checkbox" checked={state.linked} onChange={(e) => patch({ linked: e.target.checked })} />
          {t('filter_linked')}
        </label>
      </details>

      <button type="button" className="btn btn--strong" onClick={resetAll}>
        {t('filter_reset')}
      </button>
      {hh.length === 0 && <p className="notice notice--warn">{t('no_household')}</p>}
    </aside>
  )
}
