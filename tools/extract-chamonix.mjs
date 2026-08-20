/**
 * Extracteur DOM Orchestra — booking.chamonix.com (Ceto / PMB)
 *
 * Assemble tools/lib/chamonix/body-*.mjs puis exécute.
 *
 * Usage:
 *   node tools/extract-chamonix.mjs --type hotel --location cmb.houches --with-reviews
 *   node tools/extract-chamonix.mjs --from 2026-12-19 --to 2026-12-26 --max-pages 2
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const lib = join(dir, 'lib', 'chamonix')
const parts = ['body-a.mjs', 'body-b1.mjs', 'body-b2.mjs']
const code = parts.map((p) => readFileSync(join(lib, p), 'utf8')).join('')
mkdirSync(lib, { recursive: true })
const assembled = join(lib, '.assembled.mjs')
writeFileSync(assembled, code)
await import(pathToFileURL(assembled).href)
