/**
 * Fonds de carte — tuiles libres, aucune clé d'API.
 *
 * Relief montagneux : OpenTopoMap (CC-BY-SA).
 * Pistes et remontées réelles : OpenSnowMap (CC-BY-SA, overlay sans clé).
 * Pas de MapTiler / Thunderforest / Mapbox : leurs tuiles écrivent
 * « API KEY REQUIRED » en énorme dès que la clé manque.
 *
 * La surcouche de pistes n'est plus un fond parmi d'autres : c'est un calque
 * indépendant, allumé ou éteint depuis le sélecteur de la carte.
 */

export type BasemapKey = 'ign' | 'ortho' | 'topo' | 'sat' | 'pistes' | 'sobre'

export const DEFAULT_BASEMAP: BasemapKey = 'pistes'

export type OverlayDef = {
  tiles: readonly string[]
  maxzoom: number
  attribution: string
}

export type BasemapDef = {
  key: BasemapKey
  label: string
  sub: string
  tiles: readonly string[]
  maxzoom: number
  attribution: string
}

/** Pistes OSM dessinées par OpenSnowMap — overlay transparent, sans clé. */
export const PISTE_OVERLAY: OverlayDef = {
  tiles: ['https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png'],
  maxzoom: 18,
  attribution:
    '© <a href="https://www.opensnowmap.org">OpenSnowMap</a> · ' +
    '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> (CC-BY-SA)'
}

const OPENTOPO = {
  tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'] as const,
  maxzoom: 17,
  attribution:
    '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> · ' +
    '<a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
}

export const BASEMAPS: readonly BasemapDef[] = [
  {
    key: 'pistes',
    label: 'Montagne',
    sub: 'relief, courbes de niveau, sommets — OpenTopoMap, sans clé',
    ...OPENTOPO
  },
  {
    key: 'ign',
    label: 'Plan IGN',
    sub: 'topographie française, hameaux et accès',
    tiles: [
      'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
    ],
    maxzoom: 16,
    attribution: '© <a href="https://www.ign.fr">IGN</a> · Plan IGN v2'
  },
  {
    key: 'ortho',
    label: 'Photo aérienne',
    sub: 'orthophoto IGN — pentes, forêts, barres rocheuses',
    tiles: [
      'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
    ],
    maxzoom: 18,
    attribution: '© <a href="https://www.ign.fr">IGN</a> · BD ORTHO'
  },
  {
    key: 'sat',
    label: 'Satellite',
    sub: 'imagerie mondiale — frontières suisse et italienne',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    maxzoom: 18,
    attribution: '© Esri · Maxar, Earthstar Geographics'
  },
  {
    key: 'sobre',
    label: 'Sobre',
    sub: 'fond clair — les prix et les épingles ressortent',
    tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
    maxzoom: 19,
    attribution:
      '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> · ' +
      '© <a href="https://carto.com/attributions">CARTO</a>'
  }
]

/** Ancien fond « topo » : mêmes tuiles que « Montagne ». */
export function resolvedBasemap(key: string | null | undefined): BasemapKey {
  if (key === 'topo') return 'pistes'
  if (BASEMAPS.some((b) => b.key === key)) return key as BasemapKey
  return DEFAULT_BASEMAP
}

export function overlayOf(_b?: BasemapDef): OverlayDef {
  return PISTE_OVERLAY
}

export function basemapOf(key: string | null | undefined): BasemapDef {
  const resolved = resolvedBasemap(key)
  return BASEMAPS.find((b) => b.key === resolved) ?? BASEMAPS[0]
}
