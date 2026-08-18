import { RangeFilter } from './RangeFilter'
import { lodgingSources, LODG_TYPES, srcOf } from '@/data/lodgings'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { LODG_FILTER_RESET, useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import type { LodgSortKey } from '@/state/appState'

const SORT_LABELS: [LodgSortKey, string][] = [
  ['pp_asc', 'Prix par personne'],
  ['total_asc', 'Prix total'],
  ['dist_asc', 'Distance aux pistes'],
  ['note_desc', 'Note voyageurs']
]

export function LodgingFilters(): JSX.Element {
  const { eur, fmt } = useFormat()
  const { t } = useI18n()
  const { state, patch } = useApp()
  const { nights, lodgAll } = useDerived()

  // Les sources proposées sont celles que le moteur a interrogées au dernier
  // relevé, plus celles réellement portées par les offres.
  const sources = lodgingSources(lodgAll, state.lodgQueried)

  return (
    <aside className="filters">
      <h2 className="filters__title">Filtres</h2>

      <section className="filters__section">
        <h3 className="filters__legend">{t('stay_label')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div>
            <span className="filters__help" style={{ margin: 0 }}>
              {t('arrival')}
            </span>
            <input
              type="date"
              className="field"
              style={{ marginTop: 3, fontSize: 13, padding: '6px 8px' }}
              value={state.arrDate}
              onChange={(e) => patch({ arrDate: e.target.value })}
            />
          </div>
          <div>
            <span className="filters__help" style={{ margin: 0 }}>
              {t('departure_label')}
            </span>
            <input
              type="date"
              className="field"
              style={{ marginTop: 3, fontSize: 13, padding: '6px 8px' }}
              value={state.depDate}
              onChange={(e) => patch({ depDate: e.target.value })}
            />
          </div>
        </div>
        <p className="filters__help" style={{ margin: '6px 0 8px' }}>
          {nights} nuit(s)
          {nights === 7 ? ' · semaine des vacances de février (zone C)' : ''}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div>
            <span className="filters__help" style={{ margin: 0 }}>
              Voyageurs
            </span>
            <div className="stepper">
              <button
                type="button"
                className="stepper__btn"
                onClick={() =>
                  patch({
                    travelers: Math.max(1, state.travelers - 1),
                    children: Math.min(state.children, Math.max(1, state.travelers - 1) - 1)
                  })
                }
              >
                −
              </button>
              <span className="stepper__value">{state.travelers}</span>
              <button
                type="button"
                className="stepper__btn"
                onClick={() => patch({ travelers: Math.min(12, state.travelers + 1) })}
              >
                +
              </button>
            </div>
          </div>
          <div>
            <span className="filters__help" style={{ margin: 0 }}>
              Chambres min
            </span>
            <div className="stepper">
              <button
                type="button"
                className="stepper__btn"
                onClick={() => patch({ rooms: Math.max(1, state.rooms - 1) })}
              >
                −
              </button>
              <span className="stepper__value">{state.rooms}</span>
              <button
                type="button"
                className="stepper__btn"
                onClick={() => patch({ rooms: Math.min(6, state.rooms + 1) })}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 6 }}>
          <span className="filters__help" style={{ margin: 0 }}>
            dont enfants (moins de 13 ans)
          </span>
          <div className="stepper" style={{ maxWidth: 150 }}>
            <button
              type="button"
              className="stepper__btn"
              onClick={() => patch({ children: Math.max(0, state.children - 1) })}
            >
              −
            </button>
            <span className="stepper__value">{state.children}</span>
            <button
              type="button"
              className="stepper__btn"
              onClick={() => patch({ children: Math.min(state.travelers - 1, state.children + 1) })}
            >
              +
            </button>
          </div>
          <p className="filters__help filters__help--tight">
            {t('kids_count_note')}
          </p>
        </div>
      </section>

      <section className="filters__section">
        <RangeFilter
          range="lodgBudget"
          label={t('filter_lodg_budget_range')}
          openKey="range_all_offers"
          format={(v) => eur(v)}
          unit="€"
          help={t('lodg_price_allin_note')}
        />
      </section>

      <section className="filters__section">
        <h3 className="filters__legend">Type de bien</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {LODG_TYPES.map((name) => {
            const on = state.lodgTypes.includes(name)
            return (
              <button
                key={name}
                type="button"
                className={`chip${on ? ' chip--on' : ''}`}
                onClick={() =>
                  patch({
                    lodgTypes: on ? state.lodgTypes.filter((t) => t !== name) : [...state.lodgTypes, name]
                  })
                }
              >
                {name}
              </button>
            )
          })}
        </div>
      </section>

      <section className="filters__section">
        <RangeFilter
          range="lodgDist"
          label={t('filter_lodg_dist_range')}
          openKey="range_all_lodg_distances"
          format={(v) => `${fmt(v)} m`}
          unit="m"
          help={t('walk_dist_note')}
        />
      </section>

      {/* Les sources sont des puces, comme « Type de bien » juste au-dessus :
          même geste, même géométrie. La liste à pastille disait la même chose en
          trois fois plus de hauteur, et les URL en clair qui la suivaient
          n'avaient rien à faire dans un panneau de filtres — elles restent
          disponibles sur la fiche de chaque logement. */}
      <section className="filters__section">
        <h3 className="filters__legend">{t('sources_label')}</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {sources.map((key) => {
            const on = !state.lodgSrcOff.includes(key)
            return (
              <button
                key={key}
                type="button"
                className={`chip${on ? ' chip--on' : ''}`}
                title={t('lodg_source_toggle')}
                aria-pressed={on}
                onClick={() =>
                  patch({
                    lodgSrcOff: on ? [...state.lodgSrcOff, key] : state.lodgSrcOff.filter((k) => k !== key)
                  })
                }
              >
                {key} <span className="chip__count">{lodgAll.filter((l) => srcOf(l) === key).length}</span>
              </button>
            )
          })}
        </div>
        <p className="filters__help">{t('lodg_sources_note')}</p>
      </section>

      <section className="filters__section">
        <label className="check" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={state.lodgAnnul}
            onChange={(e) => patch({ lodgAnnul: e.target.checked })}
          />
          Annulation gratuite uniquement
        </label>
        {/* Le filtre par défaut de l'écran : une liste de logements est une
            liste de logements réservables. Voir `data/lodgingAvailability.ts`. */}
        <label className="check" style={{ margin: '8px 0 0' }}>
          <input
            type="checkbox"
            checked={state.lodgOnlyAvailable}
            onChange={(e) => patch({ lodgOnlyAvailable: e.target.checked })}
          />
          {t('avail_only')}
        </label>
        <p className="filters__help">{t('avail_only_help')}</p>
      </section>

      <section className="filters__section">
        <label className="field-label">Trier par</label>
        <select
          className="field"
          value={state.lodgSort}
          onChange={(e) => patch({ lodgSort: e.target.value as LodgSortKey })}
        >
          {SORT_LABELS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </section>

      {/* Ne remet à zéro que les filtres. Les dates et le groupe sont le séjour
          lui-même : les réécrire ici (« 6 voyageurs, 3 chambres ») écrasait la
          saisie de l'utilisateur et masquait au passage toute sa liste. */}
      <button type="button" className="btn" onClick={() => patch({ ...LODG_FILTER_RESET })}>
        {t('lodg_filters_reset')}
      </button>
    </aside>
  )
}
