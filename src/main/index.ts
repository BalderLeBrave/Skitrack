import { join } from 'node:path'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { BrowserWindow, Notification, app, clipboard, dialog, ipcMain, shell } from 'electron'
import {
  IPC,
  type AirbnbScrapeOutcome,
  type AirbnbScrapeParams,
  type AppInfo,
  type NotifyParams,
  type SecretKey,
  type TripExportResult,
  type TripImportResult
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

  /**
   * Notification native — alertes de baisse de prix.
   *
   * Le titre et le corps sont tronqués ici et non chez l'appelant : c'est le
   * seul endroit par lequel tout passe. Un système qui n'accepte pas les
   * notifications (session sans bureau, réglage désactivé) renvoie `false`
   * plutôt que de lever : une alerte non distribuée ne doit pas casser le tour
   * de relevé qui l'a produite.
   */
  ipcMain.handle(IPC.notify, (_e, params: NotifyParams): boolean => {
    if (!Notification.isSupported()) return false
    try {
      new Notification({
        title: String(params.title ?? '').slice(0, 120),
        body: String(params.body ?? '').slice(0, 400)
      }).show()
      return true
    } catch {
      return false
    }
  })

  /**
   * Export d'un séjour en fichier `.skitrip`.
   *
   * L'écriture passe par une boîte de dialogue : l'application ne choisit pas
   * où déposer un fichier chez l'utilisateur. Le contenu est borné — un séjour
   * encodé tient en quelques centaines d'octets, et rien ne justifie qu'un
   * appel du renderer écrive un mégaoctet sur le disque.
   */
  ipcMain.handle(
    IPC.tripExport,
    async (_e, content: string, suggestedName: string): Promise<TripExportResult> => {
      if (typeof content !== 'string' || content.length === 0 || content.length > 300_000) {
        return { saved: false, canceled: false, error: 'Contenu de séjour invalide' }
      }
      // Le nom proposé vient du renderer : on n'en garde que la feuille, et
      // seulement des caractères sûrs. Un `..\..\` dans un nom suggéré ne
      // doit pas pouvoir désigner un dossier.
      const safeName = (suggestedName || 'sejour.skitrip').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 80)
      try {
        const result = await dialog.showSaveDialog({
          title: 'Exporter le séjour',
          defaultPath: safeName,
          filters: [{ name: 'Séjour SKITRACK', extensions: ['skitrip'] }]
        })
        if (result.canceled || !result.filePath) return { saved: false, canceled: true, error: null }
        await writeFile(result.filePath, content, 'utf-8')
        return { saved: true, canceled: false, error: null }
      } catch (err) {
        return { saved: false, canceled: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  /**
   * Import d'un séjour depuis un fichier.
   *
   * Le contenu remonte brut au renderer, qui le décode et le valide avec le
   * même code que le stockage local. Le main ne l'interprète pas : il n'a pas
   * à connaître le format, et un second décodeur finirait par diverger.
   */
  ipcMain.handle(IPC.tripImport, async (): Promise<TripImportResult> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Ouvrir un séjour',
        properties: ['openFile'],
        filters: [{ name: 'Séjour SKITRACK', extensions: ['skitrip'] }]
      })
      const file = result.filePaths[0]
      if (result.canceled || !file) return { content: null, canceled: true, error: null }
      // La taille est contrôlée **avant** la lecture : le filtre d'extension de
      // la boîte de dialogue se contourne, et charger plusieurs gigaoctets en
      // mémoire pour les refuser ensuite n'est pas un garde-fou.
      const info = await stat(file)
      if (!info.isFile() || info.size > 300_000) {
        return { content: null, canceled: false, error: 'Fichier trop volumineux pour un séjour' }
      }
      const content = await readFile(file, 'utf-8')
      return { content, canceled: false, error: null }
    } catch (err) {
      return { content: null, canceled: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  /**
   * Presse-papier, en écriture : uniquement un lien de séjour, borné.
   *
   * Le préfixe est vérifié ici et pas seulement chez l'appelant. Un commentaire
   * qui décrit une garantie que le code n'impose pas est ce qui fait qu'on ne
   * la revérifie plus jamais.
   */
  ipcMain.handle(IPC.clipboardWrite, (_e, text: string): boolean => {
    if (typeof text !== 'string' || text.length === 0 || text.length > 8_000) return false
    if (!/^skitrack:\/\/trip\//i.test(text)) return false
    clipboard.writeText(text)
    return true
  })

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

/**
 * Protocole `skitrack://` — partage de séjour.
 *
 * Enregistrer un protocole écrit dans le registre Windows. C'est fait une fois
 * au démarrage, et c'est réversible depuis les réglages du système.
 *
 * En développement, `process.execPath` est l'exécutable d'Electron et non
 * l'application : sans les arguments explicites, le système rappellerait
 * Electron sans savoir quel projet ouvrir. C'est la raison du branchement.
 */
function registerTripProtocol(): void {
  try {
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('skitrack', process.execPath, [join(process.argv[1])])
    } else {
      app.setAsDefaultProtocolClient('skitrack')
    }
  } catch {
    // Registre inaccessible (poste verrouillé, installation sans droits) :
    // le partage par fichier `.skitrip` reste entier. Ce n'est pas bloquant.
  }
}

/** Premier lien `skitrack://` trouvé dans une ligne de commande. */
function tripUrlFrom(argv: readonly string[]): string | null {
  return argv.find((arg) => /^skitrack:\/\//i.test(arg)) ?? null
}

/**
 * Pousse un lien entrant vers le renderer.
 *
 * Le main ne décode rien et n'applique rien : il transmet la chaîne telle
 * quelle. Le renderer la valide et **prévisualise** avant d'écraser quoi que
 * ce soit — un lien reçu d'un tiers ne doit jamais remplacer une recherche en
 * cours sans que personne ne l'ait vu.
 */
let pendingTripUrl: string | null = null

function deliverTripUrl(url: string | null): void {
  if (!url) return
  // Le lien est TOUJOURS mis en attente avant d'être poussé. Sur macOS,
  // `open-url` précède `whenReady()` quand l'application est lancée par le
  // lien : la fenêtre n'existe pas encore. Sur Windows le lien est dans
  // `argv`, mais `webContents.send` tombe dans le vide tant que l'écouteur
  // React n'est pas monté. Le renderer vient chercher ce qui l'attend dès que
  // son écouteur est en place (`trip:pending`), ce qui couvre les deux cas.
  pendingTripUrl = url
  if (!mainWindow) return
  const send = (): void => {
    if (pendingTripUrl == null) return
    mainWindow?.webContents.send(IPC.tripOpened, pendingTripUrl)
    pendingTripUrl = null
  }
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

// Une seule instance : deux sidecars sur la même base SQLite finiraient par
// se marcher dessus malgré le WAL.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    // Windows et Linux : une seconde instance lancée par le système porte le
    // lien dans sa ligne de commande. C'est le chemin normal d'un clic sur un
    // `skitrack://` quand l'application est déjà ouverte.
    deliverTripUrl(tripUrlFrom(argv))
  })

  // macOS : le lien arrive par un événement, pas par la ligne de commande.
  app.on('open-url', (event, url) => {
    event.preventDefault()
    deliverTripUrl(url)
  })

  void app.whenReady().then(async () => {
    registerIpc()
    registerTripProtocol()
    createWindow()
    // Application lancée *par* un lien : l'URL est déjà dans notre propre
    // ligne de commande.
    deliverTripUrl(tripUrlFrom(process.argv))
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
