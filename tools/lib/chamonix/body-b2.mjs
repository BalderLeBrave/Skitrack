async function extract(opts) {
  const cfg = SERP[opts.type]
  if (!cfg) throw new Error(`Unknown type ${opts.type}`)

  const host = new URL(BASE).host
  const hostBreaker = breakerFor(host, { threshold: 3, cooldownMs: 60_000 })
  const pageBreaker = new CircuitBreaker(2, 30_000, `pagination:${opts.type}`)

  if (hostBreaker.open) {
    return {
      ok: false,
      engine: 'orchestra-chamonix',
      error: hostBreaker.reason,
      circuitBreaker: { host: hostBreaker.snapshot(), pagination: pageBreaker.snapshot() },
      count: 0,
      listings: [],
      warnings: [hostBreaker.reason]
    }
  }

  const query = buildQuery(opts)
  const firstUrl = `${BASE}${cfg.path}?${query}`
  /** @type {Array<Record<string, unknown>>} */
  const pages = []
  /** @type {string[]} */
  const warnings = []
  /** @type {ReturnType<typeof parseArticle>[]} */
  const listings = []
  const seen = new Set()

  const page1Result = await fetchText(firstUrl, {}, { retries: 3, breaker: hostBreaker })
  if (!page1Result.ok) {
    throw new Error(page1Result.error)
  }
  const html1 = page1Result.text
  pages.push({ page: 1, status: 'ok', bytes: html1.length, url: firstUrl, articles: 0 })
  const nbResult = parseNbResult(html1)

  const page1 = ingestArticles(splitArticles(html1), opts, listings, seen)
  pages[0].articles = page1.added
  if (page1.parseErrors) {
    warnings.push(`page 1: ${page1.parseErrors} article(s) non parsable(s)`)
  }

  let page = 2
  let canMore = hasMoreButton(html1)
  let paginationComplete = !canMore || opts.maxPages < 2

  while (canMore && page <= opts.maxPages) {
    if (pageBreaker.open) {
      warnings.push(`${pageBreaker.reason} — ${listings.length} offre(s) déjà collectée(s)`)
      paginationComplete = false
      break
    }
    if (hostBreaker.open) {
      warnings.push(`${hostBreaker.reason} — pagination interrompue`)
      paginationComplete = false
      break
    }

    const moreQs = `${query}&page=${page}&byPage=${opts.byPage}`
    const moreUrl = `${BASE}${cfg.morePath}?${moreQs}`

    const result = await fetchText(
      moreUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: firstUrl
        },
        body: cfg.path,
        timeoutMs: 20_000
      },
      { retries: 2, baseDelayMs: 600, breaker: pageBreaker }
    )

    if (!result.ok) {
      pages.push({
        page,
        status: 'error',
        error: result.error,
        httpStatus: result.status,
        retryable: result.retryable,
        circuit: pageBreaker.snapshot(),
        url: moreUrl
      })
      warnings.push(`pagination page ${page}: ${result.error}`)

      if (
        result.status != null &&
        result.status >= 400 &&
        result.status < 500 &&
        result.status !== 429
      ) {
        pageBreaker.fail()
        warnings.push(`pagination arrêtée (HTTP ${result.status} non retryable)`)
        paginationComplete = false
        break
      }

      if (pageBreaker.open) {
        warnings.push(
          `circuit-breaker pagination ouvert — arrêt (${listings.length} offre(s) conservée(s))`
        )
        paginationComplete = false
        break
      }

      await sleep(800)
      page++
      continue
    }

    const fragment = result.text

    if (!fragment || fragment.length < 40) {
      pages.push({ page, status: 'empty', bytes: fragment?.length ?? 0, url: moreUrl })
      warnings.push(`pagination page ${page}: réponse vide — fin anticipée`)
      pageBreaker.succeed()
      paginationComplete = true
      break
    }
    if (/<!doctype html>/i.test(fragment) && !/cpt-result/i.test(fragment)) {
      pages.push({ page, status: 'unexpected_html', bytes: fragment.length, url: moreUrl })
      warnings.push(
        `pagination page ${page}: HTML complet sans fiches (session/redirect?) — arrêt`
      )
      pageBreaker.fail()
      paginationComplete = false
      break
    }

    const arts = splitArticles(fragment)
    const ingested = ingestArticles(arts, opts, listings, seen)
    pages.push({
      page,
      status: 'ok',
      bytes: fragment.length,
      articles: ingested.added,
      rawArticles: arts.length,
      url: moreUrl
    })
    if (ingested.parseErrors) {
      warnings.push(`page ${page}: ${ingested.parseErrors} article(s) non parsable(s)`)
    }

    if (arts.length === 0) {
      paginationComplete = true
      break
    }
    if (arts.length < opts.byPage && !hasMoreButton(fragment)) {
      paginationComplete = true
      canMore = false
    } else {
      canMore = hasMoreButton(fragment) || arts.length >= opts.byPage
    }

    page++
    await sleep(400)
  }

  if (page > opts.maxPages && canMore) {
    warnings.push(`max-pages=${opts.maxPages} atteint — résultats peut-être incomplets`)
    paginationComplete = false
  }

  if (nbResult != null && listings.length < nbResult && !paginationComplete) {
    warnings.push(
      `couverture partielle: ${listings.length}/${nbResult} offres (pagination incomplète ou filtres prix)`
    )
  }

  const byCity = {}
  for (const l of listings) {
    const c = l.city || '(unknown)'
    byCity[c] = (byCity[c] || 0) + 1
  }

  /** @type {Record<string, unknown> | null} */
  let reviewsSummary = null
  if (opts.withReviews && listings.length > 0) {
    reviewsSummary = await enrichWithReviews(listings, {
      limit: opts.reviewsLimit,
      concurrency: 2
    })
    saveReviewsDiskCache()
    if (reviewsSummary.failed) {
      warnings.push(
        `avis: ${reviewsSummary.ok} ok / ${reviewsSummary.failed} échec(s) sur ${reviewsSummary.requested} demandé(s)`
      )
    }
    if (reviewsSummary.circuitOpen) {
      warnings.push('circuit-breaker tripadvisor-reviews ouvert — enrichissement partiel')
    }
  }

  return {
    ok: true,
    engine: 'orchestra-chamonix',
    request: {
      type: opts.type,
      from: opts.from,
      to: opts.to,
      adults: opts.adults,
      children: opts.children,
      location: opts.location,
      withReviews: opts.withReviews,
      url: firstUrl
    },
    nbResultReported: nbResult,
    paginationComplete,
    circuitBreaker: {
      host: hostBreaker.snapshot(),
      pagination: pageBreaker.snapshot()
    },
    reviewsSummary,
    warnings,
    pagesFetched: pages,
    count: listings.length,
    byCity,
    listings
  }
}

const opts = parseArgs(process.argv)
extract(opts)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2))
  })
  .catch((err) => {
    console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }, null, 2))
    process.exit(1)
  })
