import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  closeObscura,
  getObscuraContext,
  obscuraForcedChromium,
  resolveObscuraBinary,
  shouldUseObscura
} from './obscura'

function check(name: string, ok: boolean) {
  if (!ok) throw new Error(name)
  console.log('  ✓', name)
}

const prev = process.env.SKITRACK_BROWSER
delete process.env.SKITRACK_BROWSER
process.env.SKITRACK_BROWSER = 'chromium'
check('SKITRACK_BROWSER=chromium coupe Obscura', shouldUseObscura() === false)
check('chromium force le repli', obscuraForcedChromium() === true)
delete process.env.SKITRACK_BROWSER
process.env.SKITRACK_BROWSER = prev || ''
if (!process.env.SKITRACK_BROWSER) delete process.env.SKITRACK_BROWSER

process.env.SKITRACK_OBSCURA = '/tmp/does-not-exist-obscura'
const afterMissingEnv = resolveObscuraBinary()
delete process.env.SKITRACK_OBSCURA
check(
  'SKITRACK_OBSCURA invalide ne bloque pas vendor',
  afterMissingEnv === resolveObscuraBinary()
)

const vendor = join(process.cwd(), 'vendor', 'obscura', process.platform === 'win32' ? 'obscura.exe' : 'obscura')
const resolved = resolveObscuraBinary()
if (existsSync(vendor)) {
  check('vendor/obscura résolu', resolved != null && existsSync(resolved))
  delete process.env.SKITRACK_BROWSER
  check('défaut = Obscura si binaire', shouldUseObscura() === true)
  const ctx = await getObscuraContext(null)
  const page = await ctx.newPage()
  await page.goto('https://example.com/', { waitUntil: 'domcontentloaded', timeout: 20_000 })
  const href = await page.evaluate(() => location.href)
  check('CDP example.com', href.startsWith('https://example.com'))
  const href2 = await page.evaluate(() => document.location.href)
  check('page.evaluate (chemin Ingénie)', href2.startsWith('https://example.com'))
  await page.close()
  await closeObscura()
} else {
  console.log('  · pas de binaire vendor — sauter le CDP live (`npm run obscura:fetch`)')
}

console.log('ok obscura-resolve')
