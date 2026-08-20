function parseArticle(block, { from, to }) {
  const openEnd = block.indexOf('>')
  const openTag = block.slice(0, openEnd + 1)
  const body = block.slice(openEnd + 1)

  const dataLink = attr(openTag, 'data-link')
  let geo = null
  const geoRaw = attr(openTag, 'data-geolocation')
  if (geoRaw) {
    try {
      geo = JSON.parse(geoRaw)
    } catch {
      geo = null
    }
  }

  let productMeta = null
  const fav = body.match(/data-product=(['"])(\{[\s\S]*?\})\1/)
  if (fav) {
    try {
      productMeta = JSON.parse(fav[2].replace(/\n/g, ''))
    } catch {
      productMeta = null
    }
  }

  const titleM =
    body.match(/class="result-title[^"]*"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
    body.match(/class="result-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i)
  const subM = body.match(/class="result-subtitle"[^>]*>([\s\S]*?)<\/h4>/i)
  const priceM = body.match(/class="price"[^>]*>([\s\S]*?)<\/span>/i)
  const fromM = body.match(/class="from"[^>]*>([\s\S]*?)<\/span>/i)
  const typeM = body.match(/class="type"[^>]*>([\s\S]*?)<\/span>/i)
  const bannerM = body.match(/class="banner-label"[^>]*>([\s\S]*?)<\/span>/i)

  const taM =
    body.match(
      /data-id="(\d+)"\s+data-reviews-api="([^"]*reviews[^"]*)"/i
    ) ||
    body.match(
      /data-reviews-api="([^"]*reviews[^"]*)"[^>]*data-id="(\d+)"/i
    ) ||
    body.match(
      /class="[^"]*tripadvisor[^"]*"[^>]*data-id="(\d+)"/i
    )
  let tripadvisorLocationId = null
  let reviewsApiBase = null
  if (taM) {
    if (taM[2] && /^\d+$/.test(taM[1])) {
      tripadvisorLocationId = taM[1]
      reviewsApiBase = taM[2]
    } else if (taM[2] && /^\d+$/.test(taM[2])) {
      reviewsApiBase = taM[1]
      tripadvisorLocationId = taM[2]
    } else {
      tripadvisorLocationId = taM[1]
    }
  }

  const title = titleM ? stripTags(titleM[1]) : productMeta?.title || null
  const city =
    (subM ? stripTags(subM[1]) : null) || productMeta?.stationLocation || null
  const priceText = priceM ? stripTags(priceM[1]) : null
  const total = parsePrice(priceText)

  const rel = dataLink || productMeta?.url || null
  const url = rel ? new URL(rel.split('#')[0], BASE).href : null
  let listingUrl = url
  if (rel && rel.includes('#')) {
    listingUrl = new URL(rel, BASE).href
  } else if (url && from && to) {
    listingUrl = `${url}#s_checkinDate=${from}&s_checkoutDate=${to}&s_channel=CMB`
  }

  let lat = null
  let lon = null
  if (geo?.geometry?.coordinates?.length >= 2) {
    lon = geo.geometry.coordinates[0]
    lat = geo.geometry.coordinates[1]
  }

  const id =
    productMeta?.id != null
      ? String(productMeta.id)
      : geo?.properties?.code != null
        ? String(geo.properties.code)
        : url
          ? url.match(/\/(?:hotel|product|residence)-(\d+)/)?.[1] || null
          : null

  return {
    id,
    title,
    city,
    total,
    currency: 'EUR',
    priceText,
    pricePrefix: fromM ? stripTags(fromM[1]) : null,
    priceUnit: typeM ? stripTags(typeM[1]) : null,
    accommodation: bannerM
      ? stripTags(bannerM[1])
      : productMeta?.accommodation || null,
    stars: productMeta?.stars != null ? Number(productMeta.stars) || productMeta.stars : null,
    url: listingUrl,
    image: productMeta?.img || null,
    address: geo?.properties?.location || null,
    lat,
    lon,
    priceCheckIn: from,
    priceCheckOut: to,
    priceConfidence: total != null ? (fromM && /partir/i.test(stripTags(fromM[1])) ? 'partial' : 'exact') : null,
    tripadvisorLocationId,
    reviewsApiBase,
    reviews: null,
    source: 'chamonix-orchestra'
  }
}

