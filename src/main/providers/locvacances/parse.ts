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
      const parsed = parseDetailPrice(await res.text())
      if (!parsed) continue
      out.push({
        id: lot,
        title: parsed.title,
        url: `${opts.site.origin}/fr-FR/Lot/Detail?lot_no=${lot}&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`,
        total: parsed.total,
        currency: 'EUR',
        city: opts.site.city,
        priceCheckIn: opts.from,
        priceCheckOut: opts.to
      })
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, lots.length) }, () => worker()))
  return out
}
