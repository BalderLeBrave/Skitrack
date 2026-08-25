import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AirbnbScrapeOutcome,
  type AirbnbScrapeParams,
  type AppInfo,
  type BraBulletin,
  type ListingExtract,
  type NotifyParams,
  type OsmLodgingQuery,
  type OsmLodgingResult,
  type ProviderAggregate,
  type ProviderOutcome,
  type ProviderSearchParams,
  type SecretKey,
  type SecretPresence,
  type SidecarState,
  type TripExportResult,
  type TripImportResult
} from '@shared/ipc-contract'

/**
 * Surface exposée au renderer. Volontairement étroite : pas de `ipcRenderer`
 * brut, pas d'accès `fs`, pas d'`exec`. Le renderer ne peut faire que ce qui
 * est listé ici.
 *
 * Les valeurs de clés d'API ne traversent jamais ce pont dans le sens
 * main -> renderer : `listSecrets` ne renvoie que des booléens de présence.
 */
const api = {
  sidecar: {
    info: (): Promise<{ state: SidecarState; log: string[] }> => ipcRenderer.invoke(IPC.sidecarInfo),
    restart: (): Promise<SidecarState> => ipcRenderer.invoke(IPC.sidecarRestart),
    onState: (cb: (state: SidecarState) => void): (() => void) => {
      const handler = (_e: unknown, state: SidecarState): void => cb(state)
      ipcRenderer.on('sidecar:state', handler)
      return () => ipcRenderer.off('sidecar:state', handler)
    },
    onLog: (cb: (line: string) => void): (() => void) => {
      const handler = (_e: unknown, line: string): void => cb(line)
      ipcRenderer.on('sidecar:log', handler)
      return () => ipcRenderer.off('sidecar:log', handler)
    }
  },
  secrets: {
    list: (): Promise<SecretPresence[]> => ipcRenderer.invoke(IPC.secretsList),
    set: (key: SecretKey, value: string): Promise<SecretPresence[]> =>
      ipcRenderer.invoke(IPC.secretsSet, key, value),
    remove: (key: SecretKey): Promise<SecretPresence[]> => ipcRenderer.invoke(IPC.secretsDelete, key),
    push: (): Promise<{ pushed: number } | { error: string }> => ipcRenderer.invoke(IPC.secretsPush)
  },
  /** Notification native : le renderer demande, le main décide. */
  notify: (params: NotifyParams): Promise<boolean> => ipcRenderer.invoke(IPC.notify, params),
  /** Partage de séjour : fichier `.skitrip`, presse-papier, lien entrant. */
  trip: {
    export: (content: string, suggestedName: string): Promise<TripExportResult> =>
      ipcRenderer.invoke(IPC.tripExport, content, suggestedName),
    import: (): Promise<TripImportResult> => ipcRenderer.invoke(IPC.tripImport),
    copyLink: (link: string): Promise<boolean> => ipcRenderer.invoke(IPC.clipboardWrite, link),
    /**
     * Lien `skitrack://` ouvert depuis le système. Le renderer prévisualise
     * avant d'appliquer : jamais d'écrasement silencieux de la recherche.
     */
    onOpened: (cb: (url: string) => void): (() => void) => {
      const handler = (_e: unknown, url: string): void => cb(url)
      ipcRenderer.on(IPC.tripOpened, handler)
      return () => ipcRenderer.removeListener(IPC.tripOpened, handler)
    }
  },
  /** Comparateur multi-sources : Airbnb via MCP, autres sources en deep-link. */
  providers: {
    search: (params: ProviderSearchParams, only?: string[]): Promise<ProviderAggregate> =>
      ipcRenderer.invoke(IPC.providersSearch, params, only),
    /**
     * Chaque source qui répond pendant un `search` pousse un outcome ici.
     * Se désabonner au démontage / fin de relevé.
     */
    onOutcome: (cb: (outcome: ProviderOutcome) => void): (() => void) => {
      const handler = (_e: unknown, outcome: ProviderOutcome): void => cb(outcome)
      ipcRenderer.on(IPC.providersOutcome, handler)
      return () => ipcRenderer.removeListener(IPC.providersOutcome, handler)
    },
    health: (): Promise<
      { name: string; reachable: boolean; detail: string; registered: boolean }[]
    > => ipcRenderer.invoke(IPC.providersHealth),
    metrics: (): Promise<
      {
        provider: string
        calls: number
        errors: number
        totalMs: number
        results: number
        priced: number
        lastError: string | null
        lastAt: string | null
        avgMs?: number
        priceRate?: number | null
      }[]
    > => ipcRenderer.invoke(IPC.providersMetrics),
    metricsReset: (): Promise<void> => ipcRenderer.invoke(IPC.providersMetricsReset)
  },
  /** Lit les métadonnées publiques d'une annonce que l'utilisateur a collée. */
  fetchListing: (url: string): Promise<ListingExtract> => ipcRenderer.invoke(IPC.listingFetch, url),
  /** Hébergements réels du domaine (OpenStreetMap), sans prix, prêts à ouvrir sur Airbnb. */
  osmLodgings: (query: OsmLodgingQuery): Promise<OsmLodgingResult[]> =>
    ipcRenderer.invoke(IPC.osmLodgings, query),
  /** Contenu texte du presse-papiers (récupération du collage Airbnb). */
  readClipboard: (): Promise<string> => ipcRenderer.invoke(IPC.clipboardRead),
  /** Jeton d'appairage du marque-page, pour fabriquer son URL. */
  pasteToken: (): Promise<string> => ipcRenderer.invoke(IPC.pasteToken),
  /** Bulletin d'avalanche d'un massif Météo-France. La clé d'API reste côté main. */
  bra: (massifCode: number, force?: boolean): Promise<BraBulletin> =>
    ipcRenderer.invoke(IPC.braFetch, massifCode, force),
  /** Relevé Airbnb poussé directement par le marque-page. */
  onAirbnbPaste: (cb: (payload: string) => void): (() => void) => {
    const handler = (_e: unknown, payload: string): void => cb(payload)
    ipcRenderer.on('airbnb:paste', handler)
    return () => ipcRenderer.removeListener('airbnb:paste', handler)
  },
  /**
   * Recherche Airbnb automatisée (Puppeteer) : charge la page et lit
   * data-deferred-state-0. Contourne robots.txt.
   */
  airbnbScrape: (params: AirbnbScrapeParams): Promise<AirbnbScrapeOutcome> =>
    ipcRenderer.invoke(IPC.airbnbScrape, params),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.openExternal, url),
  appInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo)
}

contextBridge.exposeInMainWorld('skitrack', api)

export type SkitrackApi = typeof api
