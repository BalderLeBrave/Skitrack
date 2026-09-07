/**
 * Bulletin d'estimation du risque d'avalanche (BRA), API Météo-France.
 *
 * L'appel se fait ici et non dans le renderer pour deux raisons : la clé d'API
 * ne doit jamais traverser le pont de préchargement, et la CSP du renderer
 * reste fermée sur `connect-src` — ouvrir un hôte de plus pour une seule
 * requête coûterait plus qu'il ne rapporte.
 *
 * L'API ne répond en XML que sur `format=xml` : `format=json` renvoie
 * « no matching blob ». On lit donc le XML, avec un extracteur volontairement
 * tolérant — Météo-France a déjà fait évoluer l'imbrication du cartouche de
 * risque, et une lecture par chemin strict casserait à la première révision.
 *
 * Hors saison, la réponse est un simple `<message>` : « la saison est terminée
 * sur le massif … ». Ce n'est pas un risque nul, c'est une absence de
 * bulletin, et l'appelant doit pouvoir faire la différence.
 */

import type { BraBulletin } from '@shared/ipc-contract'
import { decryptAll } from './secrets'

const ENDPOINT = 'https://public-api.meteofrance.fr/public/DPBRA/v1/massif/BRA'
const TIMEOUT_MS = 15000
/** Un bulletin est émis une à deux fois par jour : trente minutes suffisent. */
const TTL_MS = 30 * 60 * 1000

const cache = new Map<number, { at: number; value: BraBulletin }>()

function empty(massifCode: number, patch: Partial<BraBulletin>): BraBulletin {
  return {
    ok: false,
    massifCode,
    risk: null,
    risk1: null,
    risk2: null,
    loc1: null,
    loc2: null,
    altitude: null,
    issuedAt: null,
    message: null,
    error: null,
    ...patch
  }
}

/**
 * Première valeur d'un attribut, cherchée partout dans le document.
 *
 * Le nom doit être précédé d'un blanc ou d'un chevron : sans cette ancre,
 * `RISQUE1` se retrouverait dans `EVOLURISQUE1`, dont la valeur est un code
 * d'évolution (0, 1, 2) — c'est-à-dire un faux niveau de risque parfaitement
 * plausible.
 */
function attr(xml: string, name: string): string | null {
  const m = new RegExp(`[\\s<]${name}\\s*=\\s*"([^"]*)"`, 'i').exec(xml)
  return m && m[1] !== '' ? m[1] : null
}

function level(value: string | null): number | null {
  if (value == null) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null
}

/** Contenu d'un `<message>` de fin de saison, le cas échéant. */
function seasonMessage(xml: string): string | null {
  const m = /<message>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/message>/i.exec(xml)
  return m ? m[1].trim() : null
}

function parseBulletin(massifCode: number, xml: string): BraBulletin {
  const closed = seasonMessage(xml)
  if (closed) return empty(massifCode, { ok: true, message: closed })

  // `CARTOUCHERISQUE/RISQUE` porte jusqu'à deux niveaux, chacun avec sa
  // localisation (`LOC1`, `LOC2`) de part et d'autre de `ALTITUDE`, et le
  // maximum retenu pour le massif dans `RISQUEMAXI`. Les libellés de
  // localisation viennent du bulletin : ils ne sont pas réinventés ici, la
  // convention « 1 = en dessous » n'est pas garantie d'un massif à l'autre.
  const risk1 = level(attr(xml, 'RISQUE1'))
  const risk2 = level(attr(xml, 'RISQUE2'))
  const maxi = level(attr(xml, 'RISQUEMAXI'))
  const risk = maxi ?? (risk1 != null || risk2 != null ? Math.max(risk1 ?? 0, risk2 ?? 0) : null)

  const alt = attr(xml, 'ALTITUDE')
  const altitude = alt == null ? null : Number.parseInt(alt.replace(/\D+/g, ''), 10) || null

  if (risk == null) {
    return empty(massifCode, {
      ok: false,
      error: 'Bulletin illisible : aucun niveau de risque trouvé dans la réponse.'
    })
  }

  return {
    ok: true,
    massifCode,
    risk,
    risk1,
    risk2,
    loc1: attr(xml, 'LOC1'),
    loc2: attr(xml, 'LOC2'),
    altitude,
    issuedAt: attr(xml, 'DATEBULLETIN') ?? attr(xml, 'DATEVALIDITE'),
    message: null,
    error: null
  }
}

/**
 * Lit le bulletin d'un massif Météo-France.
 *
 * Jamais d'exception vers le renderer : une clé absente, un quota dépassé ou
 * une API muette se traduisent par un `error` lisible, sur lequel la fiche
 * bascule vers la saisie manuelle.
 */
export async function fetchBra(massifCode: number, force = false): Promise<BraBulletin> {
  if (!Number.isInteger(massifCode) || massifCode <= 0) {
    return empty(massifCode, { error: 'Massif inconnu.' })
  }

  const hit = cache.get(massifCode)
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.value

  const key = decryptAll().meteofrance
  if (!key) {
    return empty(massifCode, {
      error: 'Aucune clé Météo-France enregistrée — Réglages → Application → Clés d’API.'
    })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const url = `${ENDPOINT}?id-massif=${massifCode}&format=xml`
    const res = await fetch(url, {
      headers: { apikey: key, accept: 'application/xml' },
      signal: controller.signal
    })
    const body = await res.text()
    if (!res.ok) {
      // Le portail répond en JSON sur erreur, en XML sur succès.
      const detail = /"(?:description|detail|message)"\s*:\s*"([^"]+)"/.exec(body)?.[1]
      return empty(massifCode, { error: detail ?? `Météo-France a répondu ${res.status}.` })
    }
    const value = parseBulletin(massifCode, body)
    cache.set(massifCode, { at: Date.now(), value })
    return value
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError' ? 'délai dépassé' : String(err)
    return empty(massifCode, { error: `Bulletin injoignable — ${reason}.` })
  } finally {
    clearTimeout(timer)
  }
}
