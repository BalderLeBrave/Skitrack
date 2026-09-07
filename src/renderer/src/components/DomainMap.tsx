import { api } from '@/api/client'
import { hasCoords } from '@/data/referentiel'
import { ensureSidecarOrigin } from '@/domain/origins'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { BASEMAPS, resolvedBasemap, type BasemapKey } from './basemap'
import { skiMapStyle } from './skiMapStyle'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'

export type { BasemapKey }
export { DEFAULT_BASEMAP, BASEMAPS } from './basemap'

/**
 * Carte des domaines.
 *
 * Fond OpenTopoMap : c'est le seul fond raster libre qui montre le relief et
 * les courbes de niveau, ce qui est exactement l'information utile ici. Sa
 * politique d'usage impose l'attribution (affichée en permanence) et un usage
 * modéré — d'où l'absence de préchargement de tuiles et le zoom plafonné à 15.
 *
 * Les pistes réelles viennent d'OpenSnowMap (tuiles OSM, sans clé). La vue 3D
 * drape ce fond sur un MNT Terrarium. Overpass n'est plus interrogé : la
 * surcouche couvre toutes les stations, à tous les zooms.
 */

const ACCENT = '#0b6fc2'

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Paliers affichés, en minutes : 2 h, 4 h et 6 h de route. */
const ISO_RANGES = [120, 240, 360]

export function DomainMap(): JSX.Element {
  const { state, patch, domains } = useApp()
  const { t } = useI18n()
  const { eur } = useFormat()
  const { matchesFilters, hh, filtered, forfaitOf } = useDerived()

  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const is3D = useRef(false)
  const signatures = useRef<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const [iso, setIso] = useState<GeoJSON.FeatureCollection | null>(null)
  const [isoError, setIsoError] = useState<string | null>(null)
  const active = resolvedBasemap(state.basemap)

  /** Ne repousse la donnée que si elle a changé : `setData` invalide les tuiles
   *  vectorielles et reprojette tout, ce qui se voit à chaque frappe. */
  const pushData = (source: GeoJSONSource | undefined, key: string, data: GeoJSON.FeatureCollection): void => {
    if (!source) return
    const sig = JSON.stringify(data)
    if (signatures.current[key] === sig) return
    signatures.current[key] = sig
    source.setData(data)
  }

  // --- Initialisation ------------------------------------------------------
  useEffect(() => {
    if (!container.current || map.current) return
    const m = new maplibregl.Map({
      container: container.current,
      style: skiMapStyle(state.basemap, state.pisteOverlay),
      center: [6.5, 45.4],
      zoom: 6,
      attributionControl: false,
      maxPitch: 60
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new maplibregl.AttributionControl({ compact: true }))
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }))
    const host = container.current
    const ro = host ? new ResizeObserver(() => m.resize()) : null
    if (host && ro) ro.observe(host)
    // Le bruit d'erreurs de tuiles (CORS, réseau coupé) ne dit rien d'utile :
    // la carte reste fonctionnelle, seul le fond manque.
    m.on('error', (e) => {
      if (e?.error && !/tile/i.test(String(e.error))) console.warn('[map]', e.error.message ?? e.error)
    })

    m.on('load', () => {
      m.addSource('domains', {
        type: 'geojson',
        data: EMPTY,
        cluster: true,
        clusterRadius: 45,
        clusterMaxZoom: 9
      })
      m.addSource('dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 14
      })
      m.addSource('dem-shade', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 13
      })
      m.addSource('isochrones', { type: 'geojson', data: EMPTY })

      try {
        m.setSky({
          'sky-color': '#a9c8e4',
          'horizon-color': '#dfe9f1',
          'fog-color': '#dfe9f1',
          'sky-horizon-blend': 0.6,
          'horizon-fog-blend': 0.6,
          'fog-ground-blend': 0.2
        })
      } catch {
        /* ciel non supporté : sans effet sur le reste */
      }

      m.addLayer({
        id: 'hillshade',
        type: 'hillshade',
        source: 'dem-shade',
        layout: { visibility: 'none' },
        paint: { 'hillshade-exaggeration': 0.28 }
      })
      // Les isochrones passent sous les points : on veut lire les domaines,
      // pas la zone de temps de trajet.
      m.addLayer({
        id: 'iso-fill',
        type: 'fill',
        source: 'isochrones',
        paint: {
          'fill-color': ['interpolate', ['linear'], ['get', 'value'], 3600, '#2f6f4e', 10800, '#a35a06', 21600, '#a4402f'],
          'fill-opacity': 0.16
        }
      })
      m.addLayer({
        id: 'iso-line',
        type: 'line',
        source: 'isochrones',
        paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.45 }
      })
      m.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'domains',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1d4e79',
          'circle-opacity': 0.85,
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 40, 30],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#e8f1fb'
        }
      })
      m.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'domains',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Semibold'],
          'text-size': 12
        },
        paint: { 'text-color': '#e8f1fb' }
      })
      m.addLayer({
        id: 'points',
        type: 'circle',
        source: 'domains',
        filter: ['!', ['has', 'point_count']],
        paint: {
          // La couleur encode le bas des pistes : la carte répond à « où est la
          // neige » sans avoir à cliquer. Les domaines hors filtres restent
          // visibles en gris, sinon la carte ment sur la densité réelle.
          'circle-color': [
            'case',
            ['==', ['get', 'match'], false],
            '#c2c2c2',
            ['interpolate', ['linear'], ['coalesce', ['get', 'altitude_min_m'], 0], 600, '#8d6a4b', 1200, '#a35a06', 1600, '#0f62c9', 2000, '#e8f1fb']
          ],
          'circle-opacity': ['case', ['==', ['get', 'match'], false], 0.55, 1],
          // Le survol grossit l'épingle autant que la sélection : c'est le même
          // geste de désignation, l'un depuis la liste, l'autre depuis la carte.
          'circle-radius': [
            'case',
            ['==', ['get', 'selected'], true],
            12,
            ['==', ['get', 'hovered'], true],
            12,
            ['==', ['get', 'match'], false],
            5.5,
            9
          ],
          'circle-stroke-width': [
            'case',
            ['==', ['get', 'selected'], true],
            3.5,
            ['==', ['get', 'hovered'], true],
            3.5,
            2.5
          ],
          'circle-stroke-color': [
            'case',
            ['==', ['get', 'selected'], true],
            ACCENT,
            ['==', ['get', 'hovered'], true],
            ACCENT,
            '#ffffff'
          ]
        }
      })
      m.addLayer({
        id: 'point-labels',
        type: 'symbol',
        source: 'domains',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'match'], true]],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Open Sans Semibold'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-optional': true
        },
        paint: { 'text-color': '#182430', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 }
      })

      m.on('click', 'points', (e) => {
        const f = e.features?.[0]
        if (f?.properties?.id == null) return
        const id = Number(f.properties.id)
        patch({ selectedId: id, pinnedId: id })
        const results = document.getElementById('st-results')
        if (results) results.scrollTop = 0
      })
      m.on('click', 'clusters', (e) => {
        const f = e.features?.[0]
        const clusterId = f?.properties?.cluster_id
        if (clusterId == null) return
        const source = m.getSource('domains') as GeoJSONSource
        void source.getClusterExpansionZoom(Number(clusterId)).then((zoom) => {
          if (f?.geometry?.type === 'Point') m.easeTo({ center: f.geometry.coordinates as [number, number], zoom })
        })
      })
      for (const layer of ['points', 'clusters']) {
        m.on('mouseenter', layer, () => {
          m.getCanvas().style.cursor = 'pointer'
        })
        m.on('mouseleave', layer, () => {
          m.getCanvas().style.cursor = ''
        })
      }

      // Survol croisé, sens carte → liste. `mousemove` et non `mouseenter` :
      // deux épingles voisines s'échangent le survol sans quitter la couche, et
      // `mouseenter` ne se déclencherait qu'une fois pour les deux.
      m.on('mousemove', 'points', (e) => {
        const id = e.features?.[0]?.properties?.id
        patch({ hoveredId: id == null ? null : Number(id) })
      })
      m.on('mouseleave', 'points', () => patch({ hoveredId: null }))

      setLoaded(true)
      m.resize()

      const bounds = new maplibregl.LngLatBounds()
      const placed = domains.filter(hasCoords)
      for (const d of placed) bounds.extend([d.lon, d.lat])
      const home = hh.find((o) => o.lat != null && o.lon != null)
      if (home) bounds.extend([home.lon!, home.lat!])
      if (placed.length > 0) m.fitBounds(bounds, { padding: 48, maxZoom: 11, duration: 0 })
    })

    map.current = m
    return () => {
      ro?.disconnect()
      m.remove()
      map.current = null
      setLoaded(false)
    }
    // Une seule initialisation : les mises à jour passent par les effets de
    // synchronisation ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Publication du cadrage.
   *
   * Sur `moveend` **et** `zoomend` : un zoom à la molette ne déclenche pas
   * toujours `moveend`, et sans lui la liste resterait celle de l'échelle
   * précédente. Chaque geste réactive le suivi au passage — après un « tout
   * voir », rezoomer doit refiltrer : c'est le geste qui commande, pas un
   * réglage qu'il faudrait retrouver.
   */
  useEffect(() => {
    const m = map.current
    if (!loaded || !m) return
    const push = (): void => {
      const b = m.getBounds()
      patch({
        domBounds: { w: b.getWest(), e: b.getEast(), s: b.getSouth(), n: b.getNorth() },
        domMapSync: true
      })
    }
    m.on('moveend', push)
    m.on('zoomend', push)
    return () => {
      m.off('moveend', push)
      m.off('zoomend', push)
    }
  }, [loaded, patch])

  /**
   * Recadrage demandé par un autre écran, consommé une seule fois.
   *
   * Le drapeau est effacé dans le même `patch` que le cadrage : le laisser
   * levé referait un `fitBounds` à chaque rendu et empêcherait tout déplacement
   * manuel de la carte.
   */
  useEffect(() => {
    const m = map.current
    if (!loaded || !m || !state.domFitWanted) return
    const placed = filtered.filter(hasCoords)
    if (placed.length > 0) {
      const bounds = new maplibregl.LngLatBounds()
      for (const d of placed) bounds.extend([d.lon, d.lat])
      m.fitBounds(bounds, { padding: 48, maxZoom: 10, duration: 0 })
    }
    patch({ domFitWanted: false })
  }, [state.domFitWanted, loaded, filtered, patch])

  // --- Marqueurs des départs ----------------------------------------------
  useEffect(() => {
    if (!loaded || !map.current) return
    for (const mk of markers.current) mk.remove()
    // Un départ sans adresse géocodée n'a pas de position à marquer.
    markers.current = hh
      .filter((o) => o.lat != null && o.lon != null)
      .map((o) => {
        const el = document.createElement('div')
        el.className = 'map-origin'
        el.title = o.fullLabel
        return new maplibregl.Marker({ element: el }).setLngLat([o.lon!, o.lat!]).addTo(map.current!)
      })
  }, [hh, loaded])

  // --- Points des domaines -------------------------------------------------
  useEffect(() => {
    if (!loaded || !map.current) return
    // Les domaines sans position restent dans la liste de résultats mais pas
    // sur la carte : un point à (0, 0) tomberait au large du golfe de Guinée.
    const features: GeoJSON.Feature[] = domains.filter(hasCoords).map((d) => {
      // Le forfait 6 jours est porté par l'épingle : c'est le chiffre qui
      // départage deux domaines voisins, et le lire sans cliquer est tout
      // l'intérêt d'une carte à côté de la liste. Absent, l'étiquette se
      // limite au nom — jamais un prix inventé.
      const pass = forfaitOf(d).j6
      return {
        type: 'Feature',
        id: d.id,
        geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
        properties: {
          id: d.id,
          name: d.name,
          altitude_min_m: d.min,
          match: matchesFilters(d),
          selected: d.id === state.selectedId,
          hovered: d.id === state.hoveredId,
          label: pass != null ? `${d.name}\n${eur(pass)}` : d.name
        }
      }
    })
    pushData(map.current.getSource('domains') as GeoJSONSource, 'domains', {
      type: 'FeatureCollection',
      features
    })
  }, [domains, matchesFilters, state.selectedId, state.hoveredId, forfaitOf, eur, loaded])

  // --- Isochrones ----------------------------------------------------------
  useEffect(() => {
    if (!loaded || !map.current) return
    pushData(map.current.getSource('isochrones') as GeoJSONSource, 'iso', state.isoShown && iso ? iso : EMPTY)
  }, [state.isoShown, iso, loaded])

  // --- Fond de carte -------------------------------------------------------
  useEffect(() => {
    const m = map.current
    if (!loaded || !m) return
    // En « relief ombré », le fond raster est retiré pour ne garder que
    // l'ombrage du terrain : les courbes de niveau d'OpenTopoMap se battent
    // avec l'ombrage et brouillent la lecture des pentes, qui est justement ce
    // qu'on vient regarder en 3D.
    const bare = state.threeD && state.relief === 'ombre'
    for (const b of BASEMAPS) {
      const on = !bare && b.key === active ? 'visible' : 'none'
      if (m.getLayer(`bm-${b.key}`)) m.setLayoutProperty(`bm-${b.key}`, 'visibility', on)
    }
    if (m.getLayer('ov-pistes')) {
      m.setLayoutProperty('ov-pistes', 'visibility', state.pisteOverlay ? 'visible' : 'none')
    }
    // L'ombrage n'est allumé qu'en mode « relief ombré » : par-dessus un fond
    // raster il double l'information et salit les couleurs. Les valeurs sont
    // celles de la maquette — assez contrastées pour lire une pente sans fond.
    if (m.getLayer('hillshade')) {
      m.setLayoutProperty('hillshade', 'visibility', bare ? 'visible' : 'none')
      if (bare) {
        m.setPaintProperty('hillshade', 'hillshade-exaggeration', 0.62)
        m.setPaintProperty('hillshade', 'hillshade-shadow-color', '#5b6470')
        m.setPaintProperty('hillshade', 'hillshade-highlight-color', '#ffffff')
        m.setPaintProperty('hillshade', 'hillshade-accent-color', '#8d97a4')
      }
    }
  }, [active, state.pisteOverlay, state.relief, state.threeD, loaded])

  // --- Relief 3D -----------------------------------------------------------
  useEffect(() => {
    const m = map.current
    if (!loaded || !m || !m.getSource('dem')) return
    const want = state.threeD
    const d = domains.find((x) => x.id === state.selectedId) ?? domains[0]
    if (!d) return

    if (want && !is3D.current) {
      is3D.current = true
      m.setTerrain({ source: 'dem', exaggeration: 1.15 })
    }
    if (want) {
      m.easeTo({ center: [d.lon, d.lat], zoom: 12.4, pitch: 54, bearing: -20, duration: 1400 })
    } else if (is3D.current) {
      is3D.current = false
      m.setTerrain(null)
      m.easeTo({ pitch: 0, bearing: 0, zoom: 6.6, center: [d.lon, d.lat], duration: 900 })
    }

    // En 3D les aplats d'isochrones masquent le relief : on les retire.
    for (const id of ['iso-fill', 'iso-line']) {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', want ? 'none' : 'visible')
    }
  }, [state.threeD, state.selectedId, domains, loaded])

  /**
   * Isochrones réelles, calculées par le moteur local via OpenRouteService.
   *
   * Le départ doit exister dans la base du moteur pour être géocodé et servir
   * de point de calcul : il y est créé à la volée depuis l'adresse saisie dans
   * le panneau Voyageurs. Sans adresse, sans moteur ou sans clé ORS, on le dit
   * plutôt que de dessiner des cercles approximatifs qui passeraient pour des
   * temps de trajet réels.
   */
  const showIsochrones = async (): Promise<void> => {
    if (state.isoBusy) return
    const home = hh[0]
    if (!home) {
      setIsoError('Aucun départ défini — ajoutez une adresse dans Voyageurs.')
      return
    }

    patch({ isoBusy: true })
    setIsoError(null)
    try {
      const originId = await ensureSidecarOrigin(home)
      const result = await api.isochrones(originId, ISO_RANGES, state.avoidTolls ? 'car_no_toll' : 'car')
      setIso(result.geojson)
      patch({ isoShown: true })
      if (home.originId !== originId) {
        patch({ places: state.places.map((p) => (p.id === home.id ? { ...p, originId } : p)) })
      }
    } catch (err) {
      setIsoError(err instanceof Error ? err.message : String(err))
    } finally {
      patch({ isoBusy: false })
    }
  }

  return (
    <div className="map">
      <div ref={container} className="map__canvas" />
      <div className="map__overlay">
        {state.pisteOverlay && (
          <div className="map__legend">
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>Pistes — OpenSnowMap / OSM</span>
            <span className="map__legend-row">
              <span className="map__swatch" style={{ background: '#3aa655' }} />
              verte
              <span className="map__swatch" style={{ background: '#2a78d6', marginLeft: 6 }} />
              bleue
            </span>
            <span className="map__legend-row">
              <span className="map__swatch" style={{ background: '#d0021b' }} />
              rouge
              <span className="map__swatch" style={{ background: '#101418', marginLeft: 6 }} />
              noire
            </span>
            <span className="map__legend-row">
              <span style={{ width: 16, borderTop: '2px dashed #6b7280', flex: '0 0 auto' }} />
              {t('map_lift')}
            </span>
          </div>
        )}

        <div className="map__legend">
          <span className="map__legend-row">
            <span className="map__dot" style={{ background: 'var(--link)' }} />
            correspond aux filtres
          </span>
          <span className="map__legend-row">
            <span className="map__dot map__dot--small" style={{ background: 'var(--dim)' }} />
            autre station de la base
          </span>
          <span className="map__legend-row">
            <span className="map__dot" style={{ background: 'none', border: '2px solid var(--brand)' }} />
            {t('map_clicked_first')}
          </span>
        </div>

        <button
          type="button"
          className="map__btn map__btn--dark"
          onClick={() => patch({ threeD: !state.threeD })}
          title="Relief 3D du domaine sélectionné"
        >
          {state.threeD ? 'Vue 2D' : 'Vue 3D · relief'}
        </button>

        <button
          type="button"
          className={`map__btn${state.pisteOverlay ? ' map__btn--accent' : ''}`}
          onClick={() => patch({ pisteOverlay: !state.pisteOverlay })}
        >
          {state.pisteOverlay ? t('map_pistes_on') : t('map_pistes_off')}
        </button>

        {/* La bascule ne s'affiche qu'en 3D : sans terrain, « relief ombré »
            n'aurait rien à montrer une fois le fond retiré. */}
        {state.threeD && (
          <div className="seg">
            <button
              type="button"
              className={`seg__btn${state.relief === 'carte' ? ' seg__btn--on' : ''}`}
              onClick={() => patch({ relief: 'carte' })}
            >
              {t('relief_map')}
            </button>
            <button
              type="button"
              className={`seg__btn${state.relief === 'ombre' ? ' seg__btn--on' : ''}`}
              onClick={() => patch({ relief: 'ombre' })}
            >
              {t('relief_hillshade')}
            </button>
          </div>
        )}

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="map__btn"
            style={{ width: '100%', textAlign: 'left' }}
            onClick={() => patch({ baseOpen: !state.baseOpen })}
            aria-expanded={state.baseOpen}
          >
            {t('basemap')} · {t((BASEMAPS.find((b) => b.key === active) ?? BASEMAPS[0]).label)}
          </button>
          {state.baseOpen && (
            <div className="basepicker">
              {BASEMAPS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className={`basepicker__row${active === b.key ? ' basepicker__row--on' : ''}`}
                  onClick={() => patch({ basemap: b.key, baseOpen: false })}
                >
                  <span className="basepicker__label">{t(b.label)}</span>
                  <span className="basepicker__sub">{t(b.sub)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="map__btn map__btn--accent" onClick={() => void showIsochrones()}>
          {state.isoBusy ? 'Calcul…' : 'Afficher les zones de temps de trajet'}
        </button>
        {isoError && (
          <p className="map__error">
            {isoError}
            <span className="u-muted"> {t('iso_needs_engine')}</span>
          </p>
        )}
      </div>
    </div>
  )
}
