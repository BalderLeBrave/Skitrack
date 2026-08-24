import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  closeObscura,
  getObscuraContext,
  obscuraForcedChromium,
  resolveObscuraBinary
} from './obscura'

function check(name: string, ok: boolean) {
  if (!ok) throw new Error(name)
  console.log('  ✓', name)
}

const prev = process.env.SKITRACK_BROWSER
process.env.SKITRACK_BROWSER = 'chromium'
check('SKITRACK_BROWSER=chromium force le repli', obscuraForcedChromium() === true)
process.env.SKITRACK_BROWSER = ''
check('sans variable, pas de force Chromium', obscuraForcedChromium() === false)
process.env.SKITRACK_BROWSER = prev

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
  const ctx = await getObscuraContext(null)
  const page = await ctx.newPage()
  await page.goto('https://example.com/', { waitUntil: 'domcontentloaded', timeout: 20_000 })
  const title = await page.title()
  check('CDP example.com', title.includes('Example'))
  await page.close()
  await closeObscura()
} else {
  console.log('  · pas de binaire vendor — sauter le CDP live (`npm run obscura:fetch`)')
}

console.log('ok obscura-resolve')
