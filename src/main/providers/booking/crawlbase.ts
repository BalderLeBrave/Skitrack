/**
 * Jeton Crawlbase (Crawling API). Coffre `crawlbase_token` prioritaire,
 * sinon CRAWLBASE_TOKEN / CRAWLBASE_JS_TOKEN.
 */

export function resolveCrawlbaseToken(
  vault: Record<string, string | undefined> = {},
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const raw =
    vault.crawlbase_token ?? env.CRAWLBASE_TOKEN ?? env.CRAWLBASE_JS_TOKEN
  const key = typeof raw === 'string' ? raw.trim() : ''
  return key || undefined
}
