/**
 * Pont Electron simulé pour la prévisualisation navigateur.
 *
 * Le renderer attend `window.skitrack` (exposé par le preload Electron). En
 * dehors d'Electron ce pont n'existe pas : ce module en fournit une version
 * inerte, suffisante pour afficher l'interface avec les données embarquées
 * (référentiel des domaines livré avec l'application). Aucun relevé réseau réel
 * n'a lieu — c'est une maquette d'UI, pas l'application complète.
 *
 * Chargé uniquement par `dev-main.tsx`, jamais par le build Electron.
 */

const noop = (): void => {}
const unsub = (): (() => void) => noop

const emptyAggregate = {
  results: [],
  outcomes: [],
  queriedProviders: [] as string[]
}

const skitrack = {
  sidecar: {
    // 'ready' avec une URL locale factice : la coque affiche l'application tout
    // de suite, et les rares appels HTTP échouent en silence (capturés) —
    // l'écran vit sur les domaines embarqués.
    info: () =>
      Promise.resolve({
        state: {
          status: 'ready',
          baseUrl: 'http://127.0.0.1:0',
          token: 'preview',
          port: 0,
          pid: 0,
          version: 'preview'
        },
        log: ['Prévisualisation navigateur — moteur local simulé.']
      }),
    restart: () =>
      Promise.resolve({
        status: 'ready',
        baseUrl: 'http://127.0.0.1:0',
        token: 'preview',
        port: 0,
        pid: 0,
        version: 'preview'
      }),
    onState: unsub,
    onLog: unsub
  },
  secrets: {
    list: () => Promise.resolve([]),
    set: () => Promise.resolve([]),
    remove: () => Promise.resolve([]),
    push: () => Promise.resolve({ pushed: 0 })
  },
  providers: {
    search: () => Promise.resolve(emptyAggregate),
    onOutcome: unsub,
    health: () => Promise.resolve([]),
    metrics: () => Promise.resolve([]),
    metricsReset: () => Promise.resolve()
  },
  selection: {
    load: () => Promise.resolve({ notes: [], votes: {} }),
    apply: () => Promise.resolve({ notes: [], votes: {} })
  },
  fetchListing: () => Promise.reject(new Error('Indisponible en prévisualisation')),
  osmLodgings: () => Promise.resolve([]),
  readClipboard: () => Promise.resolve(''),
  pasteToken: () => Promise.resolve('preview'),
  bra: () => Promise.reject(new Error('Indisponible en prévisualisation')),
  onAirbnbPaste: unsub,
  airbnbScrape: () => Promise.resolve({ ok: false, error: 'Indisponible en prévisualisation' }),
  openExternal: (url: string) => {
    window.open(url, '_blank', 'noopener')
    return Promise.resolve()
  },
  appInfo: () =>
    Promise.resolve({ version: 'preview', platform: 'web', dataDir: '', logDir: '' })
}

;(window as unknown as { skitrack: unknown }).skitrack = skitrack

// Prévisualisation : ouvrir directement un écran via le hash de l'URL
// (#recherche, #logements, #offres…), sans dépendre d'un clic. `appState` lit
// `window.__DEMO_OVERRIDES__` au premier rendu. Uniquement pour la maquette.
const hash = location.hash.replace('#', '')
if (hash) {
  const [scr, extra] = hash.split('/')
  const overrides: Record<string, unknown> = { tab: scr }
  if (scr === 'logements') {
    overrides.lodgingDomainId = 1
    overrides.lodgPhase = 'results'
  }
  if (extra === 'dark') overrides.theme = 'dark'
  ;(window as unknown as { __DEMO_OVERRIDES__: unknown }).__DEMO_OVERRIDES__ = overrides
}
