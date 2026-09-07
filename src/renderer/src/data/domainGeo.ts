/**
 * Résolution des positions manquantes du référentiel.
 *
 * Une partie des domaines livrés n'a pas de coordonnées : ils sortent alors de
 * la carte, du tri par distance, du relevé météo et du calcul d'itinéraires.
 * Plutôt que de les laisser amputés, on les géocode une fois, par leur nom,
 * puis on garde le résultat.
 *
 * Deux vérifications rendent l'opération sûre, et la seconde est la seule qui
 * compte vraiment. L'emprise du massif écarte les homonymes lointains, mais
 * elle est large — « Alpes du Nord » couvre deux cents kilomètres, et un
 * géocodeur qui répond « Val d'Isère » au fond de la vallée de l'Isère y passe
 * sans difficulté. C'est l'**altitude** qui tranche : une station dont le front
 * de neige est à 1 850 m ne peut pas se trouver sur un point à 300 m. Le
 * candidat est donc confronté au modèle d'élévation, et rejeté s'il dément
 * l'altitude annoncée.
 *
 * Sans ce second contrôle, la résolution plaçait Val d'Isère à quarante-cinq
 * kilomètres de Val d'Isère et Méribel-Mottaret du côté de Sallanches — une
 * coordonnée fausse étant bien pire qu'une coordonnée absente : elle fait
 * apparaître le domaine sur la carte, au mauvais endroit, avec l'aplomb d'une
 * mesure.
 *
 * Un échec est mémorisé au même titre qu'un succès : sans cela, chaque
 * démarrage relancerait les mêmes requêtes vouées à ne rien donner.
 */

import { api, isClientReady } from '@/api/client'
import type { Domain, Referential } from './referentiel'
import { coordOk, hasCoords } from './referentiel'

const CACHE_KEY = 'skitrack-v3-domgeo'

/** `null` = déjà tenté, sans résultat exploitable. */
export type DomainGeoCache = Record<string, { lat: number; lon: number } | null>

function norm(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** Clé de cache : le nom seul est ambigu, le massif le désambiguïse. */
export function geoKeyOf(d: Pick<Domain, 'name' | 'region' | 'massif'>): string {
  return `${norm(d.name)}|${norm(d.region ?? '')}|${norm(d.massif ?? '')}`
}

export function readGeoCache(): DomainGeoCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as DomainGeoCache) : {}
  } catch {
    return {}
  }
}

function writeGeoCache(cache: DomainGeoCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* quota dépassé : la résolution vaut pour la session */
  }
}

/**
 * Requêtes successives pour un domaine, de la plus précise à la plus large.
 *
 * Les noms du référentiel accolent souvent deux stations d'un même domaine
 * (« Barèges – La Mongie ») ou ajoutent une altitude (« Les Deux Alpes 1800 ») ;
 * aucun géocodeur ne reconnaît ces formes. On retombe donc sur le premier
 * segment, puis sur le nom nettoyé de ses chiffres.
 *
 * Le suffixe « France » n'est pas décoratif : le moteur route vers la Base
 * Adresse Nationale quand la requête en porte la mention, et la BAN répond
 * mieux et plus vite que Nominatim sur des communes françaises.
 */
function queriesFor(d: Domain): string[] {
  const parts = d.name
    .split(/[–—/(]|\s-\s/)
    .map((p) => p.trim())
    .filter(Boolean)
  const first = parts[0] ?? d.name
  const last = parts.length > 1 ? parts[parts.length - 1] : null
  const strip = (s: string): string => s.replace(/\d+/g, '').trim()
  const region = d.region ? `, ${d.region}` : ''

  // Le dernier segment compte autant que le premier : dans « Serre Chevalier
  // – Chantemerle 1350 », c'est lui qui porte le nom de commune, le premier
  // désignant le domaine relié, que nul géocodeur ne connaît.
  const out = [
    `${first}${region}, France`,
    last ? `${strip(last)}${region}, France` : null,
    `${first}, France`,
    last ? `${strip(last)}, France` : null,
    strip(first) !== first ? `${strip(first)}, France` : null
    // Un segment réduit à des chiffres ne laisse rien à chercher.
  ].filter((q): q is string => q != null && strip(q) !== ', France')

  // Dédoublonnage : deux requêtes identiques coûteraient deux appels réseau.
  return [...new Set(out)]
}

export interface GeoProgress {
  done: number
  total: number
}

/**
 * Écart d'altitude toléré entre le point géocodé et le front de neige.
 *
 * Un géocodeur vise le centre de la commune, souvent plus bas que le départ
 * des pistes : la marge doit être généreuse vers le bas. Vers le haut elle
 * peut être serrée — aucune commune n'est au-dessus de son domaine.
 */
const ALT_TOLERANCE_BELOW = 900
const ALT_TOLERANCE_ABOVE = 400
/** Points d'altitude par requête Open-Meteo. */
const ELEVATION_BATCH = 100

/** Altitude de référence de la station : le front de neige, à défaut le bas. */
function resortAltitude(d: Domain): number {
  return d.village != null && d.village > 0 ? d.village : d.min
}

/**
 * Altitudes du modèle d'élévation pour une liste de points.
 *
 * Renvoie `null` par point quand le service ne répond pas : l'appelant traite
 * alors l'altitude comme inconnue et refuse le candidat, plutôt que de
 * l'accepter faute de contradiction.
 */
async function elevationsOf(points: { lat: number; lon: number }[]): Promise<(number | null)[]> {
  const out: (number | null)[] = new Array(points.length).fill(null)
  for (let i = 0; i < points.length; i += ELEVATION_BATCH) {
    const batch = points.slice(i, i + ELEVATION_BATCH)
    try {
      const lat = batch.map((p) => p.lat.toFixed(5)).join(',')
      const lon = batch.map((p) => p.lon.toFixed(5)).join(',')
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`)
      if (!res.ok) continue
      const json = (await res.json()) as { elevation?: (number | null)[] }
      const values = json.elevation ?? []
      batch.forEach((_, n) => {
        const v = values[n]
        if (v != null) out[i + n] = Math.round(v)
      })
    } catch {
      /* lot en échec : ces points restent sans altitude, donc refusés */
    }
  }
  return out
}

/** L'altitude du point est-elle compatible avec celle annoncée du domaine ? */
export function altitudePlausible(elevation: number | null, d: Domain): boolean {
  if (elevation == null) return false
  const ref = resortAltitude(d)
  if (!ref) return true
  return elevation >= ref - ALT_TOLERANCE_BELOW && elevation <= ref + ALT_TOLERANCE_ABOVE
}

/**
 * Complète les positions manquantes. Renvoie le cache mis à jour.
 *
 * Les domaines déjà placés ne sont pas touchés : le référentiel fait foi
 * quand il sait, le géocodage ne comble que ses trous.
 */
export async function resolveMissingCoords(
  domains: Domain[],
  ref: Referential,
  onProgress: (p: GeoProgress) => void,
  shouldStop: () => boolean = () => false
): Promise<DomainGeoCache> {
  const cache = readGeoCache()
  if (!isClientReady()) return cache

  // Un seul essai par clé, même si plusieurs domaines la partagent.
  const todo = new Map<string, Domain>()
  for (const d of domains) {
    if (hasCoords(d)) continue
    const key = geoKeyOf(d)
    if (key in cache || todo.has(key)) continue
    todo.set(key, d)
  }
  if (todo.size === 0) return cache

  let done = 0
  const total = todo.size
  onProgress({ done, total })

  // Premier temps : rassembler les candidats plausibles par le nom et le
  // massif. Plusieurs par domaine — le meilleur se décidera à l'altitude.
  const candidates = new Map<string, { d: Domain; hits: { lat: number; lon: number }[] }>()
  for (const [key, d] of todo) {
    if (shouldStop()) break
    const hits: { lat: number; lon: number }[] = []
    let answered = false
    for (const q of queriesFor(d)) {
      try {
        const found = await api.geocode(q, 3)
        answered = true
        for (const h of found) {
          if (!coordOk({ lat: h.lat, lon: h.lon, massif: d.massif }, ref)) continue
          if (!hits.some((x) => x.lat === h.lat && x.lon === h.lon)) hits.push({ lat: h.lat, lon: h.lon })
        }
      } catch {
        /* moteur indisponible ou requête refusée : on tente la suivante */
      }
    }
    // Un domaine dont aucune requête n'a abouti n'est pas « introuvable » : le
    // moteur s'est tu. L'inscrire comme échec le condamnerait définitivement,
    // alors qu'il suffit de réessayer au prochain démarrage.
    if (answered) candidates.set(key, { d, hits })
    done++
    onProgress({ done, total })
  }

  // Second temps : confronter tous les candidats au modèle d'élévation en une
  // poignée de requêtes groupées, plutôt qu'une par point.
  const flat: { key: string; lat: number; lon: number }[] = []
  for (const [key, { hits }] of candidates) for (const h of hits) flat.push({ key, ...h })
  const elevations = await elevationsOf(flat)

  const byKey = new Map<string, { lat: number; lon: number; alt: number | null }[]>()
  flat.forEach((p, i) => {
    const list = byKey.get(p.key) ?? []
    list.push({ lat: p.lat, lon: p.lon, alt: elevations[i] })
    byKey.set(p.key, list)
  })

  for (const [key, { d }] of candidates) {
    const scored = byKey.get(key) ?? []
    // Parmi les candidats compatibles, celui dont l'altitude colle le mieux au
    // front de neige : sur une même vallée, c'est celui qui est dans la station
    // plutôt que dans le village en contrebas.
    const ref0 = resortAltitude(d)
    const best = scored
      .filter((c) => altitudePlausible(c.alt, d))
      .sort((a, b) => Math.abs((a.alt ?? 0) - ref0) - Math.abs((b.alt ?? 0) - ref0))[0]
    cache[key] = best ? { lat: best.lat, lon: best.lon } : null
  }

  writeGeoCache(cache)
  return cache
}

/** Reporte les positions résolues sur la liste des domaines. */
export function applyResolvedCoords(domains: Domain[], cache: DomainGeoCache): Domain[] {
  return domains.map((d) => {
    if (hasCoords(d)) return d
    const hit = cache[geoKeyOf(d)]
    return hit ? { ...d, lat: hit.lat, lon: hit.lon } : d
  })
}

/** Vide le cache : sert au bouton de réinitialisation des données locales. */
export function clearGeoCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* sans effet */
  }
}
