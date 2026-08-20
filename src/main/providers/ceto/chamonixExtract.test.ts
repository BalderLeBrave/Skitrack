/**
 * Tests de mapping village — exécutables sans Vitest :
 *   node --experimental-strip-types src/main/providers/ceto/chamonixExtract.test.ts
 */
import { resolveLocationCode } from './chamonixExtract.ts'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

assert(resolveLocationCode('Les Houches') === 'cmb.houches', 'Les Houches')
assert(resolveLocationCode('Chamonix-Mont-Blanc') === 'cmb.chamonix', 'Chamonix-Mont-Blanc')
assert(resolveLocationCode('cmb.vallorcine') === 'cmb.vallorcine', 'keep cmb.*')
assert(resolveLocationCode('Argentière') === 'cmb.argentiere', 'Argentière')
assert(resolveLocationCode('Servoz') === 'cmb.servoz', 'Servoz')

console.log('ok resolveLocationCode')
