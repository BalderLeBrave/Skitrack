import { useState } from 'react'
import { useI18n } from '@/i18n'
import type { AppState } from '@/state/appState'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { computeRoutes, routesCoverage } from '@/domain/travel'
import { useFormat } from '@/hooks/useFormat'

/** Ordre canonique des massifs français, du plus fourni au moins fourni. */
const MASSIF_ORDER = ['Alpes du Nord', 'Alpes du Sud', 'Pyrénées', 'Massif central', 'Jura', 'Vosges']

/**
 * Valeurs de repos des filtres de domaines.
 *
 * Sert deux choses d'un coup : le bouton « Réinitialiser », et le calcul des
 * filtres actifs — un filtre est actif quand il s'écarte de cette table. Une
 * liste séparée pour chaque usage aurait fini par diverger, et le compteur
 * aurait annoncé des filtres que la réinitialisation ne remettait pas à zéro.
 */
const FILTER_DEFAULTS = {
  domainQuery: '',
  altMin: 0,
  altMax: 0,
  kmMin: 10,
  travelMax: 0,
  distMax: 0,
  forfaitMax: 0,
  avoidTolls: false,
  massifs: [] as string[],
  glacier: false,
  linked: false
} satisfies Partial<AppState>

export function FilterPanel(): JSX.Element {
  const { dur, fmt } = useFormat()
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
  if (state.domainQuery.trim()) add('q', `« ${state.domainQuery.trim()} »`, { domainQuery: '' })
  if (state.altMin !== FILTER_DEFAULTS.altMin)
    add('altMin', `${t('altitude_bottom')} ≥ ${fmt(state.altMin)} m`, { altMin: FILTER_DEFAULTS.altMin })
  if (state.altMax !== FILTER_DEFAULTS.altMax)
    add('altMax', `${t('altitude_top')} ≥ ${fmt(state.altMax)} m`, { altMax: FILTER_DEFAULTS.altMax })
  if (state.kmMin !== FILTER_DEFAULTS.kmMin)
    add('kmMin', `${t('slopes')} ≥ ${fmt(state.kmMin)} km`, { kmMin: FILTER_DEFAULTS.kmMin })
  if (state.travelMax !== FILTER_DEFAULTS.travelMax)
    add('travelMax', `${t('travel_time')} ≤ ${dur(state.travelMax)}`, { travelMax: FILTER_DEFAULTS.travelMax })
  if (state.distMax !== FILTER_DEFAULTS.distMax)
    add('distMax', `≤ ${fmt(state.distMax)} km`, { distMax: FILTER_DEFAULTS.distMax })
  if (state.forfaitMax !== FILTER_DEFAULTS.forfaitMax)
    add('forfaitMax', `${t('pass_6d_adult')} ≤ ${fmt(state.forfaitMax)} €`, {
      forfaitMax: FILTER_DEFAULTS.forfaitMax
    })
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
        <label className="field-label">
          Altitude minimum du bas des pistes
          <strong className="u-nowrap">{fmt(state.altMin)} m</strong>
        </label>
        <input
          type="range"
          min={0}
          max={2400}
          step={50}
          value={state.altMin}
          onChange={(e) => patch({ altMin: +e.target.value })}
        />
        <p className="filters__help">
          Le critère le plus corrélé à la tenue de la neige. Attention : c’est le point skiable le plus bas, pas
          l’altitude du village.
        </p>
      </section>

      <section className="filters__section">
        <label className="field-label">
          {t('filter_altitude_max')}<strong className="u-nowrap">{fmt(state.altMax)} m</strong>
        </label>
        <input
          type="range"
          min={0}
          max={4000}
          step={100}
          value={state.altMax}
          onChange={(e) => patch({ altMax: +e.target.value })}
        />
      </section>

      <section className="filters__section">
        <label className="field-label">
          {t('filter_slopes_km')}<strong className="u-nowrap">{fmt(state.kmMin)} km</strong>
        </label>
        <input
          type="range"
          min={0}
          max={600}
          step={10}
          value={state.kmMin}
          onChange={(e) => patch({ kmMin: +e.target.value })}
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

        <label className="field-label">
          Temps de trajet maximum
          <strong className="u-nowrap">{state.travelMax ? dur(state.travelMax) : '—'}</strong>
        </label>
        <input
          type="range"
          min={0}
          max={720}
          step={15}
          value={state.travelMax}
          onChange={(e) => patch({ travelMax: +e.target.value })}
        />
        <label className="field-label">
          Distance maximum
          <strong className="u-nowrap">{state.distMax ? `${fmt(state.distMax)} km` : '—'}</strong>
        </label>
        <input
          type="range"
          min={0}
          max={1200}
          step={25}
          value={state.distMax}
          onChange={(e) => patch({ distMax: +e.target.value })}
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
        <label className="field-label">
          Forfait 6 jours adulte, au plus
          <strong className="u-nowrap">{state.forfaitMax ? `${fmt(state.forfaitMax)} €` : '—'}</strong>
        </label>
        <input
          type="range"
          min={0}
          max={400}
          step={10}
          value={state.forfaitMax}
          onChange={(e) => patch({ forfaitMax: +e.target.value })}
        />
        <p className="filters__help">
          Tarif public haute saison du domaine relié. Les domaines sans tarif relevé sont masqués quand ce filtre est
          actif.
        </p>
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
