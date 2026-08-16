import { ExternalIcon } from './Icons'
import { lodgingSources, LODG_TYPES, srcOf } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { deepLinks } from '@/data/deeplinks'
import { stationNameOf } from '@/data/stations'
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

export function LodgingFilters({ domain }: { domain: Domain }): JSX.Element {
  const { fmt } = useFormat()
  const { t } = useI18n()
  const { state, patch } = useApp()
  const { nights, lodgAll } = useDerived()

  /**
   * Recherches pré-remplies sur les sites d'origine.
   *
   * Tant que les connecteurs partenaires ne sont pas ouverts, c'est le chemin
   * honnête vers l'offre réelle : on construit l'URL avec les critères saisis
   * ici plutôt que de laisser l'utilisateur les ressaisir sur chaque site.
   */
  const deeplinks = deepLinks({
    domainName: domain.name,
    arrDate: state.arrDate,
    depDate: state.depDate,
    travelers: state.travelers,
    rooms: state.rooms,
    officialUrl: domain.booking ?? domain.website
  })

  /** Nom réellement envoyé aux sites : celui de la station, pas du domaine relié. */
  const station = stationNameOf(domain.name)

  const copy = (url: string): void => {
    void navigator.clipboard.writeText(url).catch(() => undefined)
  }


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
        <label className="field-label">
          Budget total maximum
          <strong className="u-nowrap">{state.lodgBudget ? `${fmt(state.lodgBudget)} €` : '—'}</strong>
        </label>
        <input
          type="range"
          min={0}
          max={8000}
          step={100}
          value={state.lodgBudget}
          onChange={(e) => patch({ lodgBudget: +e.target.value })}
        />
        <p className="filters__help">{t('lodg_price_allin_note')}</p>
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
        <label className="field-label">
          Distance max aux pistes
          <strong className="u-nowrap">{state.lodgDist ? `${fmt(state.lodgDist)} m` : '—'}</strong>
        </label>
        <input
          type="range"
          min={0}
          max={1000}
          step={50}
          value={state.lodgDist}
          onChange={(e) => patch({ lodgDist: +e.target.value })}
        />
        <p className="filters__help">
          {t('walk_dist_note')}
        </p>
      </section>

      <section className="filters__section">
        <h3 className="filters__legend">Sources</h3>
        <div style={{ display: 'grid', gap: 7, fontSize: 13 }}>
          {lodgingSources(lodgAll).map((key) => {
            const on = !state.lodgSrcOff.includes(key)
            return (
              <button
                key={key}
                type="button"
                className="srcrow"
                title="Afficher / masquer cette source"
                onClick={() =>
                  patch({
                    lodgSrcOff: on ? [...state.lodgSrcOff, key] : state.lodgSrcOff.filter((k) => k !== key)
                  })
                }
              >
                <span style={{ color: on ? 'var(--ok)' : 'var(--border-soft)' }}>●</span>
                <span style={{ flex: 1, color: on ? 'var(--text)' : 'var(--muted)' }}>{key}</span>
                <span className="u-muted" style={{ fontSize: 12 }}>
                  {lodgAll.filter((l) => srcOf(l) === key).length} offres
                </span>
              </button>
            )
          })}
        </div>
        <p className="filters__help">
          Sources API et scraping agrégées dans la même liste — relevé toutes les heures, réservation sur le site
          d’origine. Cliquez une source pour la masquer.
        </p>

        <p style={{ margin: '14px 0 6px', fontSize: 12, fontWeight: 600 }}>{t('lodg_prefilled_search')}</p>
        {station !== domain.name && (
          <p className="filters__help" style={{ margin: '0 0 8px' }}>
            {t('lodg_station_query').replace('{n}', station)}
          </p>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {deeplinks.map((dl) => (
            <div key={dl.name} style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: dl.official ? 600 : 400 }}>
                  {dl.official ? t('lodg_official_site') : dl.name}
                  {dl.official && dl.verified === false && (
                    <span
                      className="u-muted"
                      style={{ fontWeight: 400, fontSize: 11 }}
                      title={t('lodg_official_unverified_note')}
                    >
                      {` · ${t('lodg_official_unverified')}`}
                    </span>
                  )}
                </span>
                <button type="button" className="linkbtn linkbtn--sm" onClick={() => copy(dl.url)}>
                  copier
                </button>
                <a href={dl.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600 }}>
                  ouvrir
                  <ExternalIcon />
                </a>
              </div>
              <span className="u-ellipsis u-muted" style={{ fontSize: 11 }}>
                {dl.url}
              </span>
            </div>
          ))}
        </div>
        <p className="filters__help filters__help--tight">{t('deeplinks_note')}</p>
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
        <label className="check" style={{ margin: '8px 0 0' }}>
          <input
            type="checkbox"
            checked={state.hideGone}
            onChange={(e) => patch({ hideGone: e.target.checked })}
          />
          {t('lodg_gone_hide')}
        </label>
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
