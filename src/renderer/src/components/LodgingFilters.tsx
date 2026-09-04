import { RangeFilter } from './RangeFilter'
import { StayDatesField } from './StayDatesField'
import { hasConfirmedPrice } from '@/data/lodgingFilter'
import { useActiveLodgingFilters } from './activeLodgingFilters'
import { lodgingSources, LODG_TYPES, srcOf } from '@/data/lodgings'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { LODG_FILTER_RESET, stayCriteriaReady, useApp } from '@/state/appState'
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
  const { nights, lodgAll, lodgHidden, lodgList } = useDerived()

  // Les sources proposées sont celles que le moteur a interrogées au dernier
  // relevé, plus celles réellement portées par les offres.
  const sources = lodgingSources(lodgAll, state.lodgQueried)

  /**
   * Compte affiché sur la puce d'une source : ce que cocher cette source peut
   * réellement faire apparaître.
   *
   * Compté sur `lodgAll`, il annonçait « Airbnb 61 » alors que la liste ne
   * pouvait en montrer aucune — les annonces écartées faute de prix vérifié
   * étaient comptées comme si elles allaient s'afficher. Un compte qui promet
   * ce que le filtre ne peut pas tenir est pire qu'une absence de compte.
   *
   * Le décompte ignore volontairement l'état des autres sources : sinon les
   * nombres changeraient à chaque case cochée, et on ne saurait plus ce qu'on
   * lit.
   */
  const stay = { checkIn: state.arrDate, checkOut: state.depDate }
  const countBySource = (key: string): number =>
    lodgAll.filter((l) => srcOf(l) === key && hasConfirmedPrice(l, stay)).length

  /**
   * Ce que les filtres écartent se lit désormais ici et nulle part ailleurs :
   * la page ne porte plus ni puces ni compte de masqués. Le panneau est donc
   * le seul endroit qui explique une liste courte — d'où sa place en tête,
   * au-dessus des réglages qui l'ont produite.
   */
  const active = useActiveLodgingFilters()

  /** Même définition que la page : un relevé ne part pas sur des dates fausses. */
  const ready = stayCriteriaReady(state)

  return (
    <aside className="filters">
      <h2 className="filters__title">Filtres</h2>

      {/* Le relevé se lance d'ici. `lodgPhase` est la seule source de vérité de
          l'écran de chargement : poser `'searching'` suffit à demander une
          recherche, sans rien savoir de `launchSearch`, et la page retombe
          d'elle-même sur la saisie si les dates ne tiennent pas debout. Voir
          l'effet correspondant dans `LodgingsPage`. */}
      <button
        type="button"
        className="btn btn--primary filters__search"
        disabled={!ready}
        title={ready ? undefined : t('lodg_dates_invalid')}
        onClick={() => patch({ lodgPhase: 'searching', lodgSearchMsg: null, lodgFiltersOpen: false })}
      >
        {t('filter_search')}
      </button>
      {/* Sans cette garde, un clic sur des dates invalides faisait clignoter
          l'écran de chargement puis remplaçait la mosaïque par le formulaire de
          critères, sans un mot : la phase retombe sur `'criteria'`. */}
      {!ready && (
        <p className="filters__help" style={{ margin: '-6px 0 12px' }}>
          {t('lodg_dates_invalid')}
        </p>
      )}

      {active.active.length > 0 && (
        <div className="filterchips filterchips--infilters">
          {active.active.map((f) => (
            <button key={f.key} type="button" className="chip" onClick={f.clear} title={t('filter_clear_all')}>
              {f.label} <span className="u-muted">✕</span>
            </button>
          ))}
          <button type="button" className="linkbtn linkbtn--sm u-nowrap" onClick={active.resetAll}>
            {t('filter_clear_all')}
          </button>
        </div>
      )}

      {/* Un filtre qui écarte des annonces doit se voir : sans ce compte, une
          liste courte ressemble à une recherche infructueuse. */}
      {lodgHidden > 0 && lodgList.length > 0 && (
        <button
          type="button"
          className="linkbtn filters__hidden"
          onClick={active.resetAll}
          title={t('lodg_reset_filters_title')}
        >
          {t('lodg_hidden_by_filters').replace('{n}', String(lodgHidden))}
        </button>
      )}

      <section className="filters__section">
        <h3 className="filters__legend">{t('stay_label')}</h3>
        <StayDatesField />
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
                onClick={() => patch({ rooms: Math.max(0, state.rooms - 1) })}
              >
                −
              </button>
              <span className="stepper__value">
                {state.rooms === 0 ? t('lodg_rooms_studio') : state.rooms}
              </span>
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
                {key} <span className="chip__count">{countBySource(key)}</span>
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
        {/* La case « Disponibilité confirmée uniquement » a été retirée : la
            réservabilité est devenue une règle de l'écran, appliquée sans
            recours dans `state/selectors.tsx`. Elle permettait de désactiver la
            seule garantie que la liste apporte, et une annonce introuvable au
            dernier relevé revenait alors avec un avertissement qui renvoyait
            l'utilisateur vérifier sur la source ce que l'application savait
            déjà. Voir `data/lodgingAvailability.ts`. */}
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
