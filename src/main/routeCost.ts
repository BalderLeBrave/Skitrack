/**
 * Relevé du coût de route sur ViaMichelin.
 *
 * ## Pourquoi une page et pas une API
 *
 * ViaMichelin ne publie pas d'API ouverte. Ses montants de péage — les seuls
 * qui soient réellement relevés section par section pour le réseau français —
 * ne sont accessibles que par sa page de résultat. Le relevé lit donc cette
 * page, exactement comme `listing.ts` lit une page d'annonce : une requête, à
 * la demande de l'utilisateur, avec le User-Agent de l'application.
 *
 * L'arbitrage a été posé avec ses deux inconvénients — dépendance au HTML d'un
 * tiers, et sortie du cadre que le projet s'était fixé sur les sites tiers — et
 * retenu le 2026-08-29.
 *
 * ## La règle qui ne bouge pas
 *
 * **Un relevé en échec ne produit aucun chiffre.** Ni repli, ni valeur
 * plausible, ni moyenne. `ok: false` avec le motif, et l'écran retombe sur la
 * saisie manuelle ou sur l'estimation forfaitaire, annoncée comme estimation.
 * C'est l'invariant de `providers/types.ts`, et c'est lui qui rend ce module
 * acceptable : au pire il ne rapporte rien.
 *
 * ## Ce qui est lu
 *
 * Le coût de péage, le coût de carburant, la distance et la durée, tels que la
 * page les publie. Rien n'est recalculé ici : si la page ne donne pas le
 * carburant, le champ reste `null` et l'appelant le dit.
 */

import type { RouteCostOutcome, RouteCostQuery } from '@shared/ipc-contract'

const USER_AGENT = 'SkitrackApp/0.1 (+application locale de comparaison de séjours au ski)'
/** Au-delà, la page est considérée injoignable : on ne fait pas attendre. */
const TIMEOUT_MS = 15000

/**
 * URL de la page de résultat.
 *
 * Le formulaire de ViaMichelin accepte des coordonnées en clair dans son
 * chemin de recherche d'itinéraire. On ne fabrique pas d'URL d'exploration :
 * c'est la page que l'utilisateur obtiendrait en saisissant les deux mêmes
 * points, et c'est elle qu'on lui propose d'ouvrir pour vérifier.
 */
export function viaMichelinUrl(q: RouteCostQuery): string {
  const from = `${q.fromLat.toFixed(6)},${q.fromLon.toFixed(6)}`
  const to = `${q.toLat.toFixed(6)},${q.toLon.toFixed(6)}`
  const params = new URLSearchParams({
    departure: from,
    arrival: to,
    vehicle: 'car',
    // ViaMichelin nomme « discover » l'itinéraire économique et « fastest » le
    // plus rapide ; l'évitement de péage est un drapeau distinct.
    itineraryType: 'fastest',
    avoidTolls: q.avoidTolls ? 'true' : 'false'
  })
  if (q.fuelPricePerL != null && q.fuelPricePerL > 0) {
    params.set('fuelPrice', String(q.fuelPricePerL))
  }
  return `https://www.viamichelin.fr/itineraires?${params.toString()}`
}

/**
 * Premier nombre décimal d'une chaîne, en acceptant la virgule.
 *
 * `null` plutôt que `0` : une page qui n'affiche pas le péage et une page qui
 * affiche « 0 € » ne disent pas la même chose, et confondre les deux ferait
 * passer un trajet non relevé pour un trajet gratuit.
 */
function nombre(texte: string | undefined | null): number | null {
  if (!texte) return null
  // Les séparateurs de milliers — espace, insécable, fine — sont retirés avant
  // la lecture : sans cela « 1 234,50 € » rendait 1.
  const m = texte.replace(/[\s  ]/g, '').match(/(\d+(?:[.,]\d+)?)/)
  if (!m) return null
  const v = parseFloat(m[1].replace(',', '.'))
  return Number.isFinite(v) ? v : null
}

/**
 * Extrait les montants d'une page ViaMichelin.
 *
 * Deux chemins, du plus solide au plus fragile. Le bloc de données JSON que la
 * page embarque pour son propre rendu est stable et nommé ; le repli sur le
 * texte visible ne l'est pas, et c'est assumé : il rendra `null` le jour où
 * les libellés changent, ce qui est le comportement voulu — pas un chiffre
 * faux, une absence de chiffre.
 *
 * Exporté pour être testable sans réseau : `npm run routecost:test` lui donne
 * des fragments de page et vérifie qu'une page muette rend bien des `null`.
 */
export function parseRouteCost(html: string): {
  tolls: number | null
  fuel: number | null
  distanceKm: number | null
  durationMin: number | null
} {
  const json = html.match(/"tollCost"\s*:\s*\{[^}]*"value"\s*:\s*(\d+(?:\.\d+)?)/)
  const jsonFuel = html.match(/"fuelCost"\s*:\s*\{[^}]*"value"\s*:\s*(\d+(?:\.\d+)?)/)
  const jsonDist = html.match(/"distance"\s*:\s*\{[^}]*"value"\s*:\s*(\d+(?:\.\d+)?)/)
  const jsonDur = html.match(/"duration"\s*:\s*\{[^}]*"value"\s*:\s*(\d+(?:\.\d+)?)/)

  const texte = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const tollTxt = texte.match(/[Pp][ée]age[s]?\s*:?\s*([\d ,.]+)\s*€/)
  const fuelTxt = texte.match(/[Cc]arburant\s*:?\s*([\d ,.]+)\s*€/)

  const tolls = json ? parseFloat(json[1]) : nombre(tollTxt?.[1])
  const fuel = jsonFuel ? parseFloat(jsonFuel[1]) : nombre(fuelTxt?.[1])
  // La distance du bloc JSON est en mètres, la durée en secondes.
  const distanceKm = jsonDist ? Math.round(parseFloat(jsonDist[1]) / 100) / 10 : null
  const durationMin = jsonDur ? Math.round(parseFloat(jsonDur[1]) / 60) : null

  return {
    tolls: tolls != null && Number.isFinite(tolls) ? Math.round(tolls * 100) / 100 : null,
    fuel: fuel != null && Number.isFinite(fuel) ? Math.round(fuel * 100) / 100 : null,
    distanceKm,
    durationMin
  }
}

export async function fetchRouteCost(q: RouteCostQuery): Promise<RouteCostOutcome> {
  const url = viaMichelinUrl(q)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }
    })
    if (!res.ok) return { ok: false, error: `ViaMichelin ${res.status}`, url }
    const html = await res.text()
    const parsed = parseRouteCost(html)
    // Une page lue mais muette n'est pas un succès : rendre `ok: true` avec
    // quatre `null` laisserait l'écran afficher « relevé » sur du vide.
    if (parsed.tolls == null && parsed.fuel == null) {
      return { ok: false, error: 'page lue, aucun coût publié', url }
    }
    return { ok: true, ...parsed, at: Date.now(), url }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { ok: false, error: reason, url }
  } finally {
    clearTimeout(timer)
  }
}
