import { useEffect, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api } from '@/api/client'
import type { Domain } from '@/data/referentiel'
import { hasCoords } from '@/data/referentiel'
import { ensureSidecarOrigin } from '@/domain/origins'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'

/**
 * Carte des domaines.
 *
 * Fond OpenTopoMap : c'est le seul fond raster libre qui montre le relief et
 * les courbes de niveau, ce qui est exactement l'information utile ici. Sa
 * politique d'usage impose l'attribution (affichée en permanence) et un usage
 * modéré — d'où l'absence de préchargement de tuiles et le zoom plafonné à 15.
 *
 * La vue 3D bascule sur un modèle numérique de terrain et va chercher le tracé
 * réel des pistes du domaine sélectionné dans OpenStreetMap. Les réponses
 * Overpass sont mises en cache : le service est public, lent et contingenté, et
 * refaire la requête à chaque bascule serait à la fois impoli et pénible.
 */

const PISTE_KEY = 'skitrack-v3-pistes'

const PISTE_COLORS: Record<string, string> = {
  novice: '#3aa655',
  easy: '#2a78d6',
  intermediate: '#d0021b',
  advanced: '#101418',
  expert: '#101418'
}

const STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
  },
  layers: []
}

/**
 * Fonds de carte proposés par le sélecteur.
 *
 * Chacun répond à une question différente : le Plan IGN pour lire les hameaux
 * et les accès, l'orthophoto pour juger les pentes et les barres rocheuses,
 * OpenTopoMap pour la lecture classique aux courbes de niveau, le satellite
 * mondial parce que les fonds IGN s'arrêtent à la frontière, et un fond clair
 * sur lequel les épingles de prix ressortent.
 */
export const BASEMAPS = [
  {
    key: 'ign',
    label: 'Plan IGN',
    sub: 'topographie française, la plus lisible pour le relief et les hameaux',
    tiles: [
      'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
    ],
    maxzoom: 15,
    attribution: '© <a href="https://www.ign.fr">IGN</a> · Plan IGN v2'
  },
  {
    key: 'ortho',
    label: 'Photo aérienne',
    sub: 'orthophoto IGN — on voit les pentes, les forêts et les barres rocheuses',
    tiles: [
      'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
    ],
    maxzoom: 18,
    attribution: '© <a href="https://www.ign.fr">IGN</a> · BD ORTHO'
  },
  {
    key: 'topo',
    label: 'OpenTopoMap',
    sub: 'courbes de niveau marquées, lecture classique de carte de montagne',
    tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
    maxzoom: 15,
    attribution:
      '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> · ' +
      '<a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
  },
  {
    key: 'sat',
    label: 'Satellite',
    sub: 'imagerie mondiale — utile près des frontières suisse et italienne',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    maxzoom: 18,
    attribution: '© Esri · Maxar, Earthstar Geographics'
  },
  {
    key: 'sobre',
    label: 'Sobre',
    sub: 'fond clair et discret — les prix et les épingles ressortent',
    tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
    maxzoom: 19,
    attribution:
      '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> · ' +
      '© <a href="https://carto.com/attributions">CARTO</a>'
  }
] as const

export type BasemapKey = (typeof BASEMAPS)[number]['key']

/** Le fond de départ : topographie française, la plus lisible en montagne. */
export const DEFAULT_BASEMAP: BasemapKey = 'ign'

for (const b of BASEMAPS) {
  STYLE.sources[`bm-${b.key}`] = {
    type: 'raster',
    tiles: [...b.tiles],
    tileSize: 256,
    maxzoom: b.maxzoom,
    attribution: b.attribution
  }
}
STYLE.layers = [
  { id: 'bg', type: 'background', paint: { 'background-color': '#eef2f5' } },
  ...BASEMAPS.map((b) => ({
    id: `bm-${b.key}`,
    type: 'raster' as const,
    source: `bm-${b.key}`,
    layout: { visibility: (b.key === DEFAULT_BASEMAP ? 'visible' : 'none') as 'visible' | 'none' }
  }))
]

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

type PisteCache = Record<string, GeoJSON.FeatureCollection>

function readPisteCache(): PisteCache {
  try {
    const raw = localStorage.getItem(PISTE_KEY)
    return raw ? (JSON.parse(raw) as PisteCache) : {}
  } catch {
    return {}
  }
}

interface OverpassElement {
  geometry?: { lat: number; lon: number }[]
  tags?: Record<string, string>
}

/** Tracé de secours quand Overpass est injoignable : des descentes plausibles
 *  convergeant vers le front de neige, pour que la vue 3D reste lisible. */
function syntheticPistes(d: Domain): GeoJSON.FeatureCollection {
  const colors = ['#3aa655', '#2a78d6', '#d0021b', '#101418']
  let seed = d.id * 97 + 13
  const rnd = (): number => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  const features: GeoJSON.Feature[] = []
  const runs = 5 + (d.km > 150 ? 3 : 0)
  for (let r = 0; r < runs; r++) {
    const ang = (r / runs) * Math.PI * 2 + rnd() * 0.6
    let lon = d.lon + Math.cos(ang) * (0.01 + rnd() * 0.008)
    let lat = d.lat + Math.sin(ang) * (0.007 + rnd() * 0.005)
    const tx = d.lon + (rnd() - 0.5) * 0.004
    const ty = d.lat + (rnd() - 0.5) * 0.003
    const pts: [number, number][] = [[lon, lat]]
    for (let i = 0; i < 7; i++) {
      lon += (tx - lon) * 0.3 + (rnd() - 0.5) * 0.0032
      lat += (ty - lat) * 0.3 + (rnd() - 0.5) * 0.002
      pts.push([+lon.toFixed(5), +lat.toFixed(5)])
    }
    features.push({
      type: 'Feature',
      properties: { color: colors[Math.floor(rnd() * colors.length)], lift: false },
      geometry: { type: 'LineString', coordinates: pts }
    })
  }
  return { type: 'FeatureCollection', features }
}

async function loadPistes(d: Domain, cache: PisteCache): Promise<GeoJSON.FeatureCollection> {
  const key = `p${d.id}`
  if (cache[key]) return cache[key]

  const r = 0.055
  const bbox = [d.lat - r * 0.7, d.lon - r, d.lat + r * 0.7, d.lon + r].map((v) => v.toFixed(4)).join(',')
  const query =
    `[out:json][timeout:25];(way["piste:type"="downhill"](${bbox});way["aerialway"](${bbox}););out geom;`

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    if (!res.ok) throw new Error(`overpass ${res.status}`)
    const json = (await res.json()) as { elements?: OverpassElement[] }
    const features: GeoJSON.Feature[] = (json.elements ?? [])
      .filter((e) => e.geometry && e.geometry.length > 1)
      .map((e) => {
        const tags = e.tags ?? {}
        const lift = Boolean(tags.aerialway)
        return {
          type: 'Feature' as const,
          properties: {
            lift,
            color: lift ? '#6b7280' : (PISTE_COLORS[tags['piste:difficulty']] ?? '#2a78d6'),
            name: tags.name ?? ''
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: e.geometry!.map((p) => [p.lon, p.lat])
          }
        }
      })
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
    cache[key] = fc
    try {
      localStorage.setItem(PISTE_KEY, JSON.stringify(cache))
    } catch {
      /* cache plein : on recalculera à la prochaine bascule */
    }
    return fc
  } catch {
    const fc = syntheticPistes(d)
    cache[key] = fc
    return fc
  }
}

/** Paliers affichés, en minutes : 2 h, 4 h et 6 h de route. */
const ISO_RANGES = [120, 240, 360]

export function DomainMap(): JSX.Element {
  const { state, patch, domains } = useApp()
  const { t } = useI18n()
  const { matchesFilters, hh } = useDerived()

  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const pisteCache = useRef<PisteCache>(readPisteCache())
  const is3D = useRef(false)
  const pisteShown = useRef<number | null>(null)
  const signatures = useRef<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const [iso, setIso] = useState<GeoJSON.FeatureCollection | null>(null)
  const [isoError, setIsoError] = useState<string | null>(null)

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
      style: STYLE,
      center: [6.5, 45.4],
      zoom: 6,
      attributionControl: false,
      maxPitch: 60
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new maplibregl.AttributionControl({ compact: true }))
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }))
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
      m.addSource('pistes', { type: 'geojson', data: EMPTY })
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
        layout: { visibility: 'visible' },
        paint: { 'hillshade-exaggeration': 0.28 }
      })
      m.addLayer({
        id: 'pistes',
        type: 'line',
        source: 'pistes',
        filter: ['!=', ['get', 'lift'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 2.6, 'line-opacity': 0.95 }
      })
      m.addLayer({
        id: 'lifts',
        type: 'line',
        source: 'pistes',
        filter: ['==', ['get', 'lift'], true],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.6,
          'line-dasharray': [2, 1.6],
          'line-opacity': 0.95
        }
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
          'circle-radius': ['case', ['==', ['get', 'selected'], true], 12, ['==', ['get', 'match'], false], 5.5, 9],
          'circle-stroke-width': ['case', ['==', ['get', 'selected'], true], 3.5, 2.5],
          'circle-stroke-color': ['case', ['==', ['get', 'selected'], true], '#e0533f', '#ffffff']
        }
      })
      m.addLayer({
        id: 'point-labels',
        type: 'symbol',
        source: 'domains',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'match'], true]],
        layout: {
          'text-field': ['get', 'name'],
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

      setLoaded(true)

      const bounds = new maplibregl.LngLatBounds()
      const placed = domains.filter(hasCoords)
      for (const d of placed) bounds.extend([d.lon, d.lat])
      const home = hh.find((o) => o.lat != null && o.lon != null)
      if (home) bounds.extend([home.lon!, home.lat!])
      if (placed.length > 0) m.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 0 })
    })

    map.current = m
    return () => {
      m.remove()
      map.current = null
      setLoaded(false)
    }
    // Une seule initialisation : les mises à jour passent par les effets de
    // synchronisation ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const features: GeoJSON.Feature[] = domains.filter(hasCoords).map((d) => ({
      type: 'Feature',
      id: d.id,
      geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
      properties: {
        id: d.id,
        name: d.name,
        altitude_min_m: d.min,
        match: matchesFilters(d),
        selected: d.id === state.selectedId
      }
    }))
    pushData(map.current.getSource('domains') as GeoJSONSource, 'domains', {
      type: 'FeatureCollection',
      features
    })
  }, [domains, matchesFilters, state.selectedId, loaded])

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
      const id = `bm-${b.key}`
      if (m.getLayer(id)) {
        m.setLayoutProperty(id, 'visibility', !bare && b.key === state.basemap ? 'visible' : 'none')
      }
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
  }, [state.basemap, state.relief, state.threeD, loaded])

  // --- Relief et pistes ----------------------------------------------------
  useEffect(() => {
    const m = map.current
    if (!loaded || !m || !m.getSource('dem')) return
    const want = state.threeD
    const d = domains.find((x) => x.id === state.selectedId) ?? domains[0]
    if (!d) return

    // La visibilité de l'ombrage appartient à l'effet « fond de carte » : deux
    // effets qui écrivent la même propriété se défont l'un l'autre selon
    // l'ordre de rendu, et le relief clignotait au passage en 3D.
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

    const source = m.getSource('pistes') as GeoJSONSource | undefined
    if (!source) return
    if (!want) {
      pisteShown.current = null
      pushData(source, 'pistes', EMPTY)
      return
    }
    if (pisteShown.current === d.id) return
    pisteShown.current = d.id
    void loadPistes(d, pisteCache.current).then((fc) => {
      if (!map.current || pisteShown.current !== d.id) return
      pushData(map.current.getSource('pistes') as GeoJSONSource, 'pistes', fc)
    })
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
        {state.threeD && (
          <div className="map__legend">
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>Pistes du domaine — OpenStreetMap</span>
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
            <span className="map__dot" style={{ background: 'none', border: '2px solid var(--accent)' }} />
            {t('map_clicked_first')}
          </span>
        </div>

        <button
          type="button"
          className="map__btn map__btn--dark"
          onClick={() => patch({ threeD: !state.threeD })}
          title="Relief 3D et tracé des pistes du domaine sélectionné (OpenStreetMap)"
        >
          {state.threeD ? 'Vue 2D' : 'Vue 3D · relief et pistes'}
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
            {t('basemap')} · {BASEMAPS.find((b) => b.key === state.basemap)?.label ?? BASEMAPS[0].label}
          </button>
          {state.baseOpen && (
            <div className="basepicker">
              {BASEMAPS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className={`basepicker__row${state.basemap === b.key ? ' basepicker__row--on' : ''}`}
                  onClick={() => patch({ basemap: b.key, baseOpen: false })}
                >
                  <span className="basepicker__label">{b.label}</span>
                  <span className="basepicker__sub">{b.sub}</span>
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
