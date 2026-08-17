import { useState } from 'react'
import { useI18n } from '@/i18n'
import type { AppState, FilterRangeKey } from '@/state/appState'
import { FILTER_RANGES, useApp } from '@/state/appState'
import { rangeOpen, useDerived } from '@/state/selectors'
import { computeRoutes, routesCoverage } from '@/domain/travel'
import { useFormat } from '@/hooks/useFormat'
import { RangeFilter } from './RangeFilter'

/** Ordre canonique des massifs français, du plus fourni au moins fourni. */
const MASSIF_ORDER = ['Alpes du Nord', 'Alpes du Sud', 'Pyrénées', 'Massif central', 'Jura', 'Vosges']

/**
 * Valeurs de repos des filtres de domaines.
 *
 * Sert deux choses d'un coup : le bouton « Réinitialiser », et le calcul des
 * filtres actifs — un filtre est actif quand il s'écarte de cette table. Une
 * liste séparée pour chaque usage aurait fini par diverger, et le compteur
 * aurait annoncé des filtres que la réinitialisation ne remettait pas à zéro.
 *
 * Chaque borne haute repart à son **plafond**. La remettre à 0 fermerait la
 * plage sur le seul zéro et viderait la liste, ce qui est exactement l'inverse
 * de ce qu'attend un bouton « Réinitialiser ».
 */
const FILTER_DEFAULTS = {
  domainQuery: '',
  baseMin: 0,
  baseMax: FILTER_RANGES.base.max,
  summitMin: 0,
  summitMax: FILTER_RANGES.summit.max,
  kmMin: 10,
  kmMax: FILTER_RANGES.km.max,
  travelMin: 0,
  travelMax: FILTER_RANGES.travel.max,
  distMin: 0,
  distMax: FILTER_RANGES.dist.max,
  forfaitMin: 0,
  forfaitMax: FILTER_RANGES.forfait.max,
  avoidTolls: false,
  massifs: [] as string[],
  glacier: false,
  linked: false
} satisfies Partial<AppState>

export function FilterPanel(): JSX.Element {
  const { dur, eur, fmt } = useFormat()
  const { state, patch, domains } = useApp()
  const { origins, hh } = useDerived()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  const coverage = routesCoverage(origins, domains, state.routes)
  const peopleAt = (i: number): number => state.people.filter((p) => p.home === i).length

  /**
   * Filtres qui s'écartent de leur valeur de repos, chacun avec de quoi le
   * retirer seul. Rendre visible ce qui restreint la liste évite le « pourquoi
   * ne vois-je que trois domaines » qui vient d'un curseur oublié en haut du
   * panneau, hors du champ de vision.
   */
  const active: { key: string; label: string; clear: () => void }[] = []
  const add = (key: string, label: string, reset: Partial<AppState>): void => {
    active.push({ key, label, clear: () => patch(reset) })
  }

  /**
   * Puce d'une plage posée.
   *
   * Sa croix **rouvre la plage entière** — plancher à 0, plafond au maximum —
   * au lieu de ramener une borne à 0, qui refermerait le filtre au plus serré
   * au moment même où on croit le retirer.
   */
  const addRange = (range: FilterRangeKey, name: string, render: (v: number) => string): void => {
    const spec = FILTER_RANGES[range]
    const lo = state[spec.lo] as number
    const hi = state[spec.hi] as number
    if (rangeOpen(lo, hi, spec.max)) return
    const high = hi >= spec.max ? t('range_no_limit') : render(hi)
    add(range, `${name} ${render(lo)} – ${high}`, {
      [spec.lo]: 0,
      [spec.hi]: spec.max
    } as unknown as Partial<AppState>)
  }

  if (state.domainQuery.trim()) add('q', `« ${state.domainQuery.trim()} »`, { domainQuery: '' })
  addRange('base', t('chip_base'), (v) => `${fmt(v)} m`)
  addRange('summit', t('chip_summit'), (v) => `${fmt(v)} m`)
  addRange('km', t('chip_km'), (v) => `${fmt(v)} km`)
  addRange('travel', t('chip_travel'), (v) => dur(v))
  addRange('dist', t('chip_dist'), (v) => `${fmt(v)} km`)
  addRange('forfait', t('chip_pass'), (v) => eur(v))
  if (state.avoidTolls) add('tolls', t('filter_avoid_tolls'), { avoidTolls: false })
  for (const name of state.massifs) {
    add(`massif:${name}`, name, { massifs: state.massifs.filter((x) => x !== name) })
  }
  if (state.glacier) add('glacier', t('filter_glacier'), { glacier: false })
  if (state.linked) add('linked', t('filter_linked'), { linked: false })

  const resetAll = (): void => patch({ ...FILTER_DEFAULTS })

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

      {active.length > 0 && (
        <div className="filters__chips">
          {active.map((f) => (
            <button key={f.key} type="button" className="chip" onClick={f.clear} title={t('geo_remove')}>
              {f.label} <span className="u-muted">✕</span>
            </button>
          ))}
        </div>
      )}

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
