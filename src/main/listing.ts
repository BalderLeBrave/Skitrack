/**
 * Lecture d'une annonce de logement à partir de son URL.
 *
 * Ce n'est **pas** un scraper, et la distinction est structurante :
 *
 * - une seule page, celle que l'utilisateur a explicitement collée ;
 * - aucun parcours de catalogue, aucune pagination, aucun volume ;
 * - on ne lit que les métadonnées que le site publie *pour être lues par des
 *   machines* — JSON-LD (schema.org) et Open Graph ;
 * - `robots.txt` de l'hôte est demandé à `providers/station/robots.ts`, seul
 *   juge de la règle dans ce dépôt — et permissif depuis le 2026-08-26, donc
 *   cette lecture n'écarte plus rien ;
 * - le User-Agent identifie l'application, il n'imite pas un navigateur ;
 * - aucun contournement : ni proxy, ni résolution de CAPTCHA, ni empreinte
 *   navigateur falsifiée. Si l'hôte refuse, on s'arrête.
 *
 * Les hôtes dont les conditions d'utilisation interdisent tout accès
 * automatisé, même unitaire, sont écartés d'emblée : l'application bascule
 * alors en saisie manuelle assistée. Voir `PROVIDERS.md` et `docs/RISQUES.md`.
 *
 * Cette lecture vit dans le processus principal parce que le renderer est sous
 * une CSP stricte qui lui interdit toute origine distante — et c'est très bien
 * ainsi : le HTML tiers n'est jamais exécuté, seulement analysé comme du texte.
 */

import type { ListingExtract } from '@shared/ipc-contract'
import { allowsPath } from './providers/station/robots'
import { withPage } from './providers/webscrape/shared'
// La liste vit dans `shared/` : l'écran Logements doit en tirer la même
// conclusion que ce lecteur, sans quoi il propose des lectures vouées au refus.
import { FORBIDDEN_LISTING_HOSTS as FORBIDDEN_HOSTS } from '@shared/listingHosts'

/** ASCII strict : un en-tête HTTP est une ByteString, une apostrophe
 *  typographique ou un accent y lève une erreur avant même la requête. */
const USER_AGENT = 'SKITRACK/0.1 (personal application; single listing import on user request)'
const TIMEOUT_MS = 15_000
/** Au-delà, ce n'est pas une page d'annonce : on abandonne plutôt que d'avaler. */
const MAX_BYTES = 3_000_000


function emptyExtract(url: string, site: string, blockedReason: string | null): ListingExtract {
  return {
    ok: blockedReason === null,
    blockedReason,
    url,
    site,
    title: null,
    description: null,
    images: [],
    price: null,
    currency: null,
    lat: null,
    lon: null,
    rooms: null,
    capacity: null,
    address: null,
    missing: ['titre', 'prix', 'chambres', 'capacité', 'position']
  }
}

/**
 * Coordonnées d'une page d'annonce, lues **hors JSON-LD**.
 *
 * Les trois porteurs ci-dessous ont été constatés le 2026-08-30 sur une fiche
 * Booking réelle (`club-du-soleil-valfrejus`), rendue dans un navigateur ; les
 * trois s'accordaient à la sixième décimale. Ils sont essayés dans l'ordre de
 * leur précision : l'attribut porte la valeur complète, la variable JavaScript
 * est arrondie à huit décimales.
 *
 * Aucune valeur n'est fabriquée : sans porteur, la fonction rend `null`, et
 * l'annonce reste sans position — visible, mais sans position.
 */
export function readCoords(html: string): { lat: number; lon: number } | null {
  const plausible = (lat: number, lon: number): { lat: number; lon: number } | null =>
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    // Le point (0, 0) est au large du golfe de Guinée : c'est la marque d'un
    // champ vide sérialisé en nombre, jamais celle d'un logement.
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

/**
 * Rendu de la page dans le navigateur partagé, en dernier recours.
 *
 * Mesuré le 2026-08-30 : une requête `fetch` sur une fiche Booking reçoit un
 * HTTP 202 et 3 962 octets de page anti-robot — sans titre, sans prix, sans
 * coordonnées. La même adresse ouverte dans un navigateur rend la fiche
 * complète. Le repli ne sert donc pas à contourner un refus : il sert à obtenir
 * la page que l'hôte sert à un navigateur, celle que l'utilisateur verrait.
 *
 * Il est volontairement le second choix : la lecture directe reste la voie
 * normale, moins coûteuse et sans navigateur à démarrer.
 */
async function renderHtml(url: string): Promise<string | null> {
  try {
    return await withPage(true, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS * 3 })
      // Les coordonnées de Booking arrivent avec le script de carte, après le
      // DOM initial : sans cette pause, une fiche sur deux revient sans elles.
      await page.waitForTimeout(2_500)
      return await page.content()
    })
  } catch {
    return null
  }
}

function siteOf(host: string): string {
  return host.replace(/^www\./, '')
}

async function get(url: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, {
    signal,
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }
  })
}

/**
 * `robots.txt` de l'hôte — **délégué à `providers/station/robots.ts`**.
 *
 * Cette fonction portait sa propre lecture du fichier : groupes `User-agent`,
 * `Allow`/`Disallow`, correspondance par préfixe. Deux implémentations de la
 * même règle dans un même dépôt, c'est une de trop — elles finissent par
 * diverger, et plus personne ne sait laquelle décide. `robots.ts` fait
 * autorité ; celle-ci l'appelle, et rien d'autre ne lit `robots.txt` ici.
 *
 * Le `fetcher` reste celui de l'import : même User-Agent, même délai
 * d'abandon. C'est cette requête-là qu'il faut pouvoir interrompre, pas une
 * autre.
 *
 * Conséquence à connaître : `robots.ts` étant permissif depuis le 2026-08-26,
 * cette fonction rend toujours `true` et le fichier n'est même plus demandé.
 * L'import par URL ne refuse donc plus une page au nom de `robots.txt`. Le
 * refus des hôtes dont les **CGU** interdisent l'accès automatisé est une autre
 * règle, elle vit plus haut dans `extractListing`, et elle tient toujours.
 */
export async function isAllowedByRobots(target: URL, signal: AbortSignal): Promise<boolean> {
  const verdict = await allowsPath(target.origin, target.pathname + target.search, async (url) => {
    const res = await get(url, signal)
    return { status: res.status, text: res.ok ? await res.text() : '' }
  })
  return verdict.allowed
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function metaContent(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${property}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
    'i'
  )
  const reversed = new RegExp(
    `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${property}["']`,
    'i'
  )
  const m = pattern.exec(html) ?? reversed.exec(html)
  return m ? decodeEntities(m[1]).trim() : null
}

type Json = Record<string, unknown>

/** Aplatit `@graph` et les tableaux : les sites imbriquent de façons variées. */
function flattenJsonLd(node: unknown, out: Json[]): void {
  if (Array.isArray(node)) {
    for (const item of node) flattenJsonLd(item, out)
    return
  }
  if (typeof node !== 'object' || node === null) return
  const obj = node as Json
  out.push(obj)
  if ('@graph' in obj) flattenJsonLd(obj['@graph'], out)
}

function readJsonLd(html: string): Json[] {
  const out: Json[] = []
  const pattern = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = pattern.exec(html)) !== null) {
    try {
      flattenJsonLd(JSON.parse(m[1].trim()), out)
    } catch {
      /* bloc JSON-LD invalide : les sites en publient régulièrement */
    }
  }
  return out
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^\d.,-]/g, '').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function fetchListing(rawUrl: string): Promise<ListingExtract> {
  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return { ...emptyExtract(rawUrl, '—', 'URL invalide.'), ok: false }
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return emptyExtract(rawUrl, '—', 'Seules les adresses http(s) sont acceptées.')
  }

  const host = target.hostname.toLowerCase()
  const site = siteOf(host)

  if (FORBIDDEN_HOSTS.some((h) => host.includes(h))) {
    return emptyExtract(
      rawUrl,
      site,
      `Les conditions d’utilisation de ${site} interdisent l’accès automatisé, même pour une page isolée. ` +
        'Ouvrez l’annonce dans votre navigateur et saisissez les informations à la main — le logement sera traité ' +
        'exactement comme une offre relevée.'
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    if (!(await isAllowedByRobots(target, controller.signal))) {
      return emptyExtract(rawUrl, site, `Le fichier robots.txt de ${site} interdit la lecture de cette page.`)
    }

    /*
     * Deux tentatives, dans cet ordre : la lecture directe, puis le rendu dans
     * le navigateur partagé si elle n'a rien donné d'exploitable.
     *
     * Le critère de bascule est le résultat, pas le code HTTP : Booking répond
     * « 202 » à une lecture directe, ce qui n'est pas une erreur, et sert
     * pourtant une page vide de tout. On juge donc sur ce qu'on a obtenu — un
     * titre, ou une position — plutôt que sur ce que l'hôte prétend.
     */
    let html: string | null = null
    const res = await get(target.toString(), controller.signal).catch(() => null)
    if (res && res.ok) {
      const buffer = await res.arrayBuffer()
      if (buffer.byteLength > MAX_BYTES) {
        return emptyExtract(rawUrl, site, 'Page trop volumineuse pour être analysée.')
      }
      html = new TextDecoder('utf-8').decode(buffer)
    }

    if (html === null || (readJsonLd(html).length === 0 && readCoords(html) === null)) {
      const rendered = await renderHtml(target.toString())
      if (rendered !== null) html = rendered
    }

    if (html === null) {
      return emptyExtract(rawUrl, site, `${site} a répondu ${res ? res.status : 'sans contenu lisible'}.`)
    }

    const pageCoords = readCoords(html)
    const blocks = readJsonLd(html)
    const accommodation =
      blocks.find((b) => {
        const type = b['@type']
        const types = Array.isArray(type) ? type : [type]
        return types.some(
          (t) => typeof t === 'string' && /Accommodation|Lodging|House|Apartment|Hotel|Product|Offer/i.test(t)
        )
      }) ?? blocks[0]

    const offer = (accommodation?.offers ?? {}) as Json
    const offerNode = (Array.isArray(offer) ? (offer[0] as Json) : offer) ?? {}
    const geo = (accommodation?.geo ?? {}) as Json
    const address = accommodation?.address

    const extract: ListingExtract = {
      ok: true,
      blockedReason: null,
      url: target.toString(),
      site,
      title: str(accommodation?.name) ?? metaContent(html, 'og:title') ?? null,
      description: str(accommodation?.description) ?? metaContent(html, 'og:description'),
      images: [metaContent(html, 'og:image')].filter((v): v is string => Boolean(v)),
      price: num(offerNode.price) ?? num(metaContent(html, 'product:price:amount')),
      currency: str(offerNode.priceCurrency) ?? metaContent(html, 'product:price:currency'),
      // Le JSON-LD reste prioritaire : c'est une déclaration de l'hôte. Les
      // porteurs de page prennent le relais quand il n'en publie pas — c'est le
      // cas de Booking, dont aucune fiche n'expose `geo` dans son JSON-LD.
      lat: num(geo.latitude) ?? pageCoords?.lat ?? null,
      lon: num(geo.longitude) ?? pageCoords?.lon ?? null,
      rooms: num(accommodation?.numberOfRooms) ?? num(accommodation?.numberOfBedrooms),
      capacity: num((accommodation?.occupancy as Json)?.value) ?? num(accommodation?.occupancy),
      address:
        typeof address === 'string'
          ? address
          : str((address as Json)?.streetAddress) ?? str((address as Json)?.addressLocality),
      missing: []
    }

    extract.missing = (
      [
        [extract.title, 'titre'],
        [extract.price, 'prix'],
        [extract.rooms, 'chambres'],
        [extract.capacity, 'capacité'],
        [extract.lat, 'position']
      ] as [unknown, string][]
    )
      .filter(([value]) => value == null)
      .map(([, label]) => label)

    return extract
  } catch (err) {
    const message = err instanceof Error && err.name === 'AbortError' ? 'délai dépassé' : String(err)
    return emptyExtract(rawUrl, site, `Lecture impossible (${message}).`)
  } finally {
    clearTimeout(timer)
  }
}
