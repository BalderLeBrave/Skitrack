import { useEffect, useRef, useState } from 'react'
import maplibregl, { type StyleSpecification } from 'maplibre-gl'
import { lodgingCoords } from '@/data/lodgingGeo'
import type { Domain } from '@/data/referentiel'
import { useFormat } from '@/hooks/useFormat'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useI18n } from '@/i18n'

/**
 * Carte des logements du domaine, marqueurs au prix tout compris.
 *
 * Les coordonnées exactes des biens ne sont pas publiées par les sources — la
 * plupart ne donnent qu'un cercle d'approximation. Les positions sont donc
 * dérivées de façon déterministe autour du centre du domaine : la carte sert à
 * lire la dispersion des prix, pas à retrouver une adresse.
 */

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    opentopomap: {
      type: 'raster',
      tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      /*
       * 17, le niveau le plus profond publié par OpenTopoMap.
       *
       * Il était à 15 : au-delà, MapLibre n'a plus de tuile à demander et
       * **étire** celles du niveau 15. D'où une carte franchement pixelisée
       * dès qu'on zoomait, alors que les tuiles nettes existaient.
       */
      maxzoom: 17,
      attribution:
        '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> · ' +
        '<a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
    }
  },
  layers: [{ id: 'basemap', type: 'raster', source: 'opentopomap' }]
}

export function LodgingMap({ domain }: { domain: Domain }): JSX.Element {
  const { t } = useI18n()
  const { fmt } = useFormat()
  const { state, patch } = useApp()
  const { lodgList } = useDerived()
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!container.current || map.current) return
    const m = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: [domain.lon, domain.lat],
      zoom: 13.2,
      /*
       * Le zoom s'arrête là où l'imagerie s'arrête.
       *
       * Sans ce plafond, MapLibre laisse aller jusqu'à 22 et rend de la bouillie
       * étirée depuis le niveau 17. Offrir un zoom dont l'image n'existe pas
       * n'apporte rien — d'autant que les positions des logements sont
       * approchées, comme l'explique l'en-tête de ce fichier : à ce niveau de
       * détail, la carte dirait une précision qu'elle n'a pas.
       */
      maxZoom: 17,
      attributionControl: false
    })
    m.on('error', (e) => {
      if (e?.error && !/tile/i.test(String(e.error))) console.warn('[map]', e.error.message ?? e.error)
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new maplibregl.AttributionControl({ compact: true }))
    m.on('load', () => setLoaded(true))
    map.current = m
    return () => {
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
    map.current.easeTo({ center: [domain.lon, domain.lat], zoom: 13.2, duration: 600 })
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
    if (!loaded || !map.current) return
    for (const mk of markers.current) mk.remove()
    markers.current = lodgList.map((lg) => {
      const el = document.createElement('button')
      // L'épingle élue reste distinguée sur la carte, comme celle dont la fiche
      // est ouverte : sinon rien ne dirait laquelle vient d'être remontée.
      const selected = lg.id === state.ficheId || lg.id === state.lodgPickId
      el.type = 'button'
      el.className = `pricepin${selected ? ' pricepin--on' : ''}`
      el.textContent = `${fmt(lg.total)} €`
      // Cliquer une bulle **met en avant**, cela n'ouvre pas la fiche : ce sont
      // deux gestes, et les confondre empêchait de se servir de la carte pour
      // situer une offre dans la liste.
      el.addEventListener('click', () =>
        patch({ lodgPickId: state.lodgPickId === lg.id ? null : lg.id })
      )
      // Même calcul que le panneau « Positions » : deux dispersions
      // différentes placeraient l'épingle ailleurs que le point vérifié, et le
      // diagnostic parlerait d'un endroit que la carte ne montre pas.
      return new maplibregl.Marker({ element: el })
        .setLngLat(lodgingCoords(domain, lg))
        .addTo(map.current!)
    })
  }, [lodgList, domain, state.ficheId, state.lodgPickId, loaded, patch])

  return (
    <div className="lodgmap">
      <div ref={container} className="map__canvas" />
      <div className="lodgmap__hint">
        <span>{t('lodgmap_hint')}</span>
      </div>
      <label className="lodgmap__sync">
        <input
          type="checkbox"
          checked={state.lodgMapSync}
          onChange={(e) => patch({ lodgMapSync: e.target.checked })}
        />
        {t('map_search_on_move')}
      </label>
    </div>
  )
}
