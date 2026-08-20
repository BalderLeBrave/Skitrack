import { join } from 'node:path'
import { BrowserWindow, app, clipboard, ipcMain, shell } from 'electron'
import {
  IPC,
  type AirbnbScrapeOutcome,
  type AirbnbScrapeParams,
  type AppInfo,
  type SecretKey
} from '@shared/ipc-contract'
import { fetchBra } from './bra'
import { fetchListing } from './listing'
import { disposeProviders, providersHealth, providersMetrics, providersMetricsReset, searchProviders } from './providersBridge'
import { fetchOsmLodgings } from './providers/osm/osm'
import { closeAirbnbBrowser, scrapeAirbnbSearch } from './providers/airbnb/scrape'
import { getPairingToken, startPasteBridge, stopPasteBridge } from './pasteBridge'
import { decryptAll, deleteSecret, isEncryptionAvailable, listSecrets, setSecret } from './secrets'
import { Sidecar } from './sidecar'

const sidecar = new Sidecar()
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0f1620',
    title: 'SKITRACK',
    webPreferences: {
      // `.mjs` : le projet est en `"type": "module"`, electron-vite émet donc un
      // preload ESM. Electron ne l'accepte que hors sandbox — d'où `sandbox: false`
      // ci-dessous, qui reste sûr puisque `contextIsolation` est actif et que le
      // preload n'expose qu'une surface fermée (voir src/preload/index.ts).
      preload: join(__dirname, '../preload/index.mjs'),
      // Le renderer affiche des données tierces (descriptifs, photos) : il ne
      // doit avoir aucun accès direct à Node ni au système de fichiers.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Toute navigation hors de l'app part dans le navigateur système : c'est le
  // comportement voulu pour les deep-links (Airbnb, sites de stations) et cela
  // évite qu'une page tierce s'exécute dans une fenêtre disposant du preload.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isDev = process.env.ELECTRON_RENDERER_URL !== undefined
    const allowed = isDev ? url.startsWith(process.env.ELECTRON_RENDERER_URL!) : url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      if (/^https?:/.test(url)) void shell.openExternal(url)
    }
  })

  sidecar.on('state', (state) => mainWindow?.webContents.send('sidecar:state', state))
  sidecar.on('log', (line: string) => mainWindow?.webContents.send('sidecar:log', line))

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/** Pousse les clés déchiffrées au sidecar (en mémoire, jamais persistées côté Python). */
async function pushSecretsToSidecar(): Promise<{ pushed: number } | { error: string }> {
  const state = sidecar.getState()
  if (state.status !== 'ready') return { error: 'Sidecar non démarré' }
  const values = decryptAll()
  try {
    const resp = await fetch(`${state.baseUrl}/api/settings/secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Skitrack-Token': state.token },
      body: JSON.stringify({ values })
    })
    if (!resp.ok) return { error: `Sidecar HTTP ${resp.status}` }
    return { pushed: Object.keys(values).length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.sidecarInfo, () => ({ state: sidecar.getState(), log: sidecar.getLog() }))

  ipcMain.handle(IPC.sidecarRestart, async () => {
    const state = await sidecar.restart()
    if (state.status === 'ready') await pushSecretsToSidecar()
    return state
  })

  ipcMain.handle(IPC.secretsList, () => listSecrets())
  ipcMain.handle(IPC.secretsSet, async (_e, key: SecretKey, value: string) => {
    const result = setSecret(key, value)
    await pushSecretsToSidecar()
    return result
  })
  ipcMain.handle(IPC.secretsDelete, async (_e, key: SecretKey) => {
    const result = deleteSecret(key)
    await pushSecretsToSidecar()
    return result
  })
  ipcMain.handle(IPC.secretsPush, () => pushSecretsToSidecar())

  // Lecture d'une annonce : une page, à la demande de l'utilisateur. Le HTML
  // tiers est analysé ici comme du texte et n'atteint jamais le renderer.
  ipcMain.handle(IPC.listingFetch, (_e, url: string) => fetchListing(url))

  // Comparateur multi-sources. Les erreurs par connecteur sont dans la réponse,
  // pas levées : une source en panne ne doit pas vider le résultat des autres.
  ipcMain.handle(IPC.providersSearch, (e, params: Parameters<typeof searchProviders>[0], only?: string[]) =>
    searchProviders(params, only, (outcome) => {
      try {
        e.sender.send(IPC.providersOutcome, outcome)
      } catch {
        // Fenêtre fermée pendant le relevé.
      }
    })
  )
  ipcMain.handle(IPC.providersHealth, () => providersHealth())
  ipcMain.handle(IPC.providersMetrics, () => providersMetrics())
  ipcMain.handle(IPC.providersMetricsReset, () => {
    providersMetricsReset()
  })

  // Hébergements réels d'un domaine, depuis OpenStreetMap (ODbL). Sans prix :
  // chaque entrée est une porte vers une recherche Airbnb pré-remplie. Aucune
  // requête n'est faite vers Airbnb — voir providers/osm/osm.ts.
  ipcMain.handle(IPC.osmLodgings, (_e, query: Parameters<typeof fetchOsmLodgings>[0]) =>
    fetchOsmLodgings(query)
  )

  // Lecture du presse-papiers : sert à récupérer sans copier-coller manuel ce
  // que le marque-page Airbnb vient d'y déposer. Rien n'est écrit, rien n'est
  // envoyé ailleurs — la donnée est déjà sur la machine de l'utilisateur, qui
  // l'y a mise lui-même d'un clic.
  ipcMain.handle(IPC.clipboardRead, () => clipboard.readText())

  // Jeton d'appairage du marque-page : le renderer en a besoin pour fabriquer
  // l'URL du marque-page que l'utilisateur installera.
  ipcMain.handle(IPC.pasteToken, () => getPairingToken())

  // Scraping Airbnb (Puppeteer) : charge la page de recherche et lit
  // data-deferred-state-0. Contourne robots.txt — usage à vos risques.
  ipcMain.handle(
    IPC.airbnbScrape,
    async (_e, params: AirbnbScrapeParams): Promise<AirbnbScrapeOutcome> => {
      const outcome = await scrapeAirbnbSearch({
        city: params.city,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        adults: params.adults,
        children: params.children,
        infants: params.infants,
        pets: params.pets,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
        bedrooms: params.bedrooms,
        scrollCount: params.scrollCount,
        maxRetries: params.maxRetries,
        timeoutMs: params.timeoutMs
      })
      if (!outcome.ok) return outcome
      return {
        ok: true,
        payloadJson: JSON.stringify(outcome.payload),
        count: outcome.count,
        url: outcome.url,
        captchaSolved: outcome.captchaSolved,
        recaptchaV3Fallback: outcome.recaptchaV3Fallback,
        attempts: outcome.attempts
      }
    }
  )

  // Le bulletin d'avalanche est lu ici : la clé Météo-France reste dans le
  // processus main, le renderer ne reçoit que le niveau publié.
  ipcMain.handle(IPC.braFetch, (_e, massifCode: number, force?: boolean) => fetchBra(massifCode, force))

  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (!/^https?:\/\//.test(url)) throw new Error('Seuls http(s) sont autorisés')
    return shell.openExternal(url)
  })

  ipcMain.handle(
    IPC.appInfo,
    (): AppInfo => ({
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      userDataPath: app.getPath('userData'),
      platform: `${process.platform} ${process.arch}`,
      encryptionAvailable: isEncryptionAvailable()
    })
  )
}

// Une seule instance : deux sidecars sur la même base SQLite finiraient par
// se marcher dessus malgré le WAL.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(async () => {
    registerIpc()
    createWindow()
    // Oreille locale du marque-page : permet au relevé Airbnb d'arriver
    // directement dans l'application, sans passer par le presse-papiers.
    startPasteBridge(() => mainWindow)
    const state = await sidecar.start()
    if (state.status === 'ready') await pushSecretsToSidecar()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', async (event) => {
    disposeProviders()
    stopPasteBridge()
    await closeAirbnbBrowser()
    if (sidecar.getState().status === 'stopped') return
    event.preventDefault()
    await sidecar.stop()
    app.exit(0)
  })
}
