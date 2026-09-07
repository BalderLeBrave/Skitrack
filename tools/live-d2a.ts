/**
 * Relevé live Les 2 Alpes — 6→13 fév. 2027, 8 pers.
 * Usage : esbuild + node (voir commande npm ci-dessous).
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildEngine, aggregateResults } from '../src/main/providers/index'
import { closeWebscrapeBrowser } from '../src/main/providers/webscrape/shared'
import { gitesWidgetUrl, parseGitesWidgetContext, parseGitesWidgetPhoto, gitesResaForm, interpretGitesQuoteBody, isoToFrDate, classifyGitesTypology } from '../src/main/providers/webscrape/gitesFichePrice'
import { request } from 'playwright'

const CHECK_IN = '2027-02-06'
const CHECK_OUT = '2027-02-13'
const ADULTS = 8
const OUT = 'docs/diagnostics/dumps/live-d2a-2027-02-06.json'

async function quoteCopains(): Promise<Record<string, unknown>> {
  const code = '38G253122'
  const api = await request.newContext({
    extraHTTPHeaders: { 'Accept-Language': 'fr-FR', 'User-Agent': 'Mozilla/5.0' }
  })
  try {
    const html = await (await api.get(gitesWidgetUrl(code), { timeout: 25_000 })).text()
    const ctx = parseGitesWidgetContext(html)
    const photo = parseGitesWidgetPhoto(html)
    const typ = classifyGitesTypology({ ident: ctx?.ident, url: `https://www.gites-de-france.com/fr/x-${code}` })
    if (!ctx) return { code, ok: false, reason: 'no_widget_context', photo, htmlBytes: html.length }
    const deb = isoToFrDate(CHECK_IN)!
    const fin = isoToFrDate(CHECK_OUT)!
    const exo = await api.post('https://widget-fngf.itea.fr/lib_2/ajax/gereResa.php', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: gitesResaForm(ctx, { dateDeb: deb, dateFin: fin, adults: ADULTS, type: 'getExerciceByDateFin' }),
      timeout: 20_000
    })
    let exercice = ''
    try {
      const j = JSON.parse(await exo.text()) as { exercice?: string }
      if (j.exercice) exercice = String(j.exercice)
    } catch {
      /* */
    }
    const tab = await api.post('https://widget-fngf.itea.fr/lib_2/ajax/gereResa.php', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: gitesResaForm(ctx, {
        dateDeb: deb,
        dateFin: fin,
        adults: ADULTS,
        type: 'getHTMLTabPrixFormulesSejour',
        exercice: exercice || undefined
      }),
      timeout: 25_000
    })
    const body = await tab.text()
    const parsed = interpretGitesQuoteBody(body)
    return {
      code,
      typ,
      ident: ctx.ident,
      photo,
      stay: parsed.stay ?? null,
      available: parsed.available,
      price_firm: parsed.price_firm,
      not_1330: parsed.stay != null && Math.abs(parsed.stay - 1330) > 0.01,
      match_4261: parsed.stay != null && Math.abs(parsed.stay - 4261.52) <= 0.05
    }
  } finally {
    await api.dispose()
  }
}

async function main(): Promise<void> {
  console.log('[live-d2a] start', CHECK_IN, CHECK_OUT, ADULTS, 'pers')
  const copainsP = quoteCopains().then((r) => {
    console.log('[live-d2a] Copains', JSON.stringify(r))
    return r
  })

  const engine = buildEngine({ enableWebScrape: true, vault: () => undefined })
  const started = Date.now()
  const agg = await aggregateResults(
    engine,
    {
      destination: 'Les 2 Alpes',
      officialUrl: 'https://reservation.les2alpes.com/location-appartement-2-alpes.html',
      latitude: 45.0067,
      longitude: 6.1228,
      radiusMeters: 12_000,
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      adults: ADULTS
    },
    ['booking-web', 'gites-web', 'vrbo-web', 'station-web'],
    (o) => {
      console.log(
        `[live-d2a] ${o.provider} ${o.results.length} offres ${o.elapsedMs}ms ${o.reasonCode ?? ''} ${o.pagination?.stoppedReason ?? ''} p=${o.pagination?.pagesFetched ?? '?'} err=${o.error ?? ''}`
      )
    }
  )
  const copains = await copainsP
  const samples = agg.listings.slice(0, 12).map((l) => ({
    src: l.source,
    title: l.title,
    total: l.totalPrice,
    guests: l.guests,
    bedrooms: l.bedrooms,
    photo: l.images?.[0] ?? null,
    url: l.url
  }))
  const report = {
    at: new Date().toISOString(),
    ms: Date.now() - started,
    stationRun: {
      station: 'Les 2 Alpes',
      check_in: CHECK_IN,
      check_out: CHECK_OUT,
      guests: ADULTS,
      sources: agg.outcomes.map((o) => ({
        provider: o.provider,
        fetched: o.pagination?.listingsFound ?? o.results.length,
        parsed: o.results.length,
        shown: o.results.length,
        pages_fetched: o.pagination?.pagesFetched ?? (o.results.length > 0 ? 1 : 0),
        stopped_reason: o.pagination?.stoppedReason,
        reason_code: o.reasonCode,
        error: o.error,
        advertised: o.pagination?.advertised
      }))
    },
    copains,
    listingCount: agg.listings.length,
    withPhoto: agg.listings.filter((l) => l.images?.[0]).length,
    withTotal: agg.listings.filter((l) => l.totalPrice && l.totalPrice > 0).length,
    samples
  }
  mkdirSync('docs/diagnostics/dumps', { recursive: true })
  writeFileSync(join(OUT), JSON.stringify(report, null, 2))
  console.log('[live-d2a] station_run', JSON.stringify(report.stationRun))
  console.log('[live-d2a] listings', report.listingCount, 'photos', report.withPhoto, 'totaux', report.withTotal)
  await closeWebscrapeBrowser()
}

main().catch((err) => {
  console.error('[live-d2a] FAIL', err)
  process.exitCode = 1
})
