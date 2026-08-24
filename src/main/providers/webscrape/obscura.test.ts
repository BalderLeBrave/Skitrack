import { obscuraForcedChromium, resolveObscuraBinary } from './obscura'

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
check('binaire absent → null', resolveObscuraBinary() === null)
delete process.env.SKITRACK_OBSCURA

console.log('ok obscura-resolve')
