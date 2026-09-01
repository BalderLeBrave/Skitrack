/**
 * Talon du client d'API, pour les tests de `data/lodgingAccess.ts`.
 *
 * Substitue `@/api/client` au moment du bundle (voir l'alias esbuild du script
 * `lodgaccess:test`). Il vit hors de `src/` a dessein : ce n'est pas du code
 * d'application, et il n'a donc a etre ni typecheque avec elle, ni releve par
 * le scan de traduction.
 *
 * Le test pilote le talon par `globalThis.__ACCESS_STUB__`.
 */

interface AccessPayload {
  domain_id: number
  with_elevation: boolean
  lodgings: { ref: string; lat: number; lon: number; location_precision: string }[]
}

interface AccessStub {
  ready?: boolean
  calls: AccessPayload[]
  handler: (payload: AccessPayload) => unknown
}

function stub(): AccessStub {
  const g = globalThis as unknown as { __ACCESS_STUB__?: AccessStub }
  if (!g.__ACCESS_STUB__) throw new Error('__ACCESS_STUB__ absent')
  return g.__ACCESS_STUB__
}

export function isClientReady(): boolean {
  return stub().ready !== false
}

export const api = {
  lodgingsAccess: async (payload: AccessPayload): Promise<never> => {
    const s = stub()
    s.calls.push(payload)
    return s.handler(payload) as never
  }
}
