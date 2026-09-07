/**
 * Extracteur DOM Orchestra — booking.chamonix.com (Ceto / PMB)
 *
 * Décode tools/lib/chamonix/payload-*.b64, assemble et exécute.
 *
 * Usage:
 *   node tools/extract-chamonix.mjs --type hotel --location cmb.houches --with-reviews
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const lib = join(dir, 'lib', 'chamonix')
const parts = readdirSync(lib)
  .filter((n) => /^payload-\d+\.b64$/.test(n))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
const b64 = parts.map((n) => readFileSync(join(lib, n), 'utf8')).join('')
const code = Buffer.from(b64, 'base64').toString('utf8')
mkdirSync(lib, { recursive: true })
const assembled = join(lib, '.assembled.mjs')
writeFileSync(assembled, code)
await import(pathToFileURL(assembled).href)
