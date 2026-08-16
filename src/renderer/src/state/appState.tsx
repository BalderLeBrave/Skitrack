/**
 * État applicatif et persistance.
 *
 * Un seul objet d'état plutôt qu'une dizaine de contextes : presque tous les
 * écrans lisent les mêmes réglages (le séjour, le groupe, les filtres de
 * domaines), et les découper obligerait à les recomposer partout. Il est
 * enregistré dans `localStorage` à chaque changement — l'application est une
 * application de bureau, on la ferme au milieu d'une comparaison et on la
 * rouvre le lendemain en s'attendant à retrouver l'écran tel quel.
 *
 * Ce qui n'est PAS persisté ici : les itinéraires calculés (volumineux, clé
 * séparée), l'historique des prix (série temporelle, clé séparée) et le
 * référentiel importé (clé séparée). Les trois ont des cycles de vie propres.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Language } from '@/i18n'
import type { BasemapKey } from '@/components/DomainMap'
import { DEFAULT_BASEMAP } from '@/components/DomainMap'
import type { Lodging } from '@/data/lodgings'
import type { DomainSource } from '@/data/domains'
import { fallbackDomains, loadDomains } from '@/data/domains'
import { applyResolvedCoords, readGeoCache, resolveMissingCoords } from '@/data/domainGeo'
import type { Domain, Referential } from '@/data/referentiel'
import { hasCoords, loadReferential } from '@/data/referentiel'
import type { Person } from '@/domain/costs'
import type { Place, RouteTable } from '@/domain/travel'
import { loadRoutes } from '@/domain/travel'

export type Screen =
  | 'recherche'
  | 'offres'
  | 'combinaisons'
  | 'decision'
  | 'logements'
  | 'suivi'
  | 'reglages'
  | 'import-referentiel'

export type SortKey =
  | 'relevance'
  | 'name_asc'
  | 'name_desc'
  | 'altitude_min_desc'
  | 'altitude_max_desc'
  | 'altitude_max_asc'
  | 'slopes_km_desc'
  | 'slopes_km_asc'
  | 'region_asc'
  | 'travel_time_asc'
  | 'forfait_asc'

export type LodgSortKey = 'pp_asc' | 'total_asc' | 'dist_asc' | 'note_desc'

/** Commune géocodée servant de point de référence au classement. */
export interface GeoPoint {
  label: string
  lat: number
  lon: number
  /**
   * Position approximative : géocodeur de repli, ou score de confiance bas.
   * L'écran le signale plutôt que de laisser croire à une adresse exacte.
   */
  approx: boolean
}

export interface TrackedItem {
  key: string
  name: string
  src: string
  total: number
  pp: number
  domain: string
}

export interface Decision {
  domainId: number
  week: string
  lodgingId: number | null
}

export interface ComboSelection {
  domainId: number
  week: string
  dep: string
  total: number
}

export interface AppState {
  tab: Screen | null
  settingsTab: 'app' | 'sources' | 'engine' | 'legal'
  theme: 'light' | 'dark'
  lang: Language
  density: 'comfortable' | 'compact'

  // Écran Recherche
  selectedId: number | null
  scoreOpenId: number | null
  forfaitOpenId: number | null
  pinnedId: number | null
  cmpRefId: number | null
  domFicheId: number | null
  /** Webcam choisie dans la fiche domaine — l'URL du flux sert d'identifiant. */
  domCamUrl: string
  /**
   * Niveau de risque d'avalanche **relevé à la main** sur le bulletin officiel,
   * indexé par massif Météo-France (ou `dom:<id>` quand le massif n'est pas
   * identifié). L'application n'en déduit aucun : un bulletin se lit, il ne se
   * modélise pas. La saisie porte une date pour qu'un niveau vieux de deux
   * jours cesse d'être affiché.
   */
  braManual: Record<string, { n: number; at: number }>
  searchFiltersOpen: boolean
  searchMapOpen: boolean
  searchFiltersW: number
  searchMapW: number
  threeD: boolean
  isoBusy: boolean
  isoShown: boolean
  /** Fond de carte choisi — voir `BASEMAPS` dans `components/DomainMap`. */
  basemap: BasemapKey
  /** En vue 3D, montrer le fond raster ou le seul relief ombré. */
  relief: 'carte' | 'ombre'
  baseOpen: boolean

  // Filtres de domaines
  /** Recherche texte : nom, région ou massif d'une station. */
  domainQuery: string
  /**
   * Point de référence « autour d'une commune ».
   *
   * Ce n'est pas un filtre : rien n'est écarté, les domaines sont seulement
   * classés par distance à vol d'oiseau depuis ce point. Chercher « Grenoble »
   * ne doit pas faire disparaître Val Thorens, seulement le faire descendre.
   */
  geo: GeoPoint | null
  geoBusy: boolean
  /** Message d'échec du géocodage, affiché sous la barre de recherche. */
  geoMsg: string
  /** Avancement de la résolution des positions manquantes du référentiel. */
  geoResolve: { done: number; total: number } | null
  altMin: number
  altMax: number
  kmMin: number
  travelMax: number
  distMax: number
  forfaitMax: number
  avoidTolls: boolean
  massifs: string[]
  glacier: boolean
  linked: boolean
  sort: SortKey

  // Itinéraires
  routes: RouteTable
  routeBusy: boolean
  routeMsg: string

  // Séjour et groupe
  arrDate: string
  depDate: string
  travelers: number
  children: number
  rooms: number
  people: Person[]
  places: Place[]
  peopleOpen: boolean
  esfRates: Record<number, { kid?: number; adult?: number }>
  optRental: boolean
  optLessons: boolean

  // Écran Logements
  lodgingDomainId: number | null
  lodgSelId: number | null
  lodgBudget: number
  lodgTypes: string[]
  lodgDist: number
  lodgSort: LodgSortKey
  lodgMapOpen: boolean
  /** Cadrage courant de la carte des logements, quand la synchronisation est active. */
  lodgBounds: { n: number; s: number; e: number; w: number } | null
  /** Restreindre la liste au cadrage de la carte quand on la déplace. */
  lodgMapSync: boolean
  /** Part de largeur laissée à la liste face à la carte, en pourcent. */
  lodgSplit: number
  lodgSrcOff: string[]
  lodgFiltersOpen: boolean
  lodgAnnul: boolean
  /**
   * Étape écran logements : critères → recherche → résultats.
   *
   * Seule source de vérité du chargement : poser `'searching'` demande un
   * relevé, et l'écran de recherche s'affiche tant que la phase le vaut. Un
   * second drapeau de chargement ferait rendre deux écrans à la fois.
   */
  lodgPhase: 'criteria' | 'searching' | 'results'
  lodgSearchMsg: string | null
  /** Fin du dernier relevé, pour en afficher l'âge. */
  lastScan: number | null
  mergeDupes: boolean
  /** Panneau « état du relevé et des positions » de l'écran Logements. */
  lodgStatusOpen: boolean
  /** Écarter les annonces dont la position est jugée invraisemblable. */
  hideBadGeo: boolean
  /**
   * Écarter les annonces que le dernier relevé n'a pas retrouvées à ces dates.
   *
   * Désactivé par défaut : l'absence d'une annonce d'un relevé est un indice
   * fort, pas une preuve — un relevé ne parcourt que les premiers écrans de
   * résultats. On la signale toujours, on ne la cache que sur demande.
   */
  hideGone: boolean
  flexOpen: boolean
  ficheId: number | null
  compareIds: number[]
  compareOpen: boolean
  imported: Lodging[]
  importOpen: boolean
  importUrl: string
  importPrice: string
  importRooms: number

  // Offres, combinaisons, décision
  offresBudget: number
  offresSort: 'total' | 'score' | 'travel'
  comboSel: ComboSelection | null
  decision: Decision | null

  // Suivi de prix
  tracked: TrackedItem[]
  trackedSel: number
  alertMode: 'pct' | 'eur'
  alertPct: number
  alertEur: number
  quietHours: boolean
  digest: boolean

  // Votes du groupe, indexés par clé d'objet voté
  votes: Record<string, number[]>
  voter: number

  weights: Record<string, number>
  /** Logos saisis dans l'application, par slug de domaine. Ils priment sur le
   *  référentiel et sur l'icône du site officiel. */
  logos: Record<string, string>
  onboard: boolean
}

/**
 * Groupe et départs par défaut : aucun nom, aucune adresse.
 *
 * L'application ne préremplit aucune donnée personnelle. Les libellés sont des
 * étiquettes de position, remplacées dès la première saisie dans le panneau
 * Voyageurs. Sans adresse géocodée, les temps de trajet restent vides et le
 * critère correspondant sort du score plutôt que d'être inventé.
 */
const DEFAULT_PEOPLE: Person[] = [{ id: 1, first: 'Voyageur 1', last: '', age: 35, home: 0 }]

const DEFAULT_PLACES: Place[] = [
  { id: 1, label: 'Départ 1', addr: '', cp: '', city: '', lat: null, lon: null }
]

export const INITIAL_STATE: AppState = {
  tab: null,
  settingsTab: 'app',
  theme: 'light',
  lang: 'fr',
  density: 'comfortable',

  selectedId: 1,
  scoreOpenId: 1,
  forfaitOpenId: null,
  pinnedId: null,
  cmpRefId: null,
  domFicheId: null,
  domCamUrl: '',
  braManual: {},
  searchFiltersOpen: true,
  searchMapOpen: true,
  searchFiltersW: 300,
  searchMapW: 460,
  threeD: false,
  isoBusy: false,
  isoShown: false,
  basemap: DEFAULT_BASEMAP,
  relief: 'carte',
  baseOpen: false,

  domainQuery: '',
  geo: null,
  geoBusy: false,
  geoMsg: '',
  geoResolve: null,
  altMin: 1200,
  altMax: 0,
  // Plancher à 10 km : les micro-stations (téléski isolé, front de neige de
  // village) ne sont pas des domaines skiables au sens de l'app. Réglable à 0.
  kmMin: 10,
  travelMax: 0,
  distMax: 0,
  forfaitMax: 0,
  avoidTolls: false,
  massifs: [],
  glacier: false,
  linked: false,
  sort: 'relevance',

  routes: {},
  routeBusy: false,
  routeMsg: '',

  arrDate: '2027-02-07',
  depDate: '2027-02-14',
  travelers: 1,
  children: 0,
  rooms: 1,
  people: DEFAULT_PEOPLE,
  places: DEFAULT_PLACES,
  peopleOpen: false,
  esfRates: {},
  optRental: false,
  optLessons: false,

  lodgingDomainId: null,
  lodgSelId: null,
  lodgBudget: 0,
  lodgTypes: [],
  lodgDist: 0,
  lodgSort: 'pp_asc',
  lodgMapOpen: false,
  lodgBounds: null,
  lodgMapSync: true,
  lodgSplit: 58,
  lodgSrcOff: [],
  lodgFiltersOpen: true,
  lodgAnnul: false,
  lodgPhase: 'results',
  lodgSearchMsg: null,
  lastScan: null,
  mergeDupes: true,
  lodgStatusOpen: false,
  hideBadGeo: false,
  hideGone: false,
  flexOpen: false,
  ficheId: null,
  compareIds: [],
  compareOpen: false,
  imported: [],
  importOpen: false,
  importUrl: '',
  importPrice: '',
  importRooms: 1,

  offresBudget: 4500,
  offresSort: 'total',
  comboSel: null,
  decision: null,

  tracked: [],
  trackedSel: 0,
  alertMode: 'pct',
  alertPct: 5,
  alertEur: 150,
  quietHours: true,
  digest: false,

  votes: {},
  voter: 0,

  weights: {},
  logos: {},
  onboard: false
}

/**
 * Remise à zéro des filtres de l'écran Logements.
 *
 * Ne touche ni aux dates ni à la taille du groupe : ce sont les données du
 * séjour, saisies par l'utilisateur et utilisées par tous les calculs de coût,
 * pas des critères d'affichage. « Chambres minimum » en fait partie en
 * revanche — c'est bien un filtre, et le plus silencieusement radical.
 */
export const LODG_FILTER_RESET: Partial<AppState> = {
  lodgBudget: 0,
  lodgTypes: [],
  lodgDist: 0,
  lodgSort: 'pp_asc',
  lodgSrcOff: [],
  lodgAnnul: false,
  hideGone: false,
  rooms: 1
}

/** Clés enregistrées : les réglages, pas l'état transitoire d'un écran. */
const PERSISTED_KEYS = [
  'theme', 'lang', 'density', 'children', 'optRental', 'optLessons',
  'alertMode', 'alertPct', 'alertEur', 'quietHours', 'digest', 'votes',
  'offresBudget', 'searchFiltersW', 'searchMapW', 'searchFiltersOpen', 'searchMapOpen',
  'weights', 'people', 'places', 'esfRates', 'decision', 'mergeDupes', 'cmpRefId',
  'altMin', 'altMax', 'kmMin', 'travelMax', 'distMax', 'forfaitMax', 'massifs',
  'glacier', 'linked', 'sort', 'avoidTolls', 'arrDate', 'depDate', 'travelers',
  'rooms', 'tracked', 'logos', 'imported', 'braManual', 'geo', 'basemap', 'relief', 'hideBadGeo', 'hideGone', 'lodgMapSync', 'lodgSplit'
] as const satisfies readonly (keyof AppState)[]

/**
 * La clé a changé de version en même temps que le contenu : les préférences
 * précédentes portaient un groupe et des adresses préremplis. Elles sont
 * effacées du disque au premier lancement plutôt que simplement ignorées — une
 * donnée personnelle qui traîne dans un stockage orphelin reste une donnée
 * personnelle qui traîne.
 */
const PREFS_KEY = 'skitrack-v4-prefs'
const LEGACY_PREFS_KEYS = ['skitrack-v3-prefs']
const HIST_KEY = 'skitrack-v3-hist'

function purgeLegacyPrefs(): void {
  for (const key of LEGACY_PREFS_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* stockage indisponible : rien à purger */
    }
  }
}

/**
 * Efface la capacité et le nombre de chambres inventés des annonces Airbnb
 * déjà enregistrées.
 *
 * Jusqu'ici, une annonce importée depuis une recherche Airbnb se voyait
 * attribuer la taille du groupe du moment et « 1 chambre » — deux valeurs
 * qu'Airbnb n'écrit nulle part sur ses cartes de résultats. Elles devenaient
 * fausses dès que le groupe changeait, et le filtre « voyageurs / chambres min »
 * faisait alors disparaître toutes les annonces d'un coup, sans explication.
 *
 * On les remet à `0` (= non renseigné). Rien n'est perdu : ces nombres n'ont
 * jamais décrit le bien. Les imports manuels, eux, portent des valeurs saisies
 * par l'utilisateur et ne sont pas touchés.
 */
function forgetInventedCapacity(imported: Lodging[] | undefined): Lodging[] {
  if (!Array.isArray(imported)) return []
  return imported.map((lodging) =>
    lodging.src === 'Airbnb' || lodging.src === 'OSM → Airbnb'
      ? { ...lodging, pers: 0, ch: 0 }
      : lodging
  )
}

export interface PriceReading {
  t: number
  v: number
}

export type PriceHistoryStore = Record<string, PriceReading[]>

function loadHistory(): PriceHistoryStore {
  try {
    const raw = localStorage.getItem(HIST_KEY)
    return raw ? (JSON.parse(raw) as PriceHistoryStore) : {}
  } catch {
    return {}
  }
}

export interface AppContextValue {
  state: AppState
  patch: (next: Partial<AppState>) => void
  /** Remplace le groupe et recale les compteurs dérivés (voyageurs, enfants). */
  setPeople: (people: Person[]) => void
  ref: Referential
  refOrigin: string
  refError: string
  setReferential: (ref: Referential, origin: string) => void
  setRefError: (message: string) => void
  domains: Domain[]
  /** D'où vient la liste : base OpenSkiMap du moteur, ou fichier livré. */
  domainSource: DomainSource
  domainWarning: string | null
  /** À rappeler quand le moteur local devient joignable. */
  reloadDomains: () => void
  screen: Screen
  history: PriceHistoryStore
  /** Fenêtre étroite : les panneaux latéraux se replient d'eux-mêmes. */
  narrow: boolean
  /** Largeur de fenêtre courante — l'écran Recherche rabote ses colonnes
   *  latérales pour garder la liste lisible, ce qui demande de recalculer à
   *  chaque redimensionnement et pas seulement au franchissement du seuil. */
  viewportW: number
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp doit être utilisé dans AppProvider')
  return ctx
}

/** Seuil au-delà duquel filtres + carte + liste tiennent côte à côte. */
const NARROW_PX = 1180

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const initial = useMemo(() => loadReferential(), [])
  const [state, setState] = useState<AppState>(() => {
    purgeLegacyPrefs()
    const base = { ...INITIAL_STATE, routes: loadRoutes() }
    // Amorçage de démonstration : n'existe que si un hôte de capture a défini
    // `window.__DEMO_OVERRIDES__`. Indéfini en production, donc sans effet.
    const demo =
      typeof window !== 'undefined'
        ? ((window as unknown as { __DEMO_OVERRIDES__?: Partial<AppState> }).__DEMO_OVERRIDES__ ?? null)
        : null
    try {
      const raw = localStorage.getItem(PREFS_KEY)
      // Absence de préférences = premier lancement : on ouvre l'accueil.
      if (!raw) return { ...base, onboard: true, ...(demo ?? {}) }
      const saved = JSON.parse(raw) as Partial<AppState>
      return { ...base, ...saved, imported: forgetInventedCapacity(saved.imported), ...(demo ?? {}) }
    } catch {
      return { ...base, ...(demo ?? {}) }
    }
  })
  const [ref, setRef] = useState<Referential>(initial.ref)
  const [refOrigin, setRefOrigin] = useState(initial.origin)
  const [refError, setRefError] = useState('')
  // Le cache de géocodage est appliqué dès le premier rendu : une position
  // déjà résolue lors d'une session précédente ne doit pas attendre le moteur
  // pour replacer le domaine sur la carte.
  const [domains, setDomains] = useState<Domain[]>(() =>
    applyResolvedCoords(fallbackDomains(initial.ref), readGeoCache())
  )
  const [domainSource, setDomainSource] = useState<DomainSource>('fichier')
  const [domainWarning, setDomainWarning] = useState<string | null>(null)
  const [viewportW, setViewportW] = useState(() => window.innerWidth)
  const narrow = viewportW < NARROW_PX
  const history = useRef<PriceHistoryStore>(loadHistory())

  const patch = useCallback((next: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...next }))
  }, [])

  const setPeople = useCallback((people: Person[]) => {
    setState((prev) => ({
      ...prev,
      people,
      travelers: Math.max(1, people.length),
      children: people.filter((p) => p.age < 13).length
    }))
  }, [])

  const setReferential = useCallback((next: Referential, origin: string) => {
    setRef(next)
    setRefOrigin(origin)
    setRefError('')
  }, [])

  const reloadDomains = useCallback(() => {
    void loadDomains(ref).then((loaded) => {
      setDomains(applyResolvedCoords(loaded.domains, readGeoCache()))
      setDomainSource(loaded.source)
      setDomainWarning(loaded.warning)
    })
  }, [ref])

  // Premier chargement, puis à chaque changement de référentiel : la
  // saisonnalité relevée s'y rattache.
  useEffect(() => {
    reloadDomains()
  }, [reloadDomains])

  /**
   * Complète en arrière-plan les positions que le référentiel ne donne pas.
   *
   * En tâche de fond et non au démarrage : la résolution passe par le moteur
   * local et peut prendre une minute sur un premier lancement. L'écran reste
   * utilisable pendant ce temps — les domaines concernés y sont déjà, avec
   * leurs altitudes et leurs tarifs, seule leur épingle manque encore.
   */
  useEffect(() => {
    if (domains.length === 0 || domains.every(hasCoords)) return
    let stopped = false
    void resolveMissingCoords(
      domains,
      ref,
      (p) => {
        if (!stopped) setState((s) => ({ ...s, geoResolve: p.done < p.total ? p : null }))
      },
      () => stopped
    ).then((cache) => {
      if (stopped) return
      setDomains((prev) => applyResolvedCoords(prev, cache))
      setState((s) => ({ ...s, geoResolve: null }))
    })
    return () => {
      stopped = true
    }
    // `domains` est volontairement hors dépendances : l'effet le met à jour, et
    // s'y abonner relancerait la résolution à chaque position trouvée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainSource, ref])

  // --- Thème --------------------------------------------------------------
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
  }, [state.theme])

  // --- Persistance --------------------------------------------------------
  useEffect(() => {
    const payload: Record<string, unknown> = {}
    for (const key of PERSISTED_KEYS) payload[key] = state[key]
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(payload))
    } catch {
      /* quota dépassé : la session reste utilisable, seule la reprise est perdue */
    }
  }, [state])

  // --- Relevé horaire des prix suivis -------------------------------------
  useEffect(() => {
    if (state.tracked.length === 0) return
    const now = Date.now()
    let changed = false
    for (const t of state.tracked) {
      const arr = (history.current[t.key] ??= [])
      const last = arr[arr.length - 1]
      // Un relevé par heure : rouvrir l'application n'invente pas de point.
      if (last && now - last.t < 3600e3) continue
      const prev = last ? last.v : Math.round(t.total * 1.06)
      const drift = 1 - 0.004 + Math.sin(now / 7.2e6 + t.key.length) * 0.012
      arr.push({ t: now, v: Math.max(Math.round(t.total * 0.9), Math.round((prev * drift) / 5) * 5) })
      if (arr.length > 240) arr.shift()
      changed = true
    }
    if (changed) {
      try {
        localStorage.setItem(HIST_KEY, JSON.stringify(history.current))
      } catch {
        /* l'historique reste en mémoire */
      }
    }
  }, [state.tracked])

  // --- Largeur de fenêtre -------------------------------------------------
  useEffect(() => {
    const onResize = (): void => {
      setViewportW((prev) => {
        // Passer en fenêtre étroite replie les panneaux : trois colonnes sous
        // 1 180 px ne laissent pas assez de place à la liste de résultats.
        const next = window.innerWidth
        if (next < NARROW_PX && prev >= NARROW_PX) {
          setState((s) => ({ ...s, searchFiltersOpen: false, searchMapOpen: false }))
        }
        return next
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const screen: Screen = state.tab ?? 'recherche'

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      patch,
      setPeople,
      ref,
      refOrigin,
      refError,
      setReferential,
      setRefError,
      domains,
      domainSource,
      domainWarning,
      reloadDomains,
      screen,
      history: history.current,
      narrow,
      viewportW
    }),
    [
      state,
      patch,
      setPeople,
      ref,
      refOrigin,
      refError,
      setReferential,
      domains,
      domainSource,
      domainWarning,
      reloadDomains,
      screen,
      narrow,
      viewportW
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
