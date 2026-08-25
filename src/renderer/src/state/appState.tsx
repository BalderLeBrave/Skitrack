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

import { bookingFamilyOf } from '@shared/bookingFamilies'
import { repairUbloListingUrl } from '@shared/ubloUrl'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { isLanguage, type Language } from '@/i18n'
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
  | 'accueil'
  | 'recherche'
  | 'offres'
  | 'combinaisons'
  | 'decision'
  | 'logements'
  | 'suivi'
  | 'favoris'
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
  /**
   * De quoi rerelever ce prix plus tard.
   *
   * Tous facultatifs : un suivi enregistré avant l'existence du relevé réel
   * n'en porte aucun. Un tel suivi reste affiché et reste comparable, il ne
   * peut simplement pas produire de nouveau point — ce que l'écran dit, plutôt
   * que de combler avec une valeur dérivée du prix d'origine.
   */
  url?: string
  domainId?: number
  checkIn?: string
  checkOut?: string
  adults?: number
  children?: number
  /**
   * Confiance du prix au moment du suivi, telle que la source l'a donnée.
   * Seul `total_confirmed` autorise une alerte : voir `domain/priceAlerts`.
   */
  confidence?: 'total_confirmed' | 'partial' | 'unknown'
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
  /**
   * Réglages : deux onglets.
   *
   * Il y en a eu trois, le troisième — **Administration** — rangeant sous
   * quatre volets les sources de données, la provenance, le moteur local, les
   * métriques des connecteurs, le fournisseur d'itinéraires et les clés d'API.
   * Rien de tout cela n'est une décision d'utilisateur : ces valeurs sont
   * déclarées dans `config/app-config.ts`, les clés dans le stockage chiffré.
   * Voir `docs/config.md`.
   */
  settingsTab: 'app' | 'legal'
  theme: 'light' | 'dark'
  lang: Language
  density: 'comfortable' | 'compact'
  /**
   * Neige animée en surimpression, réglable dans Apparence.
   *
   * Purement décoratif : aucun écran ne lit cette valeur pour décider quoi
   * afficher. Elle est là parce qu'une animation permanente se supporte mal
   * quand on compare des prix pendant une heure, et parce que
   * `prefers-reduced-motion` ne couvre pas le simple « pas envie ».
   */
  snowfall: boolean

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
  /**
   * Part de largeur de la carte sur l'écran Recherche, en pourcentage.
   *
   * L'écran est passé d'une grille à trois colonnes redimensionnables en pixels
   * à un partage liste / carte de 55 – 45. Un pourcentage tient la proportion
   * quand la fenêtre change de taille, là où `searchMapW` en pixels faisait une
   * carte de plus en plus étroite à mesure qu'on agrandissait la fenêtre.
   */
  searchSplit: number
  /**
   * Domaine survolé, liste ou carte. Purement visuel : il n'entre dans aucun
   * filtre, aucun tri, et ne survit pas au rechargement.
   */
  hoveredId: number | null
  threeD: boolean
  isoBusy: boolean
  isoShown: boolean
  /** Fond de carte choisi — voir `BASEMAPS` dans `components/DomainMap`. */
  basemap: BasemapKey
  /** En vue 3D, montrer le fond raster ou le seul relief ombré. */
  relief: 'carte' | 'ombre'
  baseOpen: boolean
  /**
   * Cadrage courant de la carte des domaines, quand le suivi est actif.
   *
   * Même mécanique que `lodgBounds` côté Logements : zoomer ou déplacer la
   * carte retire de la liste ce qui sort de l'écran. Regarder une vallée et
   * lire en dessous une liste qui parle de toute la France n'a pas de sens ;
   * la carte devient un filtre à part entière, qui s'annonce et se retire.
   */
  domBounds: { n: number; s: number; e: number; w: number } | null
  domMapSync: boolean
  /**
   * Recadrage demandé, à consommer **une seule fois**.
   *
   * Posé quand une tuile de massif de l'Accueil ouvre les résultats : la carte
   * doit alors se recentrer sur la sélection. Un booléen d'état plutôt qu'un
   * appel direct — au moment du clic la carte n'existe pas encore, l'écran
   * Recherche n'étant pas monté.
   */
  domFitWanted: boolean

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
  /**
   * Filtres chiffrés, en **plages** : un plancher et un plafond nommés.
   *
   * Une borne unique répond à « au moins » ou « au plus », jamais aux deux, et
   * la moitié des questions posées à cet écran sont des fourchettes — un bas de
   * pistes entre 1 400 et 1 800 m, un forfait entre 200 et 260 €. Les bornes de
   * chaque plage sont dans `FILTER_RANGES` : une plage vaut « inactive » quand
   * sa borne basse est à 0 et sa haute à son plafond, jamais quand une borne
   * vaut 0 — d'où la migration de l'ancien schéma, où `travelMax: 0` voulait
   * dire « pas de plafond » et signifie maintenant « rien au-dessus de zéro ».
   */
  baseMin: number
  baseMax: number
  summitMin: number
  summitMax: number
  kmMin: number
  kmMax: number
  travelMin: number
  travelMax: number
  distMin: number
  distMax: number
  forfaitMin: number
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
  /**
   * Plafond de budget du séjour, en euros. `null` = aucun filtre.
   *
   * Saisi dans la pilule d'accueil. Vide veut dire « pas de budget posé », pas
   * « budget zéro » : c'est pourquoi le champ est nullable et non un nombre à
   * zéro, qui viderait la liste.
   */
  budgetMax: number | null
  /** Le plafond se lit-il pour le groupe entier ou par personne ? */
  budgetMode: 'total' | 'perso'
  /** Montrer quand même les stations au-dessus du budget. Non enregistré. */
  budgetShowOver: boolean
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
  lodgBudgetMin: number
  lodgBudgetMax: number
  lodgTypes: string[]
  lodgDistMin: number
  lodgDistMax: number
  lodgSort: LodgSortKey
  lodgMapOpen: boolean
  /** Cadrage courant de la carte des logements, quand la synchronisation est active. */
  lodgBounds: { n: number; s: number; e: number; w: number } | null
  /** Restreindre la liste au cadrage de la carte quand on la déplace. */
  lodgMapSync: boolean
  /** Part de largeur laissée à la liste face à la carte, en pourcent. */
  lodgSplit: number
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
  /**
   * Libellés des sources que le moteur interroge.
   *
   * Renseigné deux fois, et dans cet ordre : à l'ouverture de l'écran Logements
   * depuis le **registre** des connecteurs enregistrés (`providers.health`),
   * puis après chaque relevé depuis ses `outcomes`. Les deux disent la même
   * chose, mais le registre la dit tout de suite : sans lui, Booking.com et la
   * centrale de la station n'apparaissaient qu'une fois la première recherche
   * revenue, et une station jamais relevée n'affichait qu'Airbnb.
   *
   * Volontairement non persisté : après une mise à jour qui retire un
   * connecteur, une liste relue du disque afficherait une source que plus rien
   * n'interroge — c'est précisément ce qu'on cherche à éviter.
   */
  lodgQueried: string[]
  /**
   * Sources restées muettes au dernier relevé, avec leur raison réelle.
   *
   * Une source sans clé d'API et une source sans offre rendent le même écran
   * vide. Le compte-rendu du relevé disait la différence, mais il disparaissait
   * avec le bandeau ; l'information descend donc dans « État du relevé », où
   * elle reste consultable au lieu de défiler une fois.
   */
  lodgFailed: string[]
  /**
   * Sources qui ont répondu sans erreur mais sans offre tarifée (stock vide).
   * Distinct de `lodgFailed` : ce n'est pas une panne.
   */
  lodgEmpty: string[]
  /**
   * Logement mis en avant depuis la carte.
   *
   * Cliquer une bulle de prix et ouvrir une fiche sont deux gestes distincts :
   * la bulle **remonte** le logement en tête de liste, la vignette ouvre sa
   * fiche. Ouvrir la fiche par-dessus la liste au moindre clic sur la carte
   * empêchait de s'en servir pour situer une offre parmi les autres.
   *
   * Un seul élu à la fois : recliquer la même bulle retire la mise en avant,
   * cliquer une autre la transfère.
   */
  lodgPickId: number | null
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
  /**
   * N'afficher que les annonces dont la disponibilité est confirmée.
   *
   * Remplace `hideGone`, qui ne couvrait qu'un cas sur trois : l'annonce
   * disparue d'un relevé. Il manquait le cas majoritaire — l'annonce qu'Airbnb
   * liste sans la tarifer, c'est-à-dire qu'il ne peut pas vendre à ces dates.
   * Voir `data/lodgingAvailability.ts`.
   *
   * Vrai par défaut : une liste de logements est une liste de logements qu'on
   * peut réserver. Les cas non jugés — hébergements OpenStreetMap, saisies à la
   * main — ne sont jamais masqués par ce filtre.
   */
  lodgOnlyAvailable: boolean
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

/** Une plage chiffrée : les deux clés d'état, le plancher, le plafond, le pas. */
export interface FilterRange {
  lo: keyof AppState
  hi: keyof AppState
  min: number
  max: number
  step: number
}

/**
 * Bornes et pas de chaque filtre chiffré, en un seul endroit.
 *
 * Le composant de slicer, le prédicat de filtrage, l'étiquette de la puce
 * active et la migration des préférences ont tous besoin du plafond : écrit
 * quatre fois, il finit par différer d'un endroit à l'autre, et un plafond
 * désaccordé rend la plage impossible à rouvrir — le filtre reste « posé »
 * pour le prédicat alors que l'écran le dit inactif.
 */
export const FILTER_RANGES = {
  base: { lo: 'baseMin', hi: 'baseMax', min: 0, max: 2400, step: 50 },
  summit: { lo: 'summitMin', hi: 'summitMax', min: 0, max: 4000, step: 100 },
  km: { lo: 'kmMin', hi: 'kmMax', min: 0, max: 600, step: 10 },
  travel: { lo: 'travelMin', hi: 'travelMax', min: 0, max: 720, step: 15 },
  dist: { lo: 'distMin', hi: 'distMax', min: 0, max: 1200, step: 25 },
  forfait: { lo: 'forfaitMin', hi: 'forfaitMax', min: 0, max: 400, step: 10 },
  lodgBudget: { lo: 'lodgBudgetMin', hi: 'lodgBudgetMax', min: 0, max: 8000, step: 100 },
  lodgDist: { lo: 'lodgDistMin', hi: 'lodgDistMax', min: 0, max: 1000, step: 50 }
} as const satisfies Record<string, FilterRange>

export type FilterRangeKey = keyof typeof FILTER_RANGES

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
  snowfall: true,

  selectedId: 1,
  scoreOpenId: 1,
  forfaitOpenId: null,
  pinnedId: null,
  cmpRefId: null,
  domFicheId: null,
  domCamUrl: '',
  braManual: {},
  // Fermés au démarrage. Le panneau est un survol posé sur la liste : ouvert
  // d'emblée, il cachait les résultats avant même qu'on ait demandé à filtrer.
  searchFiltersOpen: false,
  searchMapOpen: true,
  searchFiltersW: 300,
  searchMapW: 460,
  searchSplit: 45,
  hoveredId: null,
  threeD: false,
  isoBusy: false,
  isoShown: false,
  basemap: DEFAULT_BASEMAP,
  relief: 'carte',
  baseOpen: false,
  domBounds: null,
  domMapSync: true,
  domFitWanted: false,

  domainQuery: '',
  geo: null,
  geoBusy: false,
  geoMsg: '',
  geoResolve: null,
  baseMin: 1200,
  baseMax: FILTER_RANGES.base.max,
  summitMin: 0,
  summitMax: FILTER_RANGES.summit.max,
  // Plage grande ouverte. Le plancher était à 10 km — « les micro-stations ne
  // sont pas des domaines skiables au sens de l'app » — mais c'était un
  // jugement posé à la place de l'utilisateur, appliqué avant qu'il n'ait rien
  // demandé : les petits domaines des Vosges, du Jura et du Massif central
  // n'apparaissaient jamais, et rien à l'écran ne disait pourquoi.
  kmMin: 0,
  kmMax: FILTER_RANGES.km.max,
  travelMin: 0,
  travelMax: FILTER_RANGES.travel.max,
  distMin: 0,
  distMax: FILTER_RANGES.dist.max,
  forfaitMin: 0,
  forfaitMax: FILTER_RANGES.forfait.max,
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
  budgetMax: null,
  budgetMode: 'total',
  budgetShowOver: false,
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
  lodgBudgetMin: 0,
  lodgBudgetMax: FILTER_RANGES.lodgBudget.max,
  lodgTypes: [],
  lodgDistMin: 0,
  lodgDistMax: FILTER_RANGES.lodgDist.max,
  lodgSort: 'dist_asc',
  lodgMapOpen: true,
  lodgBounds: null,
  lodgMapSync: true,
  lodgSplit: 58,
  lodgFiltersOpen: false,
  lodgAnnul: false,
  lodgPhase: 'results',
  lodgSearchMsg: null,
  lodgQueried: [],
  lodgFailed: [],
  lodgEmpty: [],
  lodgPickId: null,
  lastScan: null,
  mergeDupes: true,
  lodgStatusOpen: false,
  hideBadGeo: false,
  lodgOnlyAvailable: true,
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
  // Les bornes hautes reviennent à leur **plafond**, jamais à 0 : à 0 la plage
  // serait au contraire le filtre le plus serré possible.
  lodgBudgetMin: 0,
  lodgBudgetMax: FILTER_RANGES.lodgBudget.max,
  lodgTypes: [],
  lodgDistMin: 0,
  lodgDistMax: FILTER_RANGES.lodgDist.max,
  lodgSort: 'pp_asc',
  lodgAnnul: false,
  lodgOnlyAvailable: true,
  rooms: 1
}

/** Clés enregistrées : les réglages, pas l'état transitoire d'un écran. */
const PERSISTED_KEYS = [
  'theme', 'lang', 'density', 'snowfall', 'children', 'optRental', 'optLessons',
  'alertMode', 'alertPct', 'alertEur', 'quietHours', 'digest', 'votes',
  // `searchFiltersOpen` n'est plus enregistré : c'est l'état d'un survol, pas
  // un réglage. Le retrouver ouvert au démarrage suivant reposerait un panneau
  // sur la liste sans que personne ne l'ait demandé.
  'offresBudget', 'searchFiltersW', 'searchMapW', 'searchSplit', 'searchMapOpen',
  'weights', 'people', 'places', 'esfRates', 'decision', 'mergeDupes', 'cmpRefId',
  'baseMin', 'baseMax', 'summitMin', 'summitMax', 'kmMin', 'kmMax',
  'travelMin', 'travelMax', 'distMin', 'distMax', 'forfaitMin', 'forfaitMax',
  'lodgBudgetMin', 'lodgBudgetMax', 'lodgDistMin', 'lodgDistMax', 'massifs',
  // `budgetShowOver` n'est pas enregistré : « afficher quand même » répond au
  // bandeau qu'on vient de lire, pas à un réglage qu'on retrouve six mois plus
  // tard sans savoir pourquoi la liste déborde du budget.
  'budgetMax', 'budgetMode',
  'glacier', 'linked', 'sort', 'avoidTolls', 'arrDate', 'depDate', 'travelers',
  'rooms', 'tracked', 'logos', 'imported', 'braManual', 'geo', 'basemap', 'relief', 'hideBadGeo', 'lodgOnlyAvailable', 'lodgMapSync', 'lodgSplit', 'domMapSync'
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

/**
 * L'historique change de clé parce qu'il change de nature.
 *
 * Jusqu'ici, `skitrack-v3-hist` était rempli par une sinusoïde : à chaque
 * ouverture, un point était **fabriqué** à partir du prix d'origine, sans
 * qu'aucune source soit interrogée. L'écran de suivi, lui, considérait deux
 * points enregistrés comme un « historique réel » et retirait les pointillés.
 * La distinction relevé / simulé que cet écran promet de garantir était donc
 * déjà fausse, et une alerte branchée dessus aurait notifié sur du bruit.
 *
 * Ces points sont inexploitables : rien ne permet de distinguer après coup ce
 * qui aurait été mesuré de ce qui a été inventé. Ils sont abandonnés avec la
 * clé v3 plutôt que repris sous une provenance devinée. On ne récupère pas une
 * donnée dont on ne connaît pas la provenance — on l'invente une seconde fois.
 */
const HIST_KEY = 'skitrack-v4-hist'
const LEGACY_HIST_KEYS = ['skitrack-v3-hist']

function purgeLegacyPrefs(): void {
  for (const key of [...LEGACY_PREFS_KEYS, ...LEGACY_HIST_KEYS]) {
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
/** Version du schéma des préférences écrite sur le disque. */
const PREFS_SCHEMA = 5

/**
 * Migre les préférences d'avant les plages vers le schéma 2.
 *
 * Indispensable, et pas seulement confortable : l'ancien schéma écrivait
 * `travelMax: 0` au sens « pas de plafond ». Relu tel quel par les nouveaux
 * prédicats, `[0, 0]` est une plage **posée** qui n'accepte que la valeur zéro
 * — donc aucun domaine. L'écran s'ouvrait vide, sans message et sans erreur
 * console, sur les seules machines où une session précédente avait enregistré
 * des filtres.
 *
 * Trois règles : les clés changent de nom, toute borne haute absente ou nulle
 * repart à son plafond, toute borne basse absente repart à 0. Le drapeau de
 * version évite de repasser sur des préférences déjà migrées, où un `0` en
 * borne haute serait cette fois un choix délibéré de l'utilisateur.
 */
function migratePrefs(saved: Partial<AppState> & { prefsSchema?: number }): Partial<AppState> {
  if (saved.prefsSchema === PREFS_SCHEMA) return saved

  const legacy = saved as Record<string, unknown>
  const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null)
  const out: Record<string, unknown> = { ...saved }

  // Renommages : « altitude minimum » devient le plancher de la plage `base`
  // — qui portait alors le bas des pistes, et porte le front de neige depuis le
  // schéma 5 —, et « sommet au moins à » le plancher du point culminant.
  const renames: [string, string][] = [
    ['altMin', 'baseMin'],
    ['altMax', 'summitMin'],
    ['lodgBudget', 'lodgBudgetMax'],
    ['lodgDist', 'lodgDistMax']
  ]
  for (const [from, to] of renames) {
    const v = num(legacy[from])
    if (v != null && out[to] == null) out[to] = v
    delete out[from]
  }

  for (const range of Object.values(FILTER_RANGES)) {
    const lo = num(out[range.lo])
    const hi = num(out[range.hi])
    out[range.lo] = lo ?? 0
    // `lodgBudget: 0` et `travelMax: 0` disaient « sans plafond » : c'est le
    // plafond de la plage, pas zéro.
    out[range.hi] = hi != null && hi > 0 ? Math.min(hi, range.max) : range.max
  }

  // Schéma 3 : le plancher de 10 km n'est plus un défaut. Une préférence
  // enregistrée le porte encore, et le filtre resterait posé à vie sur les
  // machines où l'application a déjà tourné — c'est précisément le symptôme
  // « bloqué à 10 km ». Seule la valeur du défaut d'alors est relevée : un
  // plancher réglé à la main sur 5 ou 25 km est un choix, et il est conservé.
  if ((saved.prefsSchema ?? 0) < 3 && num(out.kmMin) === 10) out.kmMin = 0

  // `searchFiltersOpen` a cessé d'être un réglage enregistré le jour où le
  // panneau est devenu un survol. La valeur laissée sur le disque rouvrirait
  // le panneau sur la liste au démarrage suivant, une fois, sans raison.
  delete out.searchFiltersOpen

  // Schéma 4 : `hideGone` devient `lodgOnlyAvailable`, qui couvre les trois
  // façons pour une annonce de ne pas être réservable et non plus une seule.
  // La valeur précédente n'est pas reportée : elle valait « false » par défaut,
  // et la reprendre reconduirait l'ancien comportement sous un nom neuf.
  delete out.hideGone

  // Le catalogue est passé de sept langues à deux. Une préférence enregistrée
  // peut encore nommer l'allemand ou l'espagnol : on la retire pour que le
  // défaut reprenne, plutôt que de la réécrire sur le disque à chaque session.
  if (!isLanguage(out.lang)) delete out.lang

  // Schéma 5 : `baseMin`/`baseMax` a changé de **mesure**. La plage portait sur
  // le point le plus bas du domaine ; elle porte désormais sur le front de
  // neige de la station, seule altitude qui distingue Val Thorens (2 321 m) de
  // Brides-les-Bains (662 m) sur un domaine qu'elles partagent.
  //
  // La valeur n'est pas reportée : « au moins 1 500 m de bas de pistes » et
  // « au moins 1 500 m de front de neige » ne désignent pas le même ensemble
  // de stations, et reconduire le nombre ferait passer pour un choix de
  // l'utilisateur une plage qu'il n'a jamais posée sur cette mesure. La plage
  // repart donc à son défaut, et le curseur montre ce qu'il filtre.
  if ((saved.prefsSchema ?? 0) < 5) {
    delete out.baseMin
    delete out.baseMax
  }

  return out as Partial<AppState>
}

function forgetInventedCapacity(imported: Lodging[] | undefined): Lodging[] {
  if (!Array.isArray(imported)) return []
  return imported.map((lodging) =>
    lodging.src === 'Airbnb' || lodging.src === 'OSM → Airbnb'
      ? { ...lodging, pers: 0, ch: 0 }
      : lodging
  )
}

/**
 * Répare les URL de fiche des centrales Ublo écrites sans leur segment.
 *
 * Le connecteur posait le `slug` à la racine — `/{slug}` au lieu de
 * `/hebergements/{slug}` — et chaque annonce ouvrait un 404. Le connecteur est
 * corrigé, mais `imported` est **enregistré** : les annonces déjà relevées
 * portent l'URL fautive et l'ouvriraient encore.
 *
 * La réparation se fait ici, à la lecture, et pas seulement à l'ouverture du
 * lien : l'URL est aussi la clé de déduplication et celle de l'identifiant
 * local. La corriger en surface aurait laissé le prochain relevé rapporter la
 * même annonce sous une URL différente — donc en double, l'une des deux menant
 * toujours à un 404.
 *
 * `repairUbloListingUrl` est idempotent et ne touche qu'aux chemins d'un seul
 * segment : la repasser à chaque démarrage ne dérive pas.
 */
function repairCentralUrls(imported: Lodging[]): Lodging[] {
  return imported.map((lodging) => {
    if (!lodging.url || bookingFamilyOf(lodging.url) !== 'ublo') return lodging
    const url = repairUbloListingUrl(lodging.url)
    return url === lodging.url ? lodging : { ...lodging, url }
  })
}

export interface PriceReading {
  t: number
  v: number
  /**
   * D'où vient ce point.
   *
   * `measured` : la source a répondu avec un total confirmé, à cette date.
   * `estimated` : tout le reste — un « à partir de », un prix dérivé. Un point
   * estimé se dessine en pointillés et **ne déclenche jamais d'alerte** : une
   * notification quitte l'application et personne ne la relira en se demandant
   * si le chiffre était une mesure.
   *
   * Absent sur les points d'avant ce champ ; `readingOrigin` les traite alors
   * comme estimés, ce qui est le choix prudent.
   */
  o?: 'measured' | 'estimated'
}

/** Provenance d'un point, avec le repli prudent pour les points d'avant. */
export function readingOrigin(reading: PriceReading): 'measured' | 'estimated' {
  return reading.o === 'measured' ? 'measured' : 'estimated'
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
  /** Enregistre des relevés réels, indexés par `TrackedItem.key`. */
  recordReadings: (readings: Record<string, PriceReading>) => void
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
      const saved = migratePrefs(JSON.parse(raw) as Partial<AppState> & { prefsSchema?: number })
      return { ...base, ...saved, imported: repairCentralUrls(forgetInventedCapacity(saved.imported)), ...(demo ?? {}) }
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
  // L'historique vit dans une ref (il est volumineux et réécrit par lots) ;
  // ce compteur est le seul signal de repeinte quand un relevé arrive.
  const [historyTick, setHistoryTick] = useState(0)

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
    const payload: Record<string, unknown> = { prefsSchema: PREFS_SCHEMA }
    for (const key of PERSISTED_KEYS) payload[key] = state[key]
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(payload))
    } catch {
      /* quota dépassé : la session reste utilisable, seule la reprise est perdue */
    }
  }, [state])

  /**
   * Enregistre des relevés dans l'historique.
   *
   * Point d'entrée unique de l'écriture : le relevé réel (`usePriceRefresh`)
   * l'appelle, et personne d'autre. Il n'existe plus de chemin qui fabrique un
   * point — c'est délibéré, et c'est ce qui rend une alerte défendable.
   */
  const recordReadings = useCallback((readings: Record<string, PriceReading>) => {
    const entries = Object.entries(readings)
    if (entries.length === 0) return
    for (const [key, reading] of entries) {
      const arr = (history.current[key] ??= [])
      arr.push(reading)
      // Dix jours de relevés horaires : au-delà, la courbe ne se lit plus et
      // le stockage grossit sans rien apprendre.
      if (arr.length > 240) arr.shift()
    }
    try {
      localStorage.setItem(HIST_KEY, JSON.stringify(history.current))
    } catch {
      /* l'historique reste en mémoire */
    }
    // `history` est une ref : sans ce compteur, aucun écran ne se repeindrait
    // à l'arrivée d'un relevé.
    setHistoryTick((n) => n + 1)
  }, [])

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

  // Sans onglet choisi, l'application ouvre l'accueil : il donne les entrées
  // que la liste seule ne propose pas — un nom, un critère franc, un massif.
  const screen: Screen = state.tab ?? 'accueil'

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
      recordReadings,
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
      recordReadings,
      // `historyTick` n'est lu nulle part dans le corps du mémo : il n'est là
      // que pour le réinvalider. L'historique est une ref mutée en place, donc
      // son identité ne change pas quand un relevé arrive — sans ce compteur,
      // la valeur de contexte resterait identique et aucun écran ne se
      // repeindrait.
      historyTick,
      narrow,
      viewportW
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
