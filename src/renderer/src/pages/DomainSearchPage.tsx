import { useCallback, useMemo, useState } from 'react'
import { DomainCard } from '@/components/DomainCard'
import { DomainMap } from '@/components/DomainMap'
import { FilterPanel } from '@/components/FilterPanel'
import { SearchIcon } from '@/components/Icons'
import { api, isClientReady } from '@/api/client'
import type { GeocodeResult } from '@/api/types'
import { useI18n } from '@/i18n'
import type { SortKey } from '@/state/appState'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useWeather } from '@/state/weather'

/** Au-delà, la liste devient plus longue que ce qu'on parcourt à l'œil, et le
 *  rendu des vignettes coûte plus qu'il n'apporte. */
const MAX_RESULTS = 40

/** Largeur minimale de la colonne centrale : en dessous, une vignette de
 *  domaine ne tient plus ses deux colonnes de statistiques. */
const CENTER_MIN = 340

/** Options du tri, dans l'ordre de la maquette v3. */
const SORT_OPTIONS: [SortKey, Parameters<ReturnType<typeof useI18n>['t']>[0]][] = [
  ['relevance', 'sort_relevance'],
  ['altitude_min_desc', 'sort_altitude_min_desc'],
  ['altitude_max_desc', 'sort_altitude_max_desc'],
  ['slopes_km_desc', 'sort_slopes_km_desc'],
  ['travel_time_asc', 'sort_travel_time_asc'],
  ['forfait_asc', 'sort_forfait_asc'],
  ['name_asc', 'sort_name_asc']
]

/**
 * Nom court d'un résultat de géocodage.
 *
 * Nominatim renvoie la hiérarchie administrative complète — « Bourg-Saint-
 * Maurice, Albertville, Savoie, Auvergne-Rhône-Alpes, France métropolitaine,
 * 73700, France » — illisible dans un bandeau. On garde la commune et le code
 * postal, qui sont exactement ce qui distingue deux homonymes.
 */
function shortLabel(hit: GeocodeResult): string {
  const town = hit.city ?? hit.label.split(',')[0].trim()
  return hit.postcode ? `${town} (${hit.postcode})` : town
}

/**
 * Position à prendre avec des pincettes.
 *
 * Le champ `provider` dit **quel** géocodeur a répondu, pas s'il a bien
 * répondu : Nominatim est le géocodeur principal dès que la requête ne
 * ressemble pas à une adresse française, et le voir n'a donc rien d'anormal.
 * Les deux `score` ne sont pas comparables non plus — celui de la BAN est une
 * confiance de 0 à 1, celui de Nominatim l'« importance » OSM, qui mesure la
 * notoriété du lieu et non la précision de l'appariement. On juge donc chacun
 * sur ce qu'il sait dire.
 */
function isApproximate(hit: GeocodeResult): boolean {
  if (hit.provider === 'ban') return hit.score != null && hit.score < 0.5
  // Ni commune ni code postal : l'appariement n'a pas atteint une localité.
  return hit.city == null && hit.postcode == null
}

/**
 * Barre de recherche et classement autour d'une commune.
 *
 * Deux gestes distincts dans un seul champ : la saisie filtre la liste sur le
 * nom, la région et le massif ; le bouton (ou la touche Entrée) prend le même
 * texte pour une commune, la géocode, et **classe** les domaines par distance
 * sans en écarter aucun. Confondre les deux — filtrer sur un rayon — ferait
 * disparaître un domaine à 90 km parce qu'on a tapé le nom d'un village.
 */
function SearchBar(): JSX.Element {
  const { state, patch } = useApp()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  const runGeo = async (): Promise<void> => {
    const q = state.domainQuery.trim()
    if (!q || busy) return
    if (!isClientReady()) {
      patch({ geoMsg: t('geo_needs_engine') })
      return
    }
    setBusy(true)
    patch({ geoBusy: true, geoMsg: '' })
    try {
      const hits = await api.geocode(q, 1)
      const best = hits[0]
      if (!best) {
        patch({ geoMsg: t('geo_not_found'), geoBusy: false })
      } else {
        patch({
          geo: { label: shortLabel(best), lat: best.lat, lon: best.lon, approx: isApproximate(best) },
          geoMsg: '',
          geoBusy: false
        })
      }
    } catch (err) {
      patch({ geoMsg: err instanceof Error ? err.message : String(err), geoBusy: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="searchbar">
        <div className="searchbar__field">
          <SearchIcon />
          <input
            type="search"
            value={state.domainQuery}
            onChange={(e) => patch({ domainQuery: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runGeo()
            }}
            placeholder={t('search_placeholder')}
            aria-label={t('search_aria')}
          />
          {state.domainQuery && (
            <button
              type="button"
              className="iconbtn iconbtn--bare"
              onClick={() => patch({ domainQuery: '' })}
              aria-label={t('clear_label')}
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn btn--pill u-nowrap"
          onClick={() => void runGeo()}
          disabled={state.geoBusy || !state.domainQuery.trim()}
        >
          {state.geoBusy ? t('geo_searching') : t('geo_around_town')}
        </button>
      </div>

      {state.geo && (
        <div className="geobanner">
          <span style={{ flex: 1, minWidth: 0 }}>
            {t('geo_sorted_from')} <strong>{state.geo.label}</strong>
          </span>
          <button type="button" className="linkbtn" onClick={() => patch({ geo: null })}>
            {t('geo_remove')}
          </button>
        </div>
      )}
      {state.geo?.approx && <p className="notice notice--warn">{t('geo_approx')}</p>}
      {state.geoMsg && <p className="notice notice--warn">{state.geoMsg}</p>}

      {/* Résolution en tâche de fond des positions absentes du référentiel :
          dite, parce qu'un domaine qui apparaît sur la carte en cours de
          consultation sans explication ressemble à un bug. */}
      {state.geoResolve && (
        <p className="wxage" style={{ color: 'var(--link)' }}>
          Positions manquantes en cours de résolution — {state.geoResolve.done}/{state.geoResolve.total}
        </p>
      )}
    </>
  )
}

/** Âge du dernier relevé Open-Meteo, avec de quoi le refaire à la main. */
function WeatherAge(): JSX.Element | null {
  const { t } = useI18n()
  const { fetchedAt, loading, refresh } = useWeather()
  if (fetchedAt == null) return null

  const minutes = Math.max(0, Math.round((Date.now() - fetchedAt) / 60000))
  const ago =
    minutes < 60
      ? `${minutes} ${t('minutes')}`
      : `${Math.floor(minutes / 60)} ${t('hours')} ${String(minutes % 60).padStart(2, '0')}`

  return (
    <div className="wxage">
      <span style={{ flex: 1, minWidth: 0 }}>
        {t('wx_recorded')} · {t('ago_pattern').replace('{d}', ago)}
      </span>
      <button type="button" className="linkbtn" onClick={refresh} disabled={loading}>
        {loading ? t('loading') : t('refresh')}
      </button>
    </div>
  )
}

export function DomainSearchPage(): JSX.Element {
  const { state, patch, domains, viewportW } = useApp()
  const { filtered, domOutOfView } = useDerived()
  const { t } = useI18n()

  const list = useMemo(() => filtered.slice(0, MAX_RESULTS), [filtered])

  // Échelle altimétrique commune à toutes les vignettes du jeu de résultats.
  const [scaleMin, scaleMax] = useMemo(() => {
    if (list.length === 0) return [500, 3500]
    return [Math.min(...list.map((d) => d.min)) - 100, Math.max(...list.map((d) => d.max)) + 100]
  }, [list])

  /**
   * Redimensionnement des colonnes latérales.
   *
   * La contrainte est la colonne centrale : filtres et carte ne peuvent pas
   * l'écraser sous `CENTER_MIN`, et l'une ne peut pas manger la place de
   * l'autre. Le calcul est fait au pointeur plutôt qu'en CSS parce que les deux
   * poignées partagent le même budget de largeur.
   */
  const startDrag = useCallback(
    (key: 'searchFiltersW' | 'searchMapW', dir: 1 | -1, min: number) =>
      (e: React.MouseEvent): void => {
        e.preventDefault()
        const startX = e.clientX
        const startW = state[key]
        const other = key === 'searchFiltersW' ? 'searchMapW' : 'searchFiltersW'
        const otherOpen = key === 'searchFiltersW' ? state.searchMapOpen : state.searchFiltersOpen
        const max = (): number => Math.max(min, window.innerWidth - 320 - 12 - (otherOpen ? state[other] : 0))

        const move = (ev: MouseEvent): void => {
          patch({ [key]: Math.min(max(), Math.max(min, startW + dir * (ev.clientX - startX))) })
        }
        const up = (): void => {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
          document.body.style.cursor = ''
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
        document.body.style.cursor = 'col-resize'
      },
    [state, patch]
  )

  // Les largeurs demandées sont rabotées au prorata quand la fenêtre rétrécit,
  // pour que la colonne centrale garde sa largeur minimale.
  const gridTemplate = useMemo(() => {
    const win = viewportW
    let fw = state.searchFiltersOpen ? state.searchFiltersW : 0
    let mw = state.searchMapOpen ? state.searchMapW : 0
    const avail = win - CENTER_MIN - (fw ? 6 : 0) - (mw ? 6 : 0)
    if (fw + mw > avail) {
      const k = Math.max(avail, 0) / (fw + mw || 1)
      mw = Math.max(mw > 0 ? 240 : 0, Math.floor(mw * k))
      fw = Math.max(fw > 0 ? 220 : 0, Math.min(Math.floor(fw * k), Math.max(avail - mw, 0)))
      if (fw + mw > avail && mw > 0) mw = Math.max(avail - fw, 0)
    }
    return [fw ? `${fw}px 6px` : null, `minmax(${CENTER_MIN}px,1fr)`, mw ? `6px ${mw}px` : null]
      .filter(Boolean)
      .join(' ')
  }, [state.searchFiltersOpen, state.searchMapOpen, state.searchFiltersW, state.searchMapW, viewportW])

  return (
    <div className="search" style={{ gridTemplateColumns: gridTemplate }}>
      {state.searchFiltersOpen && (
        <>
          <FilterPanel />
          <div
            className="gutter"
            onMouseDown={startDrag('searchFiltersW', 1, 220)}
            title="Glisser pour redimensionner"
          />
        </>
      )}

      <section id="st-results" className="results">
        <SearchBar />
        <WeatherAge />

        <header className="results__head">
          <button
            type="button"
            className="btn btn--pill"
            onClick={() => patch({ searchFiltersOpen: !state.searchFiltersOpen })}
          >
            {state.searchFiltersOpen ? t('filters_hide') : t('filters_show')}
          </button>
          <button
            type="button"
            className="btn btn--pill"
            // Ouvrir ou fermer la carte remet le suivi du cadrage en marche :
            // filtrer sur une carte invisible n'aurait aucun sens, et le
            // rouvrir doit repartir d'un état net.
            onClick={() => patch({ searchMapOpen: !state.searchMapOpen, domMapSync: true })}
          >
            {state.searchMapOpen ? t('map_hide') : t('map_show')}
          </button>
          <h2 className="results__count">
            {filtered.length} {t('results_count')} {t('results_of')} {domains.length}
          </h2>
          {state.pinnedId != null && (
            <button type="button" className="linkbtn" onClick={() => patch({ pinnedId: null })}>
              {t('unpin_map')}
            </button>
          )}
          {/* Le cadrage est un filtre comme un autre : il s'annonce, et il se
              retire. Sans cette puce, une liste raccourcie par un zoom passe
              pour une liste vidée par les filtres. */}
          {domOutOfView > 0 && (
            <span className="results__viewchip">
              {t('dom_out_of_view').replace('{n}', String(domOutOfView))}
              <button type="button" className="linkbtn linkbtn--sm" onClick={() => patch({ domMapSync: false })}>
                {t('dom_view_all')}
              </button>
            </span>
          )}
          {/* Le classement par commune remplace le tri : proposer les deux
              ensemble laisserait croire qu'ils se combinent. */}
          {!state.geo && (
            <label className="results__sort">
              {t('sort_by')}
              <select
                className="field field--panel"
                value={state.sort}
                aria-label={t('sort_aria')}
                onChange={(e) => patch({ sort: e.target.value as SortKey })}
              >
                {SORT_OPTIONS.map(([value, key]) => (
                  <option key={value} value={value}>
                    {t(key)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </header>

        {filtered.length === 0 && (
          <div className="results__empty">
            <p>{t('results_empty')}</p>
            <p className="u-muted">{t('results_empty_hint')}</p>
          </div>
        )}

        <div className="results__grid">
          {list.map((d) => (
            <DomainCard key={d.id} domain={d} scaleMin={scaleMin} scaleMax={scaleMax} />
          ))}
        </div>
      </section>

      {state.searchMapOpen && (
        <>
          <div className="gutter" onMouseDown={startDrag('searchMapW', -1, 280)} title="Glisser pour redimensionner" />
          <div className="map-shell">
            <DomainMap />
          </div>
        </>
      )}
    </div>
  )
}
