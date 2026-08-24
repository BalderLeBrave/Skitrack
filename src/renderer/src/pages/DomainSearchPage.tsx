import { useCallback, useMemo, useState } from 'react'
import { DomainCard } from '@/components/DomainCard'
import { DomainMap } from '@/components/DomainMap'
import { FilterPanel } from '@/components/FilterPanel'
import { FilterPopover } from '@/components/FilterPopover'
import { useActiveFilters } from '@/components/activeFilters'
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

/** Largeur minimale de la colonne de liste : en dessous, une vignette de
 *  domaine ne tient plus ses deux colonnes de statistiques. */
const CENTER_MIN = 340

/** Bornes du partage liste / carte, en pourcentage de largeur pour la carte. */
const SPLIT_MIN = 25
const SPLIT_MAX = 65

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
  const { filtered, domOutOfView, overBudget } = useDerived()
  const { t } = useI18n()
  const { active, resetAll } = useActiveFilters()

  const list = useMemo(() => filtered.slice(0, MAX_RESULTS), [filtered])

  // Échelle altimétrique commune à toutes les vignettes du jeu de résultats.
  const [scaleMin, scaleMax] = useMemo(() => {
    if (list.length === 0) return [500, 3500]
    return [Math.min(...list.map((d) => d.min)) - 100, Math.max(...list.map((d) => d.max)) + 100]
  }, [list])

  /**
   * Déplacement de la séparation liste / carte.
   *
   * Le partage est exprimé en pourcentage : la proportion 55 – 45 doit tenir
   * quand la fenêtre change de taille, là où une largeur en pixels donnait une
   * carte de plus en plus étroite à mesure qu'on agrandissait. La liste garde
   * malgré tout `CENTER_MIN` : sous cette largeur, une vignette perd sa
   * deuxième colonne de chiffres.
   */
  const startDrag = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault()
      const move = (ev: MouseEvent): void => {
        const win = window.innerWidth
        const pct = ((win - ev.clientX) / win) * 100
        const ceiling = Math.min(SPLIT_MAX, ((win - CENTER_MIN) / win) * 100)
        patch({ searchSplit: Math.round(Math.min(ceiling, Math.max(SPLIT_MIN, pct))) })
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
    [patch]
  )

  // Carte fermée : la liste prend toute la largeur. Ouverte : deux colonnes, la
  // liste gardant sa largeur minimale sur une fenêtre étroite.
  const gridTemplate = useMemo(() => {
    if (!state.searchMapOpen) return '1fr'
    const pct = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, state.searchSplit))
    const mapW = Math.round((viewportW * pct) / 100)
    return `minmax(${CENTER_MIN}px, 1fr) 6px ${mapW}px`
  }, [state.searchMapOpen, state.searchSplit, viewportW])

  return (
    <div className="search" style={{ gridTemplateColumns: gridTemplate }}>
      {/* `results--full` quand la carte est masquée : la colonne occupe alors
          toute la largeur et son filet de séparation n'a plus rien à séparer —
          il traçait une bordure le long du bord droit de la fenêtre. */}
      <section id="st-results" className={`results${state.searchMapOpen ? '' : ' results--full'}`}>
        <SearchBar />
        <WeatherAge />

        <header className="results__head">
          {/* Le panneau s'ouvre **sous ce bouton**, en survol : la liste reste
              visible et se met à jour derrière à chaque mouvement de curseur.
              En colonne, elle passait sous la ligne de flottaison et on réglait
              un critère sans voir ce qu'il changeait. */}
          <FilterPopover
            open={state.searchFiltersOpen}
            onToggle={() => patch({ searchFiltersOpen: !state.searchFiltersOpen })}
            onClose={() => patch({ searchFiltersOpen: false })}
            label={t('filters')}
            count={active.length}
          >
            <FilterPanel />
          </FilterPopover>
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
          {/* Le budget s'annonce comme le cadrage, et pour la même raison : une
              station écartée par un plafond posé sur un autre écran doit
              pouvoir se retrouver sans qu'on cherche pourquoi elle a disparu.
              Le bouton bascule l'affichage, il n'efface pas le budget. */}
          {overBudget > 0 && (
            <span className="results__viewchip">
              {t('budget_over_banner').replace('{n}', String(overBudget))}
              <button
                type="button"
                className="linkbtn linkbtn--sm"
                onClick={() => patch({ budgetShowOver: !state.budgetShowOver })}
              >
                {state.budgetShowOver ? t('budget_hide_over') : t('budget_show_over')}
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

        {/* Rangée de puces : ce qui restreint la liste, retirable une par une,
            visible même panneau fermé. Le panneau, lui, s'ouvre en survol de la
            liste plutôt qu'en colonne — il sert au réglage, pas à la lecture. */}
        {active.length > 0 && (
          <div className="filterchips">
            {active.map((f) => (
              <button key={f.key} type="button" className="chip" onClick={f.clear} title={t('geo_remove')}>
                {f.label} <span className="u-muted">✕</span>
              </button>
            ))}
            <button type="button" className="linkbtn linkbtn--sm u-nowrap" onClick={resetAll}>
              {t('filter_clear_all')}
            </button>
          </div>
        )}

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
          <div className="gutter" onMouseDown={startDrag} title={t('split_drag')} />
          <div className="map-shell">
            <DomainMap />
          </div>
        </>
      )}
    </div>
  )
}
