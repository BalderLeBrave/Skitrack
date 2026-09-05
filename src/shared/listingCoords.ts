/**
 * Coordonnées lues **hors JSON-LD**, sur le HTML de la fiche.
 *
 * Aucune valeur n'est fabriquée : sans porteur, `null`.
 */

export function readCoords(html: string): { lat: number; lon: number } | null {
  const plausible = (lat: number, lon: number): { lat: number; lon: number } | null =>
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
      ? { lat, lon }
      : null

  const atlas = /data-atlas-latlng="(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)"/.exec(html)
  if (atlas) {
    const hit = plausible(Number(atlas[1]), Number(atlas[2]))
    if (hit) return hit
  }

  const mapLat = /b_map_center_latitude\s*=\s*(-?\d+(?:\.\d+)?)/.exec(html)
  const mapLon = /b_map_center_longitude\s*=\s*(-?\d+(?:\.\d+)?)/.exec(html)
  if (mapLat && mapLon) {
    const hit = plausible(Number(mapLat[1]), Number(mapLon[1]))
    if (hit) return hit
  }

  const pair = /"latitude"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"longitude"\s*:\s*(-?\d+(?:\.\d+)?)/.exec(html)
  if (pair) {
    const hit = plausible(Number(pair[1]), Number(pair[2]))
    if (hit) return hit
  }

  return null
}
