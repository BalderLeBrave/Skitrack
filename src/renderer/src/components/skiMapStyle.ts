/**
 * Style MapLibre commun — fonds raster libres + overlay pistes.
 * Aucune tuile MapTiler / Thunderforest / Mapbox.
 */

import type { StyleSpecification } from 'maplibre-gl'
import { BASEMAPS, DEFAULT_BASEMAP, PISTE_OVERLAY, resolvedBasemap, type BasemapKey } from './basemap'

export function skiMapStyle(
  active: BasemapKey = DEFAULT_BASEMAP,
  pistes = true
): StyleSpecification {
  const current = resolvedBasemap(active)
  const sources: StyleSpecification['sources'] = {}
  for (const b of BASEMAPS) {
    sources[`bm-${b.key}`] = {
      type: 'raster',
      tiles: [...b.tiles],
      tileSize: 256,
      maxzoom: b.maxzoom,
      attribution: b.attribution
    }
  }
  sources['ov-pistes'] = {
    type: 'raster',
    tiles: [...PISTE_OVERLAY.tiles],
    tileSize: 256,
    maxzoom: PISTE_OVERLAY.maxzoom,
    attribution: PISTE_OVERLAY.attribution
  }

  const layers: StyleSpecification['layers'] = [
    { id: 'bg', type: 'background', paint: { 'background-color': '#dce6ee' } },
    ...BASEMAPS.map((b) => ({
      id: `bm-${b.key}`,
      type: 'raster' as const,
      source: `bm-${b.key}`,
      layout: { visibility: (b.key === current ? 'visible' : 'none') as 'visible' | 'none' }
    })),
    {
      id: 'ov-pistes',
      type: 'raster',
      source: 'ov-pistes',
      layout: { visibility: pistes ? 'visible' : 'none' },
      paint: { 'raster-opacity': 0.95 }
    }
  ]

  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources,
    layers
  }
}
