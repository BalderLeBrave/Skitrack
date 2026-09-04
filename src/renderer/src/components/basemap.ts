/**
 * Clé du fond de carte, extraite de DomainMap pour ne pas charger MapLibre
 * (WebGL, CSS, tuiles) au simple import de l'état applicatif.
 */
export type BasemapKey = 'ign' | 'ortho' | 'topo' | 'sat' | 'pistes' | 'sobre'

export const DEFAULT_BASEMAP: BasemapKey = 'pistes'
