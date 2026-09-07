/** Jeton ScrapingBee pour booking-scraper-api. Coffre `scrapingbee_key`. */

export function resolveScrapingBeeKey(
  vault: Record<string, string | undefined> = {},
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const raw =
    vault.scrapingbee_key ?? env.SCRAPINGBEE_API_KEY ?? env.BOOKING_SCRAPER_API_KEY
  const key = typeof raw === 'string' ? raw.trim() : ''
  return key || undefined
}
