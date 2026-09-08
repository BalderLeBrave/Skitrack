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
          label={t('altitude_bottom')}
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

      <details className="filters__section filters__details" data-testid="filter-pistes">
        <summary>
          {t('piste_filter_title')}{' '}
          <span className="filters__summary">
            {state.pistePreset === 'all' &&
            !state.pisteMinGreen &&
            !state.pisteMinBlue &&
            !state.pisteMinRed &&
            !state.pisteMinBlack &&
            !state.pisteMinOther
              ? t('none_fem')
              : [
                  state.pisteFilterUnit !== 'count' ? t(`piste_mode_${state.pisteFilterUnit}` as 'piste_mode_km') : null,
                  state.pistePreset !== 'all' ? t(`piste_preset_${state.pistePreset}` as 'piste_preset_famille') : null,
                  state.pisteMinBlack ? `N≥${state.pisteMinBlack}` : null
                ]
                  .filter(Boolean)
                  .join(' · ') || t('piste_profile')}
          </span>
        </summary>
        <p className="filters__help">{t('piste_filter_help')}</p>
        <fieldset className="filters__radios" data-testid="filter-piste-unit">
          <legend>{t('piste_filter_unit')}</legend>
          {(['count', 'km', 'pct'] as const).map((u) => (
            <label key={u} className="check">
              <input
                type="radio"
                name="piste-unit"
                checked={(state.pisteFilterUnit ?? 'count') === u}
                onChange={() => patch({ pisteFilterUnit: u })}
                data-testid={`filter-piste-unit-${u}`}
              />
              {t(`piste_mode_${u}` as 'piste_mode_count')}
            </label>
          ))}
        </fieldset>
        {([
          ['pisteMinGreen', 'piste_min_green'],
          ['pisteMinBlue', 'piste_min_blue'],
          ['pisteMinRed', 'piste_min_red'],
          ['pisteMinBlack', 'piste_min_black'],
          ['pisteMinOther', 'piste_min_other']
        ] as const).map(([key, label]) => {
          const value = state[key]
          const on = value > 0
          const unit = state.pisteFilterUnit ?? 'count'
          const max = unit === 'pct' ? 100 : unit === 'km' ? 400 : 80
          const suffix = unit === 'km' ? 'km' : unit === 'pct' ? '%' : t('piste_runs')
          return (
            <label key={key} className="check" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => patch({ [key]: e.target.checked ? Math.max(1, value) : 0 })}
                data-testid={`filter-${key}`}
              />
              {t(label)}
              {on && (
                <>
                  <input
                    type="number"
                    min={1}
                    max={max}
                    value={value}
                    className="filters__num"
                    data-testid={`filter-${key}-n`}
                    onChange={(e) => patch({ [key]: Math.min(max, Math.max(1, Number(e.target.value) || 1)) })}
                  />
                  <span className="filters__unit">{suffix}</span>
                </>
              )}
            </label>
          )
        })}
        <fieldset className="filters__radios">
          <legend>{t('piste_profile')}</legend>
          {(['all', 'famille', 'mixte', 'engage', 'expert'] as const).map((p) => (
            <label key={p} className="check">
              <input
                type="radio"
                name="piste-preset"
                checked={state.pistePreset === p}
                onChange={() => patch({ pistePreset: p })}
                data-testid={`filter-piste-preset-${p}`}
              />
              {t(`piste_preset_${p}` as 'piste_preset_all')}
            </label>
          ))}
        </fieldset>
        <label className="check" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={state.pisteHideEmpty}
            onChange={(e) => patch({ pisteHideEmpty: e.target.checked })}
            data-testid="filter-piste-hide-empty"
          />
          {t('piste_hide_empty')}
        </label>
      </details>

      <button type="button" className="btn btn--strong" onClick={resetAll}>
        {t('filter_reset')}
      </button>
      {hh.length === 0 && <p className="notice notice--warn">{t('no_household')}</p>}
    </aside>
  )
}
