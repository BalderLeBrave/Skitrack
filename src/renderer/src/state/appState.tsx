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
import { distanceKm, domainZone, zoneVerdict } from '@shared/geo'
import { FM_BY_ID } from '@/data/catalogue'
import { FM_STATIONS } from '@/data/franceMontagnesStations'
import type { Lodging } from '@/data/lodgings'
import type { EsfRates, RouteBudget } from '@/domain/costs'
import type { PhotoOverrides } from '@/data/photoOverrides'
import type { ForfaitsSaisis } from '@/domain/forfait'
import type { DomainSource } from '@/data/domains'
import { fallbackDomains, loadDomains } from '@/data/domains'
import { applyResolvedCoords, readGeoCache, resolveMissingCoords } from '@/data/domainGeo'
import type { Domain, Referential } from '@/data/referentiel'
import { hasCoords, loadReferential } from '@/data/referentiel'
import type { Person } from '@/domain/costs'
import type { Place, RouteTable } from '@/domain/travel'
import { loadRoutes } from '@/domain/travel'
import type { StationRunLog } from '@shared/searchWalk'

export type Screen =
  | 'accueil'
  | 'recherche'
  | 'selection'
  | 'offres'
  | 'combinaisons'
  | 'decision'
  | 'logements'
  | 'suivi'
  | 'reglages'
  | 'import-referentiel'

/**
 * Ce qu'une note ou un vote de « Ma sélection » désigne.
 *
 * Les deux formes de cible cohabitent dans une seule table côté persistance :
 * un couple (`kind`, `targetId`) plutôt que deux colonnes nullables, pour qu'un
 * enregistrement ne puisse pas viser un domaine *et* un logement.
 */
export type SelectionKind = 'domain' | 'lodging'

/**
 * Une note du fil de discussion, adossée à un élément retenu.
 *
 * La forme est celle de la table `selection_notes` proposée en tête de phase,
 * champ pour champ : quand la persistance passera de `localStorage` à SQLite,
 * c'est la couche de stockage qui change, pas le modèle.
 */
export interface SelectionNote {
  /** Miroir de `selection_notes.id`. Croissant, jamais réutilisé. */
  id: number
  kind: SelectionKind
  targetId: number
  /** `Person.id` de l'auteur. `-1` quand aucun voyageur n'est renseigné. */
  authorId: number
  /** ISO 8601 en UTC, comme `selection_notes.created_at`. */
  createdAt: string
  body: string
}

/**
 * Clé de vote d'un élément de la sélection.
 *
 * Elle réutilise `state.votes`, déjà indexé par clé d'objet et par rang de
 * votant : le modèle de `selection_votes` (cible, votant, valeur) y est déjà,
 * il n'y avait pas lieu d'en ouvrir un second.
 */
export function selectionVoteKey(kind: SelectionKind, targetId: number): string {
  return `sel:${kind}:${targetId}`
}

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

/**
 * Qualité d'une provenance corrigée à la main.
 *
 * Quatre états, et pas un booléen : « la donnée est là » et « la donnée est
 * mesurée » ne sont pas la même affirmation, et c'est exactement ce que cet
 * écran doit permettre de dire.
 */
export type ProvState = 'manual' | 'measured' | 'estimated' | 'missing'

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
  /**
   * Réglages : trois onglets, pas cinq.
   *
   * L'usage quotidien (thème, densité, langue, poids du classement) était mêlé
   * à l'installation (moteur local, clés d'API, fournisseur d'itinéraires).
   * Tout ce qui relève de l'installation passe derrière **Administration**,
   * où quatre volets le rangent — voir `admSub`.
   */
  settingsTab: 'app' | 'admin' | 'legal'
  admSub: 'engine' | 'sources' | 'routes' | 'keys'
  /**
   * Provenances corrigées à la main, indexées par libellé de ligne.
   *
   * La ligne d'origine **reste calculée** : la correction se superpose à
   * l'affichage et s'annonce avec son état. Sans cela, on ne distinguerait plus
   * un relevé d'une affirmation — et c'est précisément l'écran dont le rôle est
   * de tenir cette distinction.
   */
  provEdits: Record<string, { src: string; state: ProvState }>
  provEditKey: string | null
  provDraftSrc: string
  provDraftState: ProvState
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
  travelers: number
  children: number
  rooms: number
  people: Person[]
  places: Place[]
  peopleOpen: boolean
  /**
   * Tarifs de cours relevés par domaine. Forme définie dans `domain/costs.ts`,
   * plus dupliquée ici : les deux avaient divergé dès l'ajout du tarif
   * particulier, et c'est le genre d'écart qu'un typage structurel cache.
   */
  esfRates: EsfRates
  /**
   * Carburant et péages, saisis ou relevés sur ViaMichelin.
   *
   * Le calcul appliquait deux constantes — 0,115 €/km et 0,058 €/km — à une
   * distance elle-même estimée. Cette table permet de les remplacer par des
   * valeurs réelles ; ce qui reste vide continue d'être estimé, et l'écran le
   * dit. Voir `RouteBudget` dans `domain/costs.ts`.
   */
  routeBudget: RouteBudget
  /** Dernier relevé ViaMichelin, pour le dater à l'écran. */
  routeCostAt: number | null
  /**
   * Photos de station corrigées à la main, par slug de station.
   *
   * Le référentiel photo est généré et choisit ses images par position : une
   * candidate prise à quatre kilomètres du front de neige peut montrer autre
   * chose. Voir `data/photoOverrides.ts`.
   */
  photoOverrides: PhotoOverrides
  /**
   * Grilles de forfait relevées à la main, par identifiant de domaine.
   *
   * Le référentiel livré ne porte que deux durées — journée et six jours — et
   * 107 domaines sur 283 n'ont aucun tarif relevé du tout. Cette table est le
   * seul moyen d'entrer une grille réelle, et elle prime sur le fichier : c'est
   * l'utilisateur qui a regardé le tarif du jour sur le site de la station.
   *
   * Chaque entrée porte sa date de relevé et sa source. Voir `domain/forfait.ts`.
   */
  forfaitsSaisis: ForfaitsSaisis
  optRental: boolean
  optLessons: boolean

  // Écran Logements
  lodgingDomainId: number | null
  lodgSelId: number | null
  /** Récapitulatif de séjour ouvert, à copier ou envoyer aux voyageurs. */
  staySummaryOpen: boolean
  lodgBudgetMin: number
  lodgBudgetMax: number
  lodgTypes: string[]
  lodgDistMin: number
  lodgDistMax: number
  lodgSort: LodgSortKey
  lodgMapOpen: boolean
  /** Cadrage courant de la carte des logements, quand la synchronisation est active. */
  lodgBounds: { n: number; s: number; e: number; w: number } | null
  /**
   * Restreindre la liste au cadrage de la carte quand on la déplace.
   *
   * **Éteint par défaut depuis le 2026-08-30.** Allumé, il retirait de la liste
   * toute annonce sortie du cadre au premier déplacement de carte, sans compteur
   * ni mention : c'était le masquage le plus silencieux de l'écran.
   */
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
   * Dernier journal unifié du relevé (Airbnb + centrales), pour l'écran.
   * Non persisté : un walk d'une autre recherche au redémarrage mentirait.
   */
  lodgWalk: StationRunLog | null
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
   * **Faux par défaut depuis le 2026-08-30.** Ce filtre a été câblé en dur
   * pendant un temps (`onlyAvailable: true` dans `state/selectors.tsx`), au nom
   * d'une « règle de l'écran » : une liste de logements serait une liste de
   * logements réservables. Mesuré sur le profil réel, il retirait des annonces
   * en silence, sans que rien à l'écran ne dise combien ni lesquelles — et la
   * vignette sait pourtant déjà porter l'avertissement (`lodg_gone_notice`,
   * `avail_unconfirmed`, voir `components/LodgingCard.tsx`). Avertir vaut mieux
   * que soustraire : l'annonce s'affiche, marquée, et qui veut une liste
   * strictement réservable coche la case.
   */
  lodgOnlyAvailable: boolean
  /**
   * N'afficher que les annonces dont le prix a été relevé **pour ces dates**.
   *
   * Faux par défaut, et pour la même raison que `lodgOnlyAvailable` : la règle
   * était câblée en dur (`confirmedPricesOnly: true`) et retirait sans le dire.
   * Un prix relevé pour d'autres dates est une information — périmée, donc
   * affichée comme telle (`lodg_price_stale`) — pas une raison de faire
   * disparaître le logement.
   */
  lodgConfirmedPrices: boolean
  /**
   * Masquer les annonces qui n'annoncent pas ce que les critères demandent.
   *
   * **Allumé par défaut depuis le schéma 8.** Demander 8 personnes et 4
   * chambres puis recevoir un studio sans capacité publiée est le défaut que
   * ce drapeau existe pour éviter. On peut toujours les réafficher.
   */
  lodgHideUnannounced: boolean
  /**
   * Bandeau de séjour replié.
   *
   * Le bandeau s'imposait : impossible à réduire, il occupait le pied de
   * l'écran même quand rien n'était retenu, et passait **devant** la fiche
   * ouverte (z-index 8 contre 6), dont il masquait les boutons du bas —
   * signalé le 2026-08-29. Le repli est un choix de l'utilisateur : il se
   * retient d'une session à l'autre.
   */
  stayBarCollapsed: boolean
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

  // Ma sélection
  /** Domaines retenus, dans l'ordre où ils l'ont été. */
  selDomains: number[]
  /** Logement retenu par domaine : `domainId` → `lodgingId`, comme le prototype. */
  selLodgings: Record<number, number>
  selNotes: SelectionNote[]

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
 * Le curseur de budget de l'écran Offres, qui n'est pas une plage à deux
 * bornes et vit donc hors de `FILTER_RANGES`.
 *
 * Son plafond suit la même convention que les plages : **atteint, il ne borne
 * plus**. Sans cela, l'écran gardait un dernier cran qui excluait encore — un
 * séjour complet à 9 500 € disparaissait sans que rien ne le dise, alors que
 * le curseur était poussé à fond. Un filtre qu'on ne peut pas lever n'est pas
 * un filtre, c'est une limite du logiciel.
 */
export const OFFRES_BUDGET = { min: 1500, max: 9000, step: 250 } as const

/** Le budget du séjour ne borne plus rien dès que le curseur touche le bout. */
export const offresBudgetOpen = (budget: number): boolean => budget >= OFFRES_BUDGET.max

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
  admSub: 'engine',
  provEdits: {},
  provEditKey: null,
  provDraftSrc: '',
  provDraftState: 'manual',
  theme: 'light',
  lang: 'fr',
  density: 'comfortable',
  snowfall: true,

  selectedId: 1,
  scoreOpenId: 1,
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
  travelers: 1,
  children: 0,
  // Aucun seuil de chambres par défaut : un studio est un logement comme un
  // autre, et le réglage ne doit pas écarter en silence ce que personne n'a
  // demandé d'écarter.
  rooms: 0,
  people: DEFAULT_PEOPLE,
  places: DEFAULT_PLACES,
  peopleOpen: false,
  esfRates: {},
  routeBudget: {},
  routeCostAt: null,
  photoOverrides: {},
  forfaitsSaisis: {},
  optRental: false,
  optLessons: false,

  lodgingDomainId: null,
  lodgSelId: null,
  staySummaryOpen: false,
  lodgBudgetMin: 0,
  lodgBudgetMax: FILTER_RANGES.lodgBudget.max,
  lodgTypes: [],
  lodgDistMin: 0,
  lodgDistMax: FILTER_RANGES.lodgDist.max,
  lodgSort: 'dist_asc',
  lodgMapOpen: true,
  lodgBounds: null,
  lodgMapSync: false,
  lodgSplit: 58,
  lodgSrcOff: [],
  lodgFiltersOpen: false,
  lodgAnnul: false,
  lodgPhase: 'results',
  lodgSearchMsg: null,
  lodgQueried: [],
  lodgFailed: [],
  lodgEmpty: [],
  lodgWalk: null,
  lodgPickId: null,
  lastScan: null,
  mergeDupes: true,
  lodgStatusOpen: false,
  hideBadGeo: false,
  lodgOnlyAvailable: true,
  lodgConfirmedPrices: true,
  lodgHideUnannounced: true,
  stayBarCollapsed: false,
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

  selDomains: [],
  selLodgings: {},
  selNotes: [],
  votes: {},
  voter: 0,

  weights: {},
  logos: {},
  onboard: false
}

/**
 * Un séjour dont un relevé peut réellement partir.
 *
 * Définition unique, parce qu'elle a désormais deux lecteurs : la page
 * Logements, qui refuse de lancer la recherche, et le bouton « Rechercher » du
 * panneau de filtres, qui édite ces mêmes dates. Dupliquée, elle dériverait —
 * et un bouton actif au-dessus d'une date invalide renvoie l'utilisateur au
 * formulaire de saisie sans un mot d'explication.
 */
export function stayCriteriaReady(
  s: Pick<AppState, 'arrDate' | 'depDate' | 'travelers'>
): boolean {
  return Boolean(s.arrDate) && Boolean(s.depDate) && s.arrDate < s.depDate && s.travelers >= 1
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
  lodgSrcOff: [],
  lodgAnnul: false,
  lodgOnlyAvailable: true,
  lodgConfirmedPrices: true,
  rooms: 0
}

/** Clés enregistrées : les réglages, pas l'état transitoire d'un écran. */
const PERSISTED_KEYS = [
  'theme', 'lang', 'density', 'snowfall', 'children', 'optRental', 'optLessons',
  'alertMode', 'alertPct', 'alertEur', 'quietHours', 'digest', 'votes',
  'selDomains', 'selLodgings', 'selNotes',
  // `searchFiltersOpen` n'est plus enregistré : c'est l'état d'un survol, pas
  // un réglage. Le retrouver ouvert au démarrage suivant reposerait un panneau
  // sur la liste sans que personne ne l'ait demandé.
  'offresBudget', 'searchFiltersW', 'searchMapW', 'searchSplit', 'searchMapOpen',
  'weights', 'people', 'places', 'esfRates', 'forfaitsSaisis', 'routeBudget', 'routeCostAt', 'photoOverrides', 'decision', 'mergeDupes', 'cmpRefId',
  'baseMin', 'baseMax', 'summitMin', 'summitMax', 'kmMin', 'kmMax',
  'travelMin', 'travelMax', 'distMin', 'distMax', 'forfaitMin', 'forfaitMax',
  'lodgBudgetMin', 'lodgBudgetMax', 'lodgDistMin', 'lodgDistMax', 'massifs',
  'glacier', 'linked', 'sort', 'avoidTolls', 'arrDate', 'depDate', 'travelers',
  'rooms', 'tracked', 'logos', 'imported', 'braManual', 'geo', 'basemap', 'relief', 'hideBadGeo', 'lodgOnlyAvailable', 'lodgConfirmedPrices', 'lodgHideUnannounced', 'stayBarCollapsed', 'lodgMapSync', 'lodgSplit', 'domMapSync', 'provEdits'
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
/** Version du schéma des préférences écrite sur le disque. */
/*
 * Schéma 6 (2026-08-30) : `lodgOnlyAvailable` et `lodgMapSync` repassent à
 * « éteint ». Sans ce numéro, `migratePrefs` sort à la première ligne pour tout
 * profil déjà en schéma 5 et les deux `delete` plus bas ne s'exécutent jamais —
 * constaté à l'exécution, les clés restaient à `true` sur le profil réel.
 *
 * Schéma 7 (2026-08-30) : les annonces rattachées à un domaine sous une
 * numérotation qui n'est pas celle du catalogue sont rerattachées par leur
 * position. Voir `rerattacherParPosition`.
 *
 * Schéma 10 (2026-09-02) : `selLodgings` vidé. Un mapping domaine→annonce
 * d'une session précédente présentait un hôtel (souvent le moins cher du
 * nouveau relevé, collision d'id) comme « Logement retenu » alors que
 * personne n'avait cliqué Retenir sur ce relevé.
 */
const PREFS_SCHEMA = 10

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
/**
 * Rerattache par la position les annonces dont le domaine est illisible.
 *
 * ## Le défaut
 *
 * `importDomainId` a porté trois numérotations successives : celle du
 * référentiel, celle du moteur local, et — depuis — celle du catalogue, dont
 * les identifiants commencent à 1000. Les deux premières se recouvrent, et
 * `stationOwning` rattache une annonce à la station dont les `members`
 * contiennent l'identifiant : un lot relevé pour le domaine **55** du moteur
 * (Valfréjus) atterrissait donc sous la station qui avait absorbé l'entrée
 * **55** du référentiel — Le Mont-Dore, à trois cents kilomètres.
 *
 * Mesuré le 2026-08-30 sur le profil réel : l'écran d'une station auvergnate
 * proposait « Le paradis vous attend à Pine, en Arizona », une « escapade au
 * Colorado » et une maison bretonne « à 300 m de la plage ».
 *
 * ## Le remède
 *
 * L'origine de la numérotation n'a pas été conservée, et aucune table ne
 * permet de la reconstituer. La **position**, elle, ne dépend d'aucune
 * numérotation : une annonce géolocalisée appartient à la station dont la zone
 * la contient, et c'est vérifiable sans rien savoir de son histoire.
 *
 * Seules les annonces dont l'identifiant n'existe pas au catalogue sont
 * touchées — les autres sont déjà justes, et les rerattacher déplacerait des
 * annonces correctes. Celles qu'aucune zone ne contient, et celles sans
 * position, sont laissées telles quelles : la zone du domaine les écarte à
 * l'affichage, et un relevé refait les rétablit. On ne devine pas.
 */
function rerattacherParPosition(imported: unknown): { list: Lodging[]; deplacees: number } | null {
  if (!Array.isArray(imported)) return null
  const stations = FM_STATIONS.filter(
    (st) => typeof st.lat === 'number' && typeof st.lon === 'number'
  )
  let deplacees = 0
  const list = (imported as Lodging[]).map((lg) => {
    const id = lg.importDomainId
    if (id == null || FM_BY_ID.has(id)) return lg
    if (typeof lg.lat !== 'number' || typeof lg.lon !== 'number') return lg

    // La station dont la zone contient l'annonce, la plus proche s'il y en a
    // plusieurs — les domaines voisins se chevauchent, et le centre le plus
    // près est le rattachement le moins arbitraire.
    let meilleure: { id: number; km: number } | null = null
    for (const st of stations) {
      const zone = domainZone({ lat: st.lat as number, lon: st.lon as number, km: st.km })
      if (zoneVerdict(zone, lg.lat, lg.lon) !== 'in') continue
      const km = distanceKm(st.lat as number, st.lon as number, lg.lat, lg.lon)
      if (!meilleure || km < meilleure.km) meilleure = { id: st.id, km }
    }
    if (!meilleure) return lg
    deplacees++
    return { ...lg, importDomainId: meilleure.id }
  })
  return { list, deplacees }
}

function migratePrefs(saved: Partial<AppState> & { prefsSchema?: number }): Partial<AppState> {
  if (saved.prefsSchema === PREFS_SCHEMA) return saved

  const legacy = saved as Record<string, unknown>
  const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null)
  const out: Record<string, unknown> = { ...saved }

  // Renommages : « altitude minimum » devient le plancher du bas des pistes, et
  // « sommet au moins à » le plancher du point culminant.
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

  // Schéma 5 : « 1 chambre minimum » était le plancher du réglage, et à ce
  // titre il ne posait aucun seuil — le filtre ne se réveillait qu'à partir de
  // 2. Le plancher est maintenant 0 (studio), et 1 est devenu un vrai seuil,
  // qui écarte les biens sans chambre. Une préférence enregistrée à 1 n'a donc
  // jamais été un choix : c'est la valeur qu'on ne pouvait pas descendre. On la
  // ramène à 0 plutôt que de poser en silence un filtre que personne n'a
  // demandé. Un seuil réglé à la main sur 2 ou plus est un choix, il reste.
  if ((saved.prefsSchema ?? 0) < 5 && num(out.rooms) === 1) out.rooms = 0

  // `lodgShowUnannounced` (2026-08-29, retiré le lendemain) : le défaut
  // masquait les annonces qui n'annoncent rien, et vidait l'écran. La clé
  // change de nom ET de sens (`lodgHideUnannounced`, défaut visible) — on
  // efface l'ancienne plutôt que de la traduire, pour que tout le monde
  // reparte du défaut.
  delete out.lodgShowUnannounced

  // 2026-08-30 — `lodgOnlyAvailable` et `lodgMapSync` passent à « éteint ».
  // Les deux masquaient des annonces sans le dire, et les profils existants
  // portent l'ancien défaut `true` sur le disque : le laisser en place ferait
  // que le nouveau comportement ne s'appliquerait qu'aux installations neuves.
  // On efface les deux clés pour que tout le monde reparte du même écran ; qui
  // veut le filtre le rallume, et son choix est alors réenregistré.
  delete out.lodgOnlyAvailable
  delete out.lodgMapSync

  // Schéma 8 — masquer les non-annoncées par défaut (`matchesDemand`).
  if ((saved.prefsSchema ?? 0) < 8) delete out.lodgHideUnannounced

  // Schéma 9 — uniquement dispo confirmée + prix de séjour formel + plancher.
  if ((saved.prefsSchema ?? 0) < 9) {
    out.lodgOnlyAvailable = true
    out.lodgConfirmedPrices = true
    out.lodgHideUnannounced = true
  }

  // Schéma 10 — ne plus afficher un hôtel comme retenu sans geste explicite.
  if ((saved.prefsSchema ?? 0) < 10) out.selLodgings = {}

  // Schéma 7 — rerattachement par la position. Voir `rerattacherParPosition`.
  const rattache = rerattacherParPosition(out.imported)
  if (rattache && rattache.deplacees > 0) out.imported = rattache.list

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

  return out as Partial<AppState>
}

function forgetInventedCapacity(imported: Lodging[] | undefined): Lodging[] {
  if (!Array.isArray(imported)) return []
  return imported.map((lodging) =>
    lodging.src === 'Airbnb' || lodging.src === 'OSM → Airbnb'
      ? // `ch` n'est plus effacé depuis le 2026-08-30. Il valait toujours zéro
        // pour Airbnb — rien ne le remplissait — et l'effacer ne coûtait rien.
        // Depuis, `airbnbClip.tailleAnnoncee` lit « 2 chambres » sur la carte :
        // c'est une donnée publiée, pas une capacité devinée, et l'effacer
        // rejouerait le défaut que cette fonction corrige. Seule la capacité en
        // personnes reste remise à zéro, parce qu'elle seule a été inventée.
        { ...lodging, pers: 0 }
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

/**
 * Une URL, une annonce.
 *
 * L'URL est l'identité d'une annonce partout ailleurs — clé de déduplication du
 * relevé, source de l'identifiant local, clé de rapprochement de
 * `mergeProviderReadings`. Deux entrées qui la partagent sont donc la même
 * annonce enregistrée deux fois, jamais deux biens.
 *
 * Le cas qui l'a rendue nécessaire : une URL de fiche corrigée. L'ancienne
 * entrée et la nouvelle portaient deux adresses pour un seul logement, et
 * `repairCentralUrls` vient de les ramener à la même — sans ce passage, elles
 * resteraient côte à côte dans la liste, l'une menant à une page morte.
 *
 * On garde la **dernière** : c'est le relevé le plus récent. Sauf si elle n'a
 * pas de prix et qu'une précédente en a un — un relevé muet n'efface pas un
 * prix déjà mesuré, la même asymétrie que `mergeProviderReadings`.
 */
function dropDuplicateUrls(imported: Lodging[]): Lodging[] {
  const byUrl = new Map<string, Lodging>()
  const out: Lodging[] = []

  for (const lodging of imported) {
    if (!lodging.url) {
      out.push(lodging)
      continue
    }
    const seen = byUrl.get(lodging.url)
    if (!seen) {
      byUrl.set(lodging.url, lodging)
      out.push(lodging)
      continue
    }
    const garde = lodging.total > 0 || seen.total <= 0 ? lodging : seen
    byUrl.set(lodging.url, garde)
    out[out.indexOf(seen)] = garde
  }

  return out
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
      // Absence de préférences = premier lancement. L'écran de bienvenue ne
      // s'ouvre plus : l'accueil dit déjà ce qu'il y a dans la base, et une
      // fenêtre posée dessus au premier lancement cache précisément ce qu'on
      // vient regarder. Les trois réglages qu'elle demandait se règlent dans
      // les filtres, où ils vivent de toute façon le reste du temps.
      if (!raw) return { ...base, ...(demo ?? {}) }
      const saved = migratePrefs(JSON.parse(raw) as Partial<AppState> & { prefsSchema?: number })
      return {
        ...base,
        ...saved,
        // L'ordre compte : on répare les URL d'abord, on fusionne ensuite —
        // c'est la réparation qui fait converger l'ancienne entrée et la
        // nouvelle sur une même adresse.
        imported: dropDuplicateUrls(repairCentralUrls(forgetInventedCapacity(saved.imported))),
        ...(demo ?? {})
      }
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
    const payload: Record<string, unknown> = { prefsSchema: PREFS_SCHEMA }
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
