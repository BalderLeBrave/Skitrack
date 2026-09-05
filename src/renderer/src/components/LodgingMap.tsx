import { lodgingCoords } from '@/data/lodgingGeo'
import { priceShown } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { BASEMAPS, resolvedBasemap } from './basemap'
import { skiMapStyle } from './skiMapStyle'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'

/**
 * Carte des logements du domaine, marqueurs au prix tout compris.
 *
 * Les coordonnées exactes des biens ne sont pas publiées par les sources — la
 * plupart ne donnent qu'un cercle d'approximation. Les positions sont donc
 * dérivées de façon déterministe autour du centre du domaine : la carte sert à
 * lire la dispersion des prix, pas à retrouver une adresse.
 *
 * Fond et pistes : mêmes tuiles libres que la carte des domaines (OpenTopoMap +
 * OpenSnowMap), sans clé.
 */

export function LodgingMap({ domain }: { domain: Domain }): JSX.Element {
  const { t } = useI18n()
  const { fmt } = useFormat()
  const { state, patch } = useApp()
  const { lodgList } = useDerived()
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const is3D = useRef(false)
  const [loaded, setLoaded] = useState(false)
  const active = resolvedBasemap(state.basemap)

  useEffect(() => {
    if (!container.current || map.current) return
    const m = new maplibregl.Map({
      container: container.current,
      style: skiMapStyle(state.basemap, state.pisteOverlay),
      center: [domain.lon, domain.lat],
      zoom: 13.2,
      maxZoom: 17,
      maxPitch: 60,
      attributionControl: false
    })
    m.on('error', (e) => {
      if (e?.error && !/tile/i.test(String(e.error))) console.warn('[map]', e.error.message ?? e.error)
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new maplibregl.AttributionControl({ compact: true }))
    m.on('load', () => {
      m.addSource('dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 14
      })
      setLoaded(true)
      m.resize()
    })
    map.current = m
    const host = container.current
    const ro = host
      ? new ResizeObserver(() => {
          m.resize()
        })
      : null
    if (host && ro) ro.observe(host)
    return () => {
      ro?.disconnect()
      m.remove()
      map.current = null
      setLoaded(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recentrage quand on change de domaine sans quitter l'écran. Le cadrage
  // précédent ne vaut plus rien pour une autre station : on le remet à zéro,
  // sinon la liste resterait filtrée sur une vallée qu'on a quittée.
  useEffect(() => {
    if (!loaded || !map.current) return
    patch({ lodgBounds: null })
    map.current.easeTo({
      center: [domain.lon, domain.lat],
      zoom: state.threeD ? 13.4 : 13.2,
      pitch: state.threeD ? 54 : 0,
      duration: 600
    })
    // `patch` est stable ; l'inclure relancerait le recentrage à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain.id, domain.lat, domain.lon, loaded])

  /**
   * Publication du cadrage, pour restreindre la liste à ce qu'on regarde.
   *
   * Uniquement à la fin d'un déplacement : pousser les bornes à chaque image
   * d'une animation refiltrerait la liste soixante fois par seconde. Quand la
   * synchronisation est coupée, les bornes sont effacées plutôt que figées —
   * une liste restreinte par un cadrage qu'on ne suit plus serait un filtre
   * fantôme.
   */
  useEffect(() => {
    const m = map.current
    if (!loaded || !m) return
    if (!state.lodgMapSync) {
      patch({ lodgBounds: null })
      return
    }
    const push = (): void => {
      const b = m.getBounds()
      patch({ lodgBounds: { w: b.getWest(), e: b.getEast(), s: b.getSouth(), n: b.getNorth() } })
    }
    push()
    m.on('moveend', push)
    return () => {
      m.off('moveend', push)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, state.lodgMapSync])

  useEffect(() => {
    const m = map.current
    if (!loaded || !m) return
    const bare = state.threeD && state.relief === 'ombre'
    for (const b of BASEMAPS) {
      const on = !bare && b.key === active ? 'visible' : 'none'
      if (m.getLayer(`bm-${b.key}`)) m.setLayoutProperty(`bm-${b.key}`, 'visibility', on)
    }
    if (m.getLayer('ov-pistes')) {
      m.setLayoutProperty('ov-pistes', 'visibility', state.pisteOverlay ? 'visible' : 'none')
    }
  }, [active, state.pisteOverlay, state.relief, state.threeD, loaded])

  useEffect(() => {
    const m = map.current
    if (!loaded || !m || !m.getSource('dem')) return
    const want = state.threeD
    if (want && !is3D.current) {
      is3D.current = true
      m.setTerrain({ source: 'dem', exaggeration: 1.15 })
      m.easeTo({ center: [domain.lon, domain.lat], zoom: 13.4, pitch: 54, bearing: -18, duration: 1100 })
    } else if (!want && is3D.current) {
      is3D.current = false
      m.setTerrain(null)
      m.easeTo({ pitch: 0, bearing: 0, duration: 700 })
    }
  }, [state.threeD, domain.lat, domain.lon, loaded])

  useEffect(() => {
    if (!loaded || !map.current) return
    for (const mk of markers.current) mk.remove()
    markers.current = lodgList.flatMap((lg) => {
      const coords = lodgingCoords(domain, lg)
      if (!coords) return []
      const el = document.createElement('button')
      // L'épingle élue reste distinguée sur la carte, comme celle dont la fiche
      // est ouverte : sinon rien ne dirait laquelle vient d'être remontée.
      const selected = lg.id === state.ficheId || lg.id === state.lodgPickId
      /*
       * Sans GPS publié : pas d'épingle. L'ancienne dispersion autour du
       * centroïde du domaine se lisait comme une mesure.
       */
      const positionEstimee = false
      el.type = 'button'
      el.className = `pricepin${selected ? ' pricepin--on' : ''}${positionEstimee ? ' pricepin--approx' : ''}`
      el.title = positionEstimee
        ? t('pin_position_estimated')
        : lg.locPrecision === 'approximate'
          ? t('pin_position_approx')
          : ''
      const shown = priceShown(lg)
      const pin =
        shown.unit === 'night'
          ? `${shown.amount} €/n`
          : shown.unit === 'week'
            ? `${shown.amount} €/sem`
            : `${fmt(shown.amount)} €`
      el.textContent = `${positionEstimee ? '≈ ' : ''}${pin}`
      // Cliquer une bulle **met en avant**, cela n'ouvre pas la fiche : ce sont
      // deux gestes, et les confondre empêchait de se servir de la carte pour
      // situer une offre dans la liste.
      el.addEventListener('click', () => patch({ lodgPickId: state.lodgPickId === lg.id ? null : lg.id }))
      // Même calcul que le panneau « Positions » : deux dispersions
      // différentes placeraient l'épingle ailleurs que le point vérifié, et le
      // diagnostic parlerait d'un endroit que la carte ne montre pas.
      return [new maplibregl.Marker({ element: el }).setLngLat(coords).addTo(map.current!)]
    })
  }, [lodgList, domain, state.ficheId, state.lodgPickId, loaded, patch, fmt, t])

  return (
    <div className="lodgmap">
      <div ref={container} className="map__canvas" />
      <div className="lodgmap__hint">
        <span>{t('lodgmap_hint')}</span>
      </div>
      <div className="map__overlay map__overlay--lodg">
        <button
          type="button"
          className="map__btn map__btn--dark"
          onClick={() => patch({ threeD: !state.threeD })}
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
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="map__btn"
            style={{ width: '100%', textAlign: 'left' }}
            onClick={() => patch({ baseOpen: !state.baseOpen })}
            aria-expanded={state.baseOpen}
          >
            {t('basemap')} · {BASEMAPS.find((b) => b.key === active)?.label ?? BASEMAPS[0].label}
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
                  <span className="basepicker__label">{b.label}</span>
                  <span className="basepicker__sub">{b.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="lodgmap__sync lodgmap__sync--inoverlay">
          <input
            type="checkbox"
            checked={state.lodgMapSync}
            onChange={(e) => patch({ lodgMapSync: e.target.checked })}
          />
          {t('map_search_on_move')}
        </label>
      </div>
    </div>
  )
}
