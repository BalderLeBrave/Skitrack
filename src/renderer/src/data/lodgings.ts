/**
 * Offres de logement.
 *
 * Les connecteurs partenaires (Expedia Rapid, Booking Demand) ne sont pas
 * branchés — ils sont bloqués sur une validation de compte, voir
 * `docs/RISQUES.md`. En attendant, les offres sont dérivées d'un catalogue de
 * biens types, réindexé sur le niveau de prix du domaine et sur la semaine
 * choisie. Toute la chaîne en aval — filtres, fusion des doublons, médiane,
 * comparateur, suivi de prix — travaille sur la même forme d'objet que ce que
 * renverront les connecteurs, et n'aura rien à changer le jour où ils
 * arriveront.
 */

import type { Domain } from './referentiel'
import type { Language } from '@/i18n'
import { translate } from '@/i18n'

export interface LodgingTemplate {
  name: string
  type: string
  /** Capacité en couchages. `0` = la source ne l'annonce pas (cas des annonces
   *  Airbnb importées) : ni affichée, ni filtrée. */
  pers: number
  /** Nombre de chambres. `0` = non annoncé, même règle que `pers`. */
  ch: number
  m2: number | null
  note: string
  avis: number
  /** Distance aux pistes à pied, en mètres. */
  dist: number
  walk: number
  /** Dénivelé à remonter pour rejoindre les pistes, en mètres. */
  den: number
  skiIn: boolean
  src: string
  /** Clé de rapprochement des annonces du même bien sur plusieurs sources. */
  dup?: string
  /** Prix par personne et par nuit, avant indexation sur le domaine. */
  pp: number
  lift: string
  liftDist: number
  /** Écart d'altitude par rapport au front de neige. */
  altOff: number
  photo: string
}

/** Une offre concrète. `altOff` disparaît du contrat : une annonce importée
 *  porte son altitude absolue, calculée depuis sa position, pas un écart au
 *  front de neige. */
export interface Lodging extends Omit<LodgingTemplate, 'altOff'> {
  id: number
  annul: boolean
  total: number
  alt: number
  stock: number
  altOff?: number
  /** URL de l'annonce réelle. Absente sur les offres du catalogue simulé :
   *  il n'existe aucune page derrière elles. */
  url?: string
  /** Photo publiée par l'annonce importée, absente sinon. */
  image?: string | null
  /** Coordonnées de l'annonce importée, quand la source les fournit (LiteAPI,
   *  bloc de données Airbnb). Servent au calcul d'accès aux pistes par le moteur
   *  local ; absentes sur le catalogue simulé. */
  lat?: number
  lon?: number
  /** 'exact' ou 'approximate' : Airbnb ne publie qu'une position floue. */
  locPrecision?: 'exact' | 'approximate'
  /** Domaine auquel cette annonce a été rattachée à l'import. Une annonce
   *  importée pour Les 2 Alpes ne doit pas apparaître sous Val Thorens. */
  importDomainId?: number
  /** Dates du séjour pour lesquelles le prix a été relevé (AAAA-MM-JJ).
   *
   *  Un prix Airbnb n'est PAS une formule : c'est une photographie prise à des
   *  dates précises. Changer les dates de recherche le rend caduc, et seul
   *  Airbnb connaît le nouveau. On mémorise donc les dates du relevé pour
   *  pouvoir dire « ce prix ne vaut plus pour vos dates » au lieu de l'afficher
   *  comme s'il était toujours bon. */
  priceCheckIn?: string
  priceCheckOut?: string
  /** Vrai une fois les métriques d'accès calculées par le sidecar. Distingue
   *  « pas encore calculé » de « calculé, résultat = au pied des pistes ». */
  accessComputed?: boolean
  /**
   * Dernier relevé où l'annonce a **cessé d'apparaître**, à ses propres dates.
   *
   * Airbnb ne publie dans ses résultats que ce qui est libre aux dates
   * demandées : une annonce déjà connue qui n'y figure plus a, le plus souvent,
   * été réservée entre-temps. Elle n'est pas supprimée pour autant — un relevé
   * ne voit que les premiers écrans, et l'utilisateur a pu l'importer à la main
   * — mais elle porte désormais la marque, et la vignette le dit au lieu de
   * l'afficher comme réservable.
   */
  missingSince?: { checkIn: string; checkOut: string; at: number }
  /** Annonces du même bien écartées par la fusion des doublons. */
  dups?: { src: string; total: number }[]
}

export const LODG_TEMPLATES: LodgingTemplate[] = [
  { name: 'Résidence Cheval Blanc — 3 chambres', type: 'Appartement', pers: 6, ch: 3, m2: 68, note: '4,6', avis: 214, dist: 60, walk: 2, den: 5, skiIn: true, src: 'Expedia', dup: 'cheval-blanc', pp: 70, lift: 'TS Plein Sud', liftDist: 210, altOff: 5, photo: 'résidence front de neige' },
  { name: 'Studio cabine Roc de Péclet', type: 'Studio', pers: 4, ch: 1, m2: 28, note: '4,2', avis: 98, dist: 85, walk: 1, den: 2, skiIn: true, src: 'Expedia', pp: 42.5, lift: 'TC du Cairn', liftDist: 130, altOff: 42, photo: 'studio cabine' },
  { name: 'Les Néves — appartement 3 chambres', type: 'Appartement', pers: 6, ch: 3, m2: 75, note: '4,5', avis: 162, dist: 150, walk: 3, den: 12, skiIn: false, src: 'Expedia', dup: 'neves', pp: 77.6, lift: 'TS des 2 Lacs', liftDist: 260, altOff: -9, photo: 'appartement balcon sud' },
  { name: "Chalet L'Étape des Cimes", type: 'Chalet', pers: 8, ch: 4, m2: 110, note: '4,8', avis: 57, dist: 320, walk: 6, den: 24, skiIn: false, src: 'Airbnb', pp: 80, lift: 'Navette', liftDist: 80, altOff: -40, photo: 'chalet bois' },
  { name: 'Hôtel Le Sherpa — 2 chambres familiales', type: 'Hôtel', pers: 6, ch: 2, m2: null, note: '4,4', avis: 301, dist: 210, walk: 4, den: 9, skiIn: false, src: 'Booking.com', pp: 120, lift: 'TS Plein Sud', liftDist: 190, altOff: -5, photo: 'hôtel demi-pension' },
  { name: 'Gîte Le Bec Rouge — village', type: 'Gîte', pers: 4, ch: 2, m2: 52, note: '4,7', avis: 23, dist: 640, walk: 9, den: 35, skiIn: false, src: 'Gîtes de France', pp: 57.9, lift: 'TC du village', liftDist: 40, altOff: -120, photo: 'gîte de village' },
  { name: 'Appartement Sabaudia — vue vallée', type: 'Appartement', pers: 6, ch: 3, m2: 70, note: '4,4', avis: 88, dist: 180, walk: 4, den: 10, skiIn: false, src: 'Airbnb', pp: 69, lift: 'TS des Marmottes', liftDist: 220, altOff: -22, photo: 'appartement vue vallée' },
  { name: 'Chalet du Génépi — mi-hauteur', type: 'Chalet', pers: 6, ch: 3, m2: 82, note: '4,6', avis: 41, dist: 380, walk: 7, den: 22, skiIn: false, src: 'Gîtes de France', pp: 64, lift: 'Navette', liftDist: 110, altOff: -70, photo: 'chalet mi-hauteur' },
  { name: 'Résidence Les Balcons — duplex 4 chambres', type: 'Appartement', pers: 8, ch: 4, m2: 96, note: '4,3', avis: 141, dist: 120, walk: 2, den: 8, skiIn: true, src: 'Expedia', pp: 88, lift: 'TS du Bouquetin', liftDist: 150, altOff: 18, photo: 'duplex terrasse' },
  { name: 'Chalet Marmottière', type: 'Chalet', pers: 6, ch: 3, m2: 88, note: '4,5', avis: 76, dist: 430, walk: 7, den: 28, skiIn: false, src: 'Booking.com', pp: 74, lift: 'Navette', liftDist: 60, altOff: -55, photo: 'chalet mitoyen' },
  { name: 'Hôtel Les Cimes — chambres triples', type: 'Hôtel', pers: 6, ch: 2, m2: null, note: '4,1', avis: 188, dist: 95, walk: 2, den: 4, skiIn: true, src: 'Booking.com', pp: 104, lift: 'TC principale', liftDist: 110, altOff: 9, photo: 'hôtel front de neige' },
  { name: 'Studio Choucas — balcon est', type: 'Studio', pers: 4, ch: 1, m2: 31, note: '4,0', avis: 64, dist: 260, walk: 5, den: 14, skiIn: false, src: 'Expedia', pp: 39, lift: 'TS de l’Aiguille', liftDist: 290, altOff: -16, photo: 'studio balcon' },
  { name: 'Appartement particulier — Les Éterlous', type: 'Appartement', pers: 6, ch: 3, m2: 64, note: '4,3', avis: 31, dist: 240, walk: 5, den: 16, skiIn: false, src: 'Airbnb', pp: 58, lift: 'TS des Marmottes', liftDist: 260, altOff: -18, photo: 'appartement de particulier' },
  { name: 'Chalet familial Le Grand Cerf', type: 'Chalet', pers: 8, ch: 4, m2: 120, note: '4,6', avis: 19, dist: 520, walk: 8, den: 30, skiIn: false, src: 'Gîtes de France', pp: 66, lift: 'Navette', liftDist: 90, altOff: -85, photo: 'chalet familial' },
  { name: 'Résidence Le Grand Panorama — 2 chambres', type: 'Appartement', pers: 4, ch: 2, m2: 46, note: '4,2', avis: 127, dist: 90, walk: 2, den: 6, skiIn: true, src: 'Expedia', pp: 61, lift: 'TC du Praz', liftDist: 120, altOff: 12, photo: 'résidence pied des pistes' },
  { name: 'Appartement Les Mélèzes — plein sud', type: 'Appartement', pers: 4, ch: 2, m2: 52, note: '4,5', avis: 74, dist: 200, walk: 4, den: 14, skiIn: false, src: 'Airbnb', pp: 64, lift: 'TS des Crêtes', liftDist: 230, altOff: -12, photo: 'appartement plein sud' },
  { name: 'Appartement Le Belvédère — 4 chambres', type: 'Appartement', pers: 8, ch: 4, m2: 92, note: '4,7', avis: 53, dist: 140, walk: 3, den: 9, skiIn: false, src: 'Gîtes de France', pp: 82, lift: 'TC principale', liftDist: 160, altOff: 4, photo: 'appartement familial' },
  { name: 'Studio Les Edelweiss — coin montagne', type: 'Studio', pers: 2, ch: 1, m2: 22, note: '4,1', avis: 41, dist: 110, walk: 2, den: 5, skiIn: true, src: 'Booking.com', pp: 46, lift: 'TS du Village', liftDist: 130, altOff: 8, photo: 'studio compact' },
  { name: 'Appartement Le Hameau — rez-de-jardin', type: 'Appartement', pers: 6, ch: 3, m2: 66, note: '4,4', avis: 96, dist: 290, walk: 6, den: 18, skiIn: false, src: 'Gîtes de France', pp: 60, lift: 'Navette', liftDist: 70, altOff: -35, photo: 'appartement rez-de-jardin' },
  { name: 'Chalet Les Sapins — sauna', type: 'Chalet', pers: 10, ch: 5, m2: 145, note: '4,9', avis: 28, dist: 460, walk: 8, den: 26, skiIn: false, src: 'Airbnb', pp: 95, lift: 'Navette', liftDist: 100, altOff: -60, photo: 'chalet avec sauna' },
  { name: 'Résidence Alpina — studio cabine', type: 'Studio', pers: 4, ch: 1, m2: 30, note: '3,9', avis: 152, dist: 75, walk: 2, den: 3, skiIn: true, src: 'Expedia', pp: 44, lift: 'TC du Cairn', liftDist: 95, altOff: 15, photo: 'studio cabine résidence' },
  { name: 'Gîte La Bergerie — hameau', type: 'Gîte', pers: 6, ch: 3, m2: 78, note: '4,8', avis: 34, dist: 720, walk: 11, den: 42, skiIn: false, src: 'Gîtes de France', pp: 55, lift: 'Navette', liftDist: 150, altOff: -140, photo: 'gîte de hameau' },
  { name: 'Hôtel Le Névé — chambre familiale', type: 'Hôtel', pers: 4, ch: 1, m2: null, note: '4,3', avis: 244, dist: 130, walk: 3, den: 7, skiIn: false, src: 'Booking.com', pp: 112, lift: 'TC principale', liftDist: 140, altOff: 2, photo: 'hôtel de station' },
  { name: 'Appartement Le Chardon Bleu — duplex', type: 'Appartement', pers: 6, ch: 3, m2: 71, note: '4,6', avis: 62, dist: 165, walk: 3, den: 11, skiIn: false, src: 'Airbnb', pp: 67, lift: 'TS des 2 Lacs', liftDist: 190, altOff: -8, photo: 'duplex montagne' },
  { name: 'Chalet Le Refuge — mitoyen', type: 'Chalet', pers: 4, ch: 2, m2: 62, note: '4,4', avis: 47, dist: 350, walk: 6, den: 20, skiIn: false, src: 'Expedia', pp: 58, lift: 'TS du Bouquetin', liftDist: 300, altOff: -45, photo: 'chalet mitoyen bois' },
  { name: 'Résidence Les Cristaux — 2 chambres', type: 'Appartement', pers: 4, ch: 2, m2: 44, note: '4,0', avis: 183, dist: 105, walk: 2, den: 6, skiIn: true, src: 'Expedia', pp: 57, lift: 'TS Plein Sud', liftDist: 115, altOff: 6, photo: 'résidence front de neige' },
  { name: 'Appartement Le Solaret — vue sommet', type: 'Appartement', pers: 8, ch: 4, m2: 88, note: '4,5', avis: 71, dist: 220, walk: 4, den: 15, skiIn: false, src: 'Airbnb', pp: 79, lift: 'TC du Cairn', liftDist: 240, altOff: -14, photo: 'appartement vue sommet' },
  { name: 'Studio Le Traîneau — balcon ouest', type: 'Studio', pers: 3, ch: 1, m2: 26, note: '4,2', avis: 58, dist: 185, walk: 4, den: 10, skiIn: false, src: 'Booking.com', pp: 41, lift: 'TS des Marmottes', liftDist: 210, altOff: -10, photo: 'studio balcon ouest' },
  { name: 'Chalet Les Combes — grand séjour', type: 'Chalet', pers: 12, ch: 6, m2: 168, note: '4,7', avis: 22, dist: 540, walk: 9, den: 32, skiIn: false, src: 'Gîtes de France', pp: 88, lift: 'Navette', liftDist: 120, altOff: -75, photo: 'grand chalet' },
  { name: 'Appartement Les Ancolies — calme', type: 'Appartement', pers: 4, ch: 2, m2: 49, note: '4,3', avis: 88, dist: 245, walk: 5, den: 17, skiIn: false, src: 'Expedia', pp: 54, lift: 'TS de l’Aiguille', liftDist: 265, altOff: -20, photo: 'appartement au calme' },
  { name: 'Hôtel Les Glaciers — demi-pension', type: 'Hôtel', pers: 2, ch: 1, m2: null, note: '4,6', avis: 312, dist: 80, walk: 2, den: 4, skiIn: true, src: 'Expedia', pp: 138, lift: 'TC principale', liftDist: 90, altOff: 10, photo: 'hôtel demi-pension' },
  { name: 'Appartement Le Génépi — 1 chambre', type: 'Appartement', pers: 2, ch: 1, m2: 34, note: '4,1', avis: 66, dist: 160, walk: 3, den: 8, skiIn: false, src: 'Booking.com', pp: 48, lift: 'TS des Crêtes', liftDist: 180, altOff: -6, photo: 'petit appartement' },
  { name: 'Résidence Cheval Blanc — 3 chambres', type: 'Appartement', pers: 6, ch: 3, m2: 68, note: '4,6', avis: 189, dist: 60, walk: 2, den: 5, skiIn: true, src: 'Booking.com', dup: 'cheval-blanc', pp: 74, lift: 'TS Plein Sud', liftDist: 210, altOff: 5, photo: 'résidence front de neige' },
  { name: 'Les Néves — appartement 3 chambres', type: 'Appartement', pers: 6, ch: 3, m2: 75, note: '4,5', avis: 151, dist: 150, walk: 3, den: 12, skiIn: false, src: 'Airbnb', dup: 'neves', pp: 75.5, lift: 'TS des 2 Lacs', liftDist: 260, altOff: -9, photo: 'appartement balcon sud' }
]

export const LODG_TYPES = ['Appartement', 'Chalet', 'Studio', 'Hôtel', 'Gîte', 'Import']

/**
 * Sources hors moteur multi-sources.
 *
 * Airbnb est relevé par `runAirbnbSearch`, pas par un connecteur enregistré
 * dans `providers.search` : il ne figure dans aucun `outcome` et doit donc être
 * nommé ici. C'est la seule exception, et la liste s'arrête là.
 *
 * Tout le reste — Booking.com, la centrale de la station, une source MCP
 * déclarée par l'utilisateur — vient du moteur lui-même. Une liste tenue à la
 * main se désynchronise au premier connecteur retiré, et laisse derrière elle
 * des lignes de filtre qu'aucun relevé ne peut plus rafraîchir : décochables
 * sans effet, comptées à zéro, et comptées quand même dans le total annoncé par
 * l'écran de relevé. Une ligne pareille n'est pas un filtre, c'est un souvenir.
 *
 * Les annonces importées à la main n'y figurent pas non plus : ce n'est pas une
 * source qu'on interroge, c'est ce que l'utilisateur a ajouté lui-même. Elles
 * restent toujours visibles, et leur fraîcheur est traitée à part.
 */
export const BASE_SOURCES = ['Airbnb']

/**
 * Sources à afficher pour une liste d'offres donnée.
 *
 * `queried` est la liste des connecteurs réellement interrogés au dernier
 * relevé, tirée des `outcomes` de `runProviderSearch` — un connecteur y figure
 * même quand il n'a rendu aucune offre, ce qui est précisément ce qu'il faut
 * pour l'afficher décoché à zéro plutôt que de le faire disparaître.
 *
 * S'y ajoute toute source réellement présente dans les offres : une source MCP
 * déclarée par l'utilisateur porte le nom qu'il lui a donné, que ce fichier ne
 * peut pas connaître. Avant le premier relevé, `queried` est vide et la liste
 * se réduit au socle plus ce que les offres portent — on n'affiche que ce qu'on
 * a.
 */
export function lodgingSources(list: Lodging[], queried: string[] = []): string[] {
  const out = [...BASE_SOURCES]
  // Dédoublonnage sur le **libellé**, pas sur le connecteur : plusieurs
  // connecteurs peuvent servir la même marque — Booking a une API et un
  // scraper web, tous deux étiquetés « Booking.com ». Deux chemins vers le même
  // distributeur ne font pas deux sources à cocher, et les afficher en double
  // laisserait croire à deux inventaires distincts.
  const add = (source: string): void => {
    if (source !== MANUAL_SOURCE && !out.includes(source)) out.push(source)
  }
  for (const source of queried) add(source)
  for (const lodging of list) add(srcOf(lodging))
  return out
}

/** Étiquette portée par les annonces ajoutées par l'utilisateur. */
export const MANUAL_SOURCE = 'Import manuel'

interface SourceStatus {
  /** Âge du dernier relevé, en minutes. */
  min: number
  fail?: boolean
  since?: number
  manual?: boolean
}

/**
 * Âge du dernier relevé, **pour le catalogue simulé uniquement**.
 *
 * Une source absente de cette table n'a pas d'âge simulé : ses offres viennent
 * forcément du dernier relevé réel. `freshnessOf` le dit alors franchement au
 * lieu d'inventer une durée — c'est le cas des centrales de station et de toute
 * source MCP déclarée, et c'est le comportement voulu.
 *
 * Expedia et Gîtes de France en sont sortis avec leurs connecteurs : garder
 * leur âge simulé aurait fait vieillir des offres que plus rien n'interroge.
 */
export const SRC_STATUS: Record<string, SourceStatus> = {
  Airbnb: { min: 38 },
  'Booking.com': { min: 47 },
  'Import manuel': { min: 0, manual: true }
}

/** Au-delà de 48 h, un relevé n'est plus une information de prix fiable. */
export const STALE_MIN = 2880

export function srcOf(lodging: Pick<Lodging, 'src'>): string {
  return lodging.src.indexOf('Import') === 0 ? 'Import manuel' : lodging.src
}

export function trackKey(lodging: Pick<Lodging, 'name' | 'src'>): string {
  return `${lodging.name}|${lodging.src}`
}

/**
 * Durée écoulée, **sans** la tournure « il y a ».
 *
 * Séparée de `agoTxt` parce que la pastille compacte d'une vignette affiche
 * « ↻ 38 min » et non « ↻ il y a 38 min ». La tentation serait de retirer le
 * préfixe de la chaîne complète : cela ne marche que pour les langues qui en
 * ont un, et l'anglais place le sien en suffixe.
 */
export function agoCore(m: number, lang: Language): string {
  if (m < 60) return `${m} ${translate('minutes', lang)}`
  if (m < 1440) {
    return `${Math.floor(m / 60)} ${translate('hours', lang)} ${String(m % 60).padStart(2, '0')}`
  }
  const d = Math.floor(m / 1440)
  return `${d} ${translate('days_short', lang)} ${Math.floor((m % 1440) / 60)} ${translate('hours', lang)}`
}

/**
 * Durée écoulée en toutes lettres.
 *
 * Un motif unique avec `{d}` plutôt qu'un préfixe et un suffixe séparés : une
 * chaîne vide volontaire — l'anglais n'a pas de préfixe — serait indistinguable
 * d'une traduction manquante et retomberait sur le français.
 */
export function agoTxt(m: number, lang: Language): string {
  return translate('ago_pattern', lang).replace('{d}', agoCore(m, lang))
}

export interface Freshness {
  txt: string
  /** Forme compacte pour la pastille d'une vignette, sans « il y a ». */
  short: string
  stale: boolean
  fail: boolean
}

export function freshnessOf(lodging: Lodging, lang: Language): Freshness {
  const st = SRC_STATUS[srcOf(lodging)]
  // Une annonce collée à l'instant (import Airbnb/OSM par l'utilisateur) ne
  // provient pas d'un relevé automatique planifié : lui attribuer « relevé il y
  // a 38 min » serait faux. On la reconnaît à l'absence de métrique d'accès —
  // le moteur ne l'a pas traitée — et on affiche un état neutre et honnête.
  const justAdded = lodging.dist === 0 && lodging.den === 0 && lodging.liftDist === 0 && !lodging.skiIn
  if (justAdded && lodging.url) {
    const txt = translate('fresh_just_added', lang)
    return { txt, short: txt, stale: false, fail: false }
  }
  if (st?.manual) {
    const txt = translate('fresh_manual', lang)
    return { txt, short: txt, stale: false, fail: false }
  }
  // Source hors catalogue simulé : ses offres sont celles du dernier relevé.
  if (!st) {
    return {
      txt: translate('fresh_last_search', lang),
      short: translate('fresh_last_search_short', lang),
      stale: false,
      fail: false
    }
  }
  if (st.fail) {
    return {
      txt: `${translate('fresh_source_down', lang)} ${agoTxt(st.since ?? 0, lang)}`,
      short: translate('fresh_source_down', lang),
      stale: true,
      fail: true
    }
  }
  const m = st.min + (lodging.id % 7)
  return {
    txt: `${translate('fresh_recorded', lang)} ${agoTxt(m, lang)}`,
    short: `↻ ${agoCore(m, lang)}`,
    stale: m > STALE_MIN,
    fail: false
  }
}

export interface SourceHealth {
  total: number
  ok: number
  down: string[]
  late: string[]
}

/**
 * État des sources **réellement interrogées**.
 *
 * La liste est un paramètre et n'a pas de valeur de repli : annoncer « les 7
 * sources sont à jour » quand le moteur n'en interroge que trois est un
 * mensonge que le code ne doit pas pouvoir produire par distraction.
 */
export function sourceHealth(sources: string[]): SourceHealth {
  const keys = sources
  const down: string[] = []
  const late: string[] = []
  for (const k of keys) {
    const st = SRC_STATUS[k] ?? { min: 0 }
    if (st.fail) down.push(k)
    else if (st.min > STALE_MIN) late.push(k)
  }
  return { total: keys.length, ok: keys.length - down.length - late.length, down, late }
}

/**
 * Offres d'un domaine pour un séjour donné.
 *
 * `weekFactor` est l'écart de prix national de la semaine choisie : il déplace
 * tout le niveau de prix du domaine. `priceIndex` (0 à 1) porte l'écart
 * structurel entre une station de renom et une station de proximité — c'est le
 * score de pertinence normalisé, faute de relevé de prix par station.
 */
export function lodgingsFor(
  domain: Domain,
  pers: number,
  nights: number,
  weekFactor: number,
  priceIndex: number
): Lodging[] {
  const k = (0.75 + priceIndex * 0.4) * (1 + weekFactor)
  return LODG_TEMPLATES.map((t, i) => {
    const pp = Math.round(t.pp * k * 2) / 2
    return {
      ...t,
      id: i + 1,
      pp,
      annul: i % 3 !== 2,
      total: Math.round((pp * pers * nights) / 10) * 10,
      alt: (domain.village || domain.min) + t.altOff,
      stock: 1 + ((i * 5 + domain.id * 3) % 6)
    }
  })
}

/**
 * Fusion des annonces du même bien publiées sur plusieurs sources.
 * L'offre la moins chère est conservée ; les autres restent visibles en note
 * pour qu'on voie l'écart plutôt que de le cacher.
 */
export function mergeDupes(list: Lodging[], enabled: boolean): Lodging[] {
  if (!enabled) return list.map((l) => ({ ...l, dups: [] }))
  const by: Record<string, Lodging> = {}
  const out: Lodging[] = []
  for (const l of list) {
    const k = l.dup ?? `u${l.id}`
    const kept = by[k]
    if (!kept) {
      const copy: Lodging = { ...l, dups: [] }
      by[k] = copy
      out.push(copy)
      continue
    }
    if (l.total < kept.total) {
      const dups = (kept.dups ?? []).concat([{ src: kept.src, total: kept.total }])
      Object.assign(kept, l, { dups })
    } else {
      kept.dups = (kept.dups ?? []).concat([{ src: l.src, total: l.total }])
    }
  }
  return out
}

export function medianTotal(list: Lodging[]): number {
  const v = list.map((l) => l.total).sort((a, b) => a - b)
  if (v.length === 0) return 0
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2)
}

export interface Deal {
  txt: string
  color: string
}

/** Un prix ne se juge que par rapport au marché du domaine, pas dans l'absolu. */
export function dealOf(lodging: Lodging, median: number): Deal | null {
  if (!median) return null
  const pct = Math.round((lodging.total / median - 1) * 100)
  if (pct <= -12) return { txt: `Bon plan · ${pct} % sous la médiane du domaine`, color: 'var(--ok)' }
  if (pct >= 15) return { txt: `Au-dessus du marché · +${pct} % vs médiane`, color: 'var(--warn)' }
  return null
}

export function siteOf(url: string): string {
  if (/airbnb/i.test(url)) return 'Airbnb'
  if (/gites/i.test(url)) return 'Gîtes de France'
  if (/booking/i.test(url)) return 'Booking.com'
  return 'Web'
}
