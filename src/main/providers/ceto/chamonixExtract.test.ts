import { describe, expect, it } from 'vitest'
import { resolveLocationCode } from './chamonixExtract'

describe('resolveLocationCode', () => {
  it('maps Les Houches', () => {
    expect(resolveLocationCode('Les Houches')).toBe('cmb.houches')
  })
  it('maps Chamonix-Mont-Blanc', () => {
    expect(resolveLocationCode('Chamonix-Mont-Blanc')).toBe('cmb.chamonix')
  })
  it('keeps cmb.* codes', () => {
    expect(resolveLocationCode('cmb.vallorcine')).toBe('cmb.vallorcine')
  })
  it('maps Argentière with accent', () => {
    expect(resolveLocationCode('Argentière')).toBe('cmb.argentiere')
  })
})
