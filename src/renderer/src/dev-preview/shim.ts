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
const hash = location.hash.replace(/^#\/?/, '')
if (hash) {
  const [scr, extra] = hash.split('/')
  const overrides: Record<string, unknown> = {}
  if (scr === 'logements' || scr === 'reservation') {
    overrides.lodgingDomainId = 1
    overrides.lodgPhase = 'results'
    // Trois annonces factices, tarifées pour ces dates exactement : sans elles
    // l'écran n'a rien à mettre en page (les vraies viennent d'un relevé, que
    // la prévisualisation ne fait pas). Elles ne sortent jamais d'ici.
    const checkIn = '2027-02-07'
    const checkOut = '2027-02-14'
    overrides.arrDate = checkIn
    overrides.depDate = checkOut
    overrides.imported = [
      ['Résidence Le Névé', 'Résidence', 6, 2, 46, '4,7', 128, 120, 3, 8, false, 'Centrale de station', 1290],
      ['Chalet Grand Bec', 'Chalet', 8, 4, 110, '4,9', 41, 0, 0, 0, true, 'Airbnb', 2480],
      ['Studio Bellevue', 'Studio', 2, 0, 24, '4,3', 76, 340, 6, 22, false, 'Booking', 690]
    ].map((row, i) => {
      const [name, type, pers, ch, m2, note, avis, dist, walk, den, skiIn, src, total] = row as [
        string, string, number, number, number, string, number, number, number, number, boolean, string, number
      ]
      return {
        id: 9001 + i,
        name,
        type,
        pers,
        ch,
        m2,
        note,
        avis,
        dist,
        walk,
        den,
        skiIn,
        src,
        pp: Math.round(total / Math.max(1, pers) / 7),
        lift: 'Télécabine',
        liftDist: dist,
        photo: name,
        annul: i !== 2,
        total,
        alt: 2100 + i * 60,
        stock: 2 + i,
        importDomainId: 1,
        priceConfidence: 'total_confirmed',
        priceCheckIn: checkIn,
        priceCheckOut: checkOut,
        accessComputed: true,
        url: 'https://example.com/annonce'
      }
    })
  }
  if (extra === 'dark') overrides.theme = 'dark'
  ;(window as unknown as { __DEMO_OVERRIDES__: unknown }).__DEMO_OVERRIDES__ = overrides
}
