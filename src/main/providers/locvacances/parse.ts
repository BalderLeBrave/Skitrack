/**
 * Extracteur LocVacances — tarif affiché à côté du bouton Réserver
 * (`.availability-rates .rate`), pas le « à partir de / sem. » du catalogue.
 */

import type { LocvacancesSite } from './hosts'

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface LocvacancesListing {
  id: string
  title: string
  url: string
  total: number
  currency: 'EUR'
  city: string
  priceCheckIn: string
  priceCheckOut: string
  capacity: number | null
  rooms: number | null
  bedrooms: number | null
}

function isoToFr(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&/g, '&')
    .replace(/"/g, '"')
    .replace(/&#232;/g, 'è')
    .replace(/&#233;/g, 'é')
}

export function extractLotIds(html: string): string[] {
  return [...new Set([...html.matchAll(/id="form-availability-(\d+)"/g)].map((m) => m[1]))]
}

function pageTitle(html: string): string {
  const m = html.match(/<title>([^<]+)/i)
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : ''
}

export function parseDetailPrice(html: string): { title: string; total: number } | null {
  const text = decodeEntities(html)
  if (!/id="book"/.test(text)) return null
  const rate = text.match(/availability-rates[\s\S]{0,800}?class="rate[^"]*">\s*([0-9\s\u00a0]+)\s*€/)
  if (!rate) return null
  const total = Number(rate[1].replace(/[\s\u00a0]/g, ''))
  if (!Number.isFinite(total) || total <= 0) return null
  const titleMatch = text.match(/<title>([^<]+)/i)
  const raw = (titleMatch?.[1] ?? '').split('|')[0].trim()
  const title = raw.replace(/^[\s-]+/, '').replace(/\s+/g, ' ')
  if (!title) return null
  return { title, total }
}

/**
 * Capacité et pièces d'une annonce, lues **dans la fiche déjà téléchargée**.
 *
 * LocVacances ne publie pas ces champs : il les écrit en toutes lettres, et
 * d'abord dans le `<title>` — « Chalet 14personnes - BAROSSA », sans espace
 * avant « personnes ». Le titre prime donc sur le corps, où le même chiffre
 * peut appartenir à un menu ou à une annonce voisine.
 *
 * Ce que la fiche ne dit pas reste `null` : jamais 0, qui se lirait comme
 * « ne couche personne » au lieu de « ne le dit pas ».
 */
export interface LocvacancesFacts {
  /** Couchages annoncés par la fiche — jamais le groupe recherché. */
  capacity: number | null
  /** Pièces : la mesure française de la location de montagne. */
  rooms: number | null
  bedrooms: number | null
}

/** Bornes de vraisemblance : au-delà, le chiffre capté ne parlait pas du lot. */
const MAX_CAPACITY = 30
const MAX_ROOMS = 15

function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ')
}

function firstCount(sources: string[], re: RegExp, max: number, label: string): number | null {
  for (const source of sources) {
    const m = source.match(re)
    if (!m) continue
    const n = Number(m[1])
    if (!Number.isFinite(n) || n < 1 || n > max) {
      console.warn(`[locvacances] ${label} invraisemblable (${m[1]}) — champ laissé vide`)
      continue
    }
    return n
  }
  return null
}

export function parseDetailFacts(html: string): LocvacancesFacts {
  const title = pageTitle(html)
  // Le titre est retiré du corps : sans quoi une valeur rejetée le serait deux
  // fois, et le journal accuserait deux fois la même annonce.
  const body = visibleText(html.replace(/<title[\s\S]*?<\/title>/gi, ' '))
  const sources = [title, body]
  return {
    capacity:
      firstCount(sources, /(\d+)\s*personn/i, MAX_CAPACITY, 'capacité') ??
      firstCount(sources, /(\d+)\s*couchage/i, MAX_CAPACITY, 'couchages'),
    // « T3 » / « F2 » en majuscules seulement : `t3` traînant dans un slug
    // d'URL ou une classe CSS n'est pas un type de logement.
    rooms:
      firstCount(sources, /(\d+)\s*pi[èe]ces?/i, MAX_ROOMS, 'pièces') ??
      firstCount(sources, /\b[TF]([1-9])\b/, MAX_ROOMS, 'type de logement'),
    bedrooms: firstCount(sources, /(\d+)\s*chambres?/i, MAX_ROOMS, 'chambres')
  }
}

export async function extractLocvacances(opts: {
  site: LocvacancesSite
  from: string
  to: string
}): Promise<LocvacancesListing[]> {
  const listUrl = `${opts.site.origin}/fr-FR/`
  const listRes = await fetch(listUrl, { headers: { 'User-Agent': UA, Referer: listUrl } })
  if (!listRes.ok) throw new Error(`LocVacances listing HTTP ${listRes.status}`)
  const lots = extractLotIds(await listRes.text())
  const start = isoToFr(opts.from)
  const end = isoToFr(opts.to)
  const out: LocvacancesListing[] = []
  const queue = [...lots]
  const workers = 4
  async function worker() {
    while (queue.length) {
      const lot = queue.shift()
      if (!lot) return
      const body = new URLSearchParams({
        lot_no: lot,
        comm_no: '0',
        comm_type: 'DEFAUT',
        startDate: start,
        endDate: end
      })
      const res = await fetch(`${opts.site.origin}/fr-FR/Lot/Detail`, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: listUrl
        },
        body
      })
      if (!res.ok) continue
      const html = await res.text()
      const parsed = parseDetailPrice(html)
      if (!parsed) continue
      // Même fiche, aucune requête de plus : les faits sortent du HTML en main.
      const facts = parseDetailFacts(html)
      out.push({
        id: lot,
        title: parsed.title,
        url: `${opts.site.origin}/fr-FR/Lot/Detail?lot_no=${lot}&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`,
        total: parsed.total,
        currency: 'EUR',
        city: opts.site.city,
        priceCheckIn: opts.from,
        priceCheckOut: opts.to,
        capacity: facts.capacity,
        rooms: facts.rooms,
        bedrooms: facts.bedrooms
      })
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, lots.length) }, () => worker()))
  return out
}
