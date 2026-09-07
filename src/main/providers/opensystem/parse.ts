/**
 * Parse des listes Open System : JSONP etape-rest, vueinfo.js, ou HTML SERP.
 *
 * Prix en euros (etape-rest `prix` est déjà le montant du séjour).
 * Un logement sans tarif > 0, ou `dispo !== 1`, n’est pas retenu.
 */

export interface OpenSystemListing {
  id: string
  title: string
  url: string
  total: number
  currency: 'EUR'
  lat: number | null
  lon: number | null
  city: string | null
  image: string | null
  priceCheckIn: string
  priceCheckOut: string
  priceConfidence: 'total_confirmed' | 'partial'
}

export interface OpenSystemParseOpts {
  origin: string
  from: string
  to: string
}

export interface EtapeOffer {
  cle: string
  prix: number
  dispo: number
}

export interface VueInfoItem {
  cle: string
  title: string
  lat: number | null
  lon: number | null
}

function roundEuro(n: number): number {
  return Math.round(n * 100) / 100
}

function decodeEntities(s: string): string {
  return s
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function parsePrice(text: unknown): number | null {
  if (text == null || text === '') return null
  if (typeof text === 'number') {
    return Number.isFinite(text) && text > 0 ? roundEuro(text) : null
  }
  if (typeof text !== 'string') return null
  const cleaned = text.replace(/\s/g, '').replace(/€|EUR/gi, '').replace(/,/g, '.')
  const m = cleaned.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? roundEuro(n) : null
}

function unwrapJsonp(raw: string): unknown {
  const trimmed = raw.trim()
  const m = trimmed.match(/^[A-Za-z_$][\w$]*\(\s*([\s\S]*)\s*\)\s*;?\s*$/)
  const body = m ? m[1] : trimmed
  return JSON.parse(body)
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function itemPrice(item: Record<string, unknown>): number | null {
  const direct =
    parsePrice(item.prix) ?? parsePrice(item.price) ?? parsePrice(item.Prix) ?? parsePrice(item.prixReel)
  if (direct != null) return direct
  const nested = asRecord(item.dispo) || asRecord(item.dispos)
  if (nested) {
    return parsePrice(nested.prix) ?? parsePrice(nested.price)
  }
  return null
}

function itemTitle(item: Record<string, unknown>): string | null {
  return (
    str(item.nom) ||
    str(item.name) ||
    str(item.titre) ||
    str(item.libelle) ||
    str(item.Libelle) ||
    str(item.Nom) ||
    null
  )
}

function absUrl(origin: string, href: string | null): string | null {
  if (!href) return null
  try {
    return new URL(decodeEntities(href), origin).href
  } catch {
    return null
  }
}

function datedUrl(url: string, from: string, to: string): string {
  try {
    const u = new URL(url)
    if (!u.searchParams.has('from')) u.searchParams.set('from', from)
    if (!u.searchParams.has('to')) u.searchParams.set('to', to)
    return u.href
  } catch {
    return url
  }
}

export function lodgingUrl(origin: string, cle: string, from: string, to: string): string {
  const u = new URL(origin.replace(/\/?$/, '/'))
  u.searchParams.set('cle', cle)
  u.searchParams.set('from', from)
  u.searchParams.set('to', to)
  return u.href
}

function etapeItems(raw: string): unknown[] {
  let data: unknown
  try {
    data = unwrapJsonp(raw)
  } catch {
    return []
  }
  const rec = asRecord(data)
  if (rec && Array.isArray(rec.items)) return rec.items
  if (rec && Array.isArray(rec.Produits)) return rec.Produits
  if (Array.isArray(data)) return data
  return []
}

/** Offres datées etape-rest : `{cle, prix, dispo}` — pas de titre. */
export function parseEtapeOffers(raw: string): EtapeOffer[] {
  const out: EtapeOffer[] = []
  for (const row of etapeItems(raw)) {
    const item = asRecord(row)
    if (!item) continue
    const cle = str(item.cle) || str(item.id) || str(item.Id)
    const prix = itemPrice(item)
    if (!cle || prix == null) continue
    const dispo = num(item.dispo)
    // `dispo: 1` = libre pour ces dates. Absent (catalogue avec nom) = on garde.
    if (dispo != null && dispo !== 1) continue
    out.push({ cle, prix, dispo: dispo ?? 1 })
  }
  return out
}

export function parseEtapeMeta(raw: string): { conversationId: string; total: number; more: boolean } {
  try {
    const rec = asRecord(unwrapJsonp(raw))
    if (!rec) return { conversationId: '', total: 0, more: false }
    const cid = str(rec.ConversationId) || ''
    const total = num(rec.total) ?? 0
    const rs = num(rec.rsBlockIndex)
    return { conversationId: cid, total, more: rs != null && rs >= 0 }
  } catch {
    return { conversationId: '', total: 0, more: false }
  }
}

/** Catalogue OsForm (`vueinfo.js`) : titres + GPS, pas de tarif séjour. */
export function parseVueInfo(raw: string): VueInfoItem[] {
  const i = raw.indexOf('return')
  if (i < 0) return []
  const brace = raw.indexOf('{', i)
  if (brace < 0) return []
  let depth = 0
  let end = -1
  for (let j = brace; j < raw.length; j++) {
    const ch = raw[j]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        end = j
        break
      }
    }
  }
  if (end < 0) return []
  let data: unknown
  try {
    data = JSON.parse(raw.slice(brace, end + 1))
  } catch {
    return []
  }
  const rec = asRecord(data)
  const items = rec && Array.isArray(rec.items) ? rec.items : []
  const out: VueInfoItem[] = []
  for (const row of items) {
    const item = asRecord(row)
    if (!item) continue
    const cle = str(item.cle)
    const title = str(item.titre) || str(item.nom)
    if (!cle || !title) continue
    out.push({
      cle,
      title,
      lat: num(item.lat),
      lon: num(item.lng) ?? num(item.lon)
    })
  }
  return out
}

/**
 * Fusionne offres etape-rest et catalogue vueinfo.
 *
 * Un titre vueinfo est préféré. S'il manque (403, parse raté, catalogue
 * incomplet), on garde quand même l'offre : le prix etape-rest est daté, le
 * titre retombe sur la clé produit plutôt que de jeter toute la liste.
 */
export function mergeEtapeAndVue(
  offers: EtapeOffer[],
  vue: VueInfoItem[],
  opts: OpenSystemParseOpts
): OpenSystemListing[] {
  const byCle = new Map<string, VueInfoItem>()
  for (const v of vue) byCle.set(v.cle, v)
  const out: OpenSystemListing[] = []
  const seen = new Set<string>()
  for (const offer of offers) {
    if (seen.has(offer.cle)) continue
    seen.add(offer.cle)
    const meta = byCle.get(offer.cle)
    const title = meta?.title || `Hébergement ${offer.cle}`
    out.push({
      id: offer.cle,
      title,
      url: lodgingUrl(opts.origin, offer.cle, opts.from, opts.to),
      total: offer.prix,
      currency: 'EUR',
      lat: meta?.lat ?? null,
      lon: meta?.lon ?? null,
      city: null,
      image: null,
      priceCheckIn: opts.from,
      priceCheckOut: opts.to,
      priceConfidence: 'total_confirmed'
    })
  }
  out.sort((a, b) => a.total - b.total)
  return out
}

/** JSONP etape-rest / e70 : `{ items: [...], total }` — avec titre si le flux en a un. */
export function parseJsonpList(raw: string, opts: OpenSystemParseOpts): OpenSystemListing[] {
  const out: OpenSystemListing[] = []
  for (const row of etapeItems(raw)) {
    const item = asRecord(row)
    if (!item) continue
    const total = itemPrice(item)
    if (total == null) continue
    const dispo = num(item.dispo)
    if (dispo != null && dispo !== 1) continue
    const id = str(item.cle) || str(item.id) || str(item.Id) || str(item.reference) || ''
    const title = itemTitle(item)
    if (!title) continue
    const href =
      absUrl(opts.origin, str(item.url) || str(item.href) || str(item.lien)) ||
      (id ? lodgingUrl(opts.origin, id, opts.from, opts.to) : opts.origin)
    const lat = num(item.lat) ?? num(item.latitude)
    const lon = num(item.lng) ?? num(item.lon) ?? num(item.longitude)
    out.push({
      id: id || href,
      title,
      url: datedUrl(href, opts.from, opts.to),
      total,
      currency: 'EUR',
      lat,
      lon,
      city: str(item.ville) || str(item.city) || str(item.commune),
      image: absUrl(opts.origin, str(item.image) || str(item.img) || str(item.photo)),
      priceCheckIn: opts.from,
      priceCheckOut: opts.to,
      priceConfidence: 'total_confirmed'
    })
  }
  return out
}

const RESULT_RE =
  /<(article|div|li)\b[^>]*(?:class="[^"]*(?:Resultat|os-produit|list-resultats__item|osw-item)[^"]*"|data-cle=)[^>]*>/gi

function sliceBlocks(html: string): string[] {
  const blocks: string[] = []
  const re = RESULT_RE
  const matches: number[] = []
  let m: RegExpExecArray | null
  re.lastIndex = 0
  while ((m = re.exec(html))) matches.push(m.index)
  if (matches.length === 0) {
    const priceRe = /class="[^"]*js-prix-reel[^"]*"/gi
    const idx: number[] = []
    let p: RegExpExecArray | null
    while ((p = priceRe.exec(html))) idx.push(Math.max(0, p.index - 800))
    for (let i = 0; i < idx.length; i++) {
      const start = idx[i]!
      const end = i + 1 < idx.length ? idx[i + 1]! : Math.min(html.length, start + 2500)
      blocks.push(html.slice(start, end))
    }
    return blocks
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i]!
    const end = i + 1 < matches.length ? matches[i + 1]! : html.length
    blocks.push(html.slice(start, end))
  }
  return blocks
}

function attr(block: string, name: string): string | null {
  const re = new RegExp(name + `=(["'])([\\s\\S]*?)\\1`, 'i')
  const m = block.match(re)
  return m ? m[2] : null
}

/** HTML SERP : `.js-prix-reel` / `.js-bloc-prixtotal` / `.osw-prix-produit`. */
export function parseListingHtml(html: string, opts: OpenSystemParseOpts): OpenSystemListing[] {
  const blocks = sliceBlocks(html)
  const out: OpenSystemListing[] = []
  for (const block of blocks) {
    const priceText =
      block.match(/class="[^"]*js-prix-reel[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] ||
      block.match(/class="[^"]*js-bloc-prixtotal[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] ||
      block.match(/class="[^"]*osw-prix-produit[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] ||
      null
    if (/prix_barre|PrixBarre|prix-barre/i.test(block) && !/js-prix-reel|js-bloc-prixtotal|osw-prix-produit/i.test(block)) {
      continue
    }
    const total = parsePrice(priceText ? stripTags(priceText) : null)
    if (total == null) continue
    const titleHtml =
      block.match(/class="[^"]*(?:titre|Titre|osw-titre|item-titre)[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] ||
      block.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] ||
      block.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1] ||
      null
    const title = titleHtml ? stripTags(titleHtml) : null
    if (!title || title.length < 2) continue
    const href =
      attr(block, 'href') ||
      block.match(/href=(["'])([\s\S]*?)\1/i)?.[2] ||
      null
    const img =
      block.match(/<img[^>]+src=(["'])([\s\S]*?)\1/i)?.[2] ||
      attr(block, 'data-src')
    const id = attr(block, 'data-cle') || attr(block, 'data-id') || href || title
    out.push({
      id: id || title,
      title,
      url: datedUrl(absUrl(opts.origin, href) || opts.origin, opts.from, opts.to),
      total,
      currency: 'EUR',
      lat: parseFloat(attr(block, 'data-lat') || '') || null,
      lon: parseFloat(attr(block, 'data-lng') || attr(block, 'data-lon') || '') || null,
      city: null,
      image: absUrl(opts.origin, img ?? null),
      priceCheckIn: opts.from,
      priceCheckOut: opts.to,
      priceConfidence: 'total_confirmed'
    })
  }
  return out
}

export function parseOpenSystemPayload(raw: string, opts: OpenSystemParseOpts): OpenSystemListing[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || /^[A-Za-z_$][\w$]*\(/.test(trimmed)) {
    const jsonp = parseJsonpList(trimmed, opts)
    if (jsonp.length) return jsonp
    const offers = parseEtapeOffers(trimmed)
    if (offers.length) {
      return mergeEtapeAndVue(offers, [], opts)
    }
  }
  return parseListingHtml(trimmed, opts)
}
