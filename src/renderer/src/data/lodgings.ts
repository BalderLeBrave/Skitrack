/**
 * Offres de logement.
 *
 * Toute offre affichée vient d'un relevé ou d'une saisie : les centrales de
 * réservation des stations, Booking.com, le relevé Airbnb collé par
 * l'utilisateur, les annonces importées par URL ou ajoutées à la main. Il n'y a
 * **pas** de catalogue de biens types.
 *
 * Il en a existé un — trente-quatre logements fictifs réindexés sur le niveau
 * de prix du domaine — et il alimentait encore les écrans Offres, Combinaisons
 * et Décision, sans que rien ne le dise sur ces écrans-là. L'écran Logements en
 * avait été dégagé ; les trois autres non : ils affichaient donc des prix
 * calculés par formule à côté de prix relevés, dans la même typographie.
 *
 * Ce qui distingue les offres entre elles n'est donc pas leur réalité, c'est
 * leur provenance : `srcOf` donne la source affichée, `freshnessOf` la date du
 * relevé — et dit quand elle n'est pas connue plutôt que d'en fabriquer une.
 */
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
  /** URL de l'annonce. Absente des cartes-redirection OpenStreetMap, qui
   *  situent un hébergement sans pointer d'annonce à ouvrir. */
  url?: string
  /** Photo publiée par l'annonce importée, absente sinon. */
  image?: string | null
  /** Coordonnées de l'annonce importée, quand la source les fournit (LiteAPI,
   *  bloc de données Airbnb). Servent au calcul d'accès aux pistes par le moteur
   *  local ; absentes quand la source ne publie pas de position. */
  lat?: number
  lon?: number
  /** 'exact' ou 'approximate' : Airbnb ne publie qu'une position floue. */
  locPrecision?: 'exact' | 'approximate'
  /**
   * Nombre de **pièces**, tel que la source l'annonce. Absent si elle se tait.
   *
   * Les centrales françaises comptent en pièces — « 2 pièces », « 7 pièces » —
   * et n'annoncent presque jamais de chambres : `ch` y reste donc à zéro. Les
   * deux champs cohabitent sans se traduire l'un l'autre, parce qu'une pièce
   * n'est pas une chambre : un « 2 pièces » a un séjour et une chambre, un
   * studio est un « 1 pièce » et n'a aucune chambre.
   *
   * La conversion n'a lieu **que dans le filtre**, et sur la demande de
   * l'utilisateur, jamais sur la donnée — voir `data/lodgingFilter.ts`. Ce
   * champ garde ce que la centrale a publié, et la vignette l'affiche tel quel.
   */
  rooms?: number
  /**
   * Meilleur tarif par occupation, quand la centrale publie un barème.
   *
   * `total` porte celui du groupe demandé ; celles-ci disent ce que coûterait
   * un groupe plus petit ou plus grand. Une centrale Orchestra facture 1 161 €
   * à deux et 2 736 € à six pour le même appartement : cacher l'écart, c'est
   * laisser croire à un prix unique.
   *
   * Trié par occupation croissante. Absent partout ailleurs.
   */
  priceOptions?: { guests: number; total: number; condition?: string; policy?: string }[]
  /** Domaine auquel cette annonce a été rattachée à l'import. Une annonce
   *  importée pour Les 2 Alpes ne doit pas apparaître sous Val Thorens. */
  importDomainId?: number
  /**
   * Nom **technique** du connecteur qui a rapporté l'annonce (`station-web`,
   * `ceto-chamonix`, `booking`…).
   *
   * `src` porte le libellé affiché, et plusieurs connecteurs partagent
   * désormais le même : toutes les centrales de station s'affichent sous
   * `CENTRALE_SOURCE`. Le libellé ne suffit donc plus à savoir *quel* site a
   * répondu — or l'ouverture d'une annonce en a besoin, chaque centrale
   * n'attendant pas les mêmes paramètres de séjour dans son URL. On garde donc
   * le connecteur à côté du libellé plutôt que de le déduire d'un nom d'hôte.
   *
   * Absent sur les imports manuels et sur le relevé Airbnb, qui ne passent pas
   * par le moteur multi-sources.
   */
  srcConnector?: string
  /** Dates du séjour pour lesquelles le prix a été relevé (AAAA-MM-JJ).
   *
   *  Un prix Airbnb n'est PAS une formule : c'est une photographie prise à des
   *  dates précises. Changer les dates de recherche le rend caduc, et seul
   *  Airbnb connaît le nouveau. On mémorise donc les dates du relevé pour
   *  pouvoir dire « ce prix ne vaut plus pour vos dates » au lieu de l'afficher
   *  comme s'il était toujours bon. */
  priceCheckIn?: string
  priceCheckOut?: string
  /**
   * Taille de groupe pour laquelle la source a **rendu** cette annonce.
   *
   * Airbnb, Booking et les centrales filtrent leurs résultats par le nombre de
   * voyageurs demandé — `adults=8`, `group_adults=8`, `search[capacity]=8` sont
   * dans l'URL de chaque relevé. Une annonce rendue pour huit accueille donc au
   * moins huit, même quand sa fiche ne publie pas de capacité exacte.
   *
   * Cette information était **jetée**, et le filtre classait ensuite ces
   * annonces « capacité non annoncée » — en accusant la source, à tort : c'est
   * le relevé qui ne rapportait pas ce qu'il savait. Constaté le 2026-08-29 sur
   * 96 annonces Airbnb et 51 Booking, toutes à `pers = 0`.
   *
   * Ce n'est pas une capacité : demander ensuite dix voyageurs rend ce plancher
   * muet, et l'annonce redevient non jugeable. `pers`, quand la source le
   * publie, prime toujours.
   */
  fitsGuests?: number
  /**
   * Plancher chambres appliqué par la source (filtre SERP), pas un décompte
   * publié. Deskline POST `bedrooms: [4,5,…]`.
   */
  fitsBedrooms?: number
  /** Statut relevé par le connecteur, quand il le pose. */
  availabilityStatus?: 'available' | 'unavailable' | 'unknown' | 'listing_gone'
  /** Page 0-based de la SERP. */
  searchPageIndex?: number
  /** Distances : `ok` seulement après `enrichWithAccess`. Sans GPS : `no_gps`. */
  distanceStatus?: 'ok' | 'no_gps' | 'no_slope_geom' | 'skipped'
  /**
   * Heure du relevé qui a rapporté **cette** annonce.
   *
   * `state.lastScan` est un scalaire unique : relever l'Alpe d'Huez à 10 h puis
   * Chamonix à 12 h faisait afficher « ↻ 0 min » sur les annonces de l'Alpe
   * d'Huez, encore en mémoire. C'est très en dessous de l'ancienne table d'âges
   * en dur, mais c'est encore une date que ces annonces n'ont pas.
   *
   * Absent des annonces d'avant ce champ : `freshnessOf` retombe alors sur
   * `lastScan`, et sur « date non enregistrée » quand celui-ci manque aussi.
   */
  scannedAt?: number
  /** Vrai une fois les métriques d'accès calculées par le sidecar. Distingue
   *  « pas encore calculé » de « calculé, résultat = au pied des pistes ». */
  /**
   * Ce qui a servi à mesurer `dist` : une piste, ou une gare de remontée.
   *
   * Le sidecar rend « la plus courte des deux distances », ce qu'il documente
   * comme « le point skiable le plus proche ». L'étiquette de l'interface, elle,
   * disait « m des pistes » dans tous les cas — or `domain_slope` n'est
   * alimentée par aucun chemin d'ingestion (constaté le 2026-08-30, table vide
   * après import), si bien que la mesure porte **toujours** sur une remontée.
   * L'écran annonçait donc une distance à la piste qu'il n'avait jamais
   * calculée. Ce champ dit lequel des deux a gagné, et l'étiquette suit.
   */
  accessPoint?: 'piste' | 'remontee'
  accessComputed?: boolean
  /**
   * Comment on rejoint le point skiable, d'après le moteur local.
   *
   * `skis_aux_pieds`, `navette` ou `voiture`. Cette information était calculée
   * puis **jetée** : seul `skiIn` en était retenu. Les deux autres valeurs
   * disparaissaient, et la fiche annonçait un temps de marche pour un accès qui
   * se fait en voiture — 1 416 m devenaient « 28 min » sans dire à pied de
   * quoi. Un temps de marche n'a de sens que si l'on marche.
   */
  accessType?: 'skis_aux_pieds' | 'navette' | 'voiture'
  /**
   * Dernier relevé où l'annonce a **cessé d'apparaître**, à ses propres dates.
   *
   * Une annonce déjà connue qui ne figure plus dans un relevé couvrant ses
   * propres dates a, le plus souvent, été réservée entre-temps. Elle n'est pas
   * supprimée pour autant — un relevé ne voit que les premiers écrans, et
   * l'utilisateur a pu l'importer à la main — mais elle porte désormais la
   * marque, et la vignette le dit au lieu de l'afficher comme réservable.
   *
   * Attention : l'inverse ne se déduit pas. Figurer dans les résultats ne
   * prouve pas la disponibilité — Airbnb liste aussi ce qu'il ne peut pas
   * vendre, sans prix. Voir `data/lodgingAvailability.ts`.
   */
  missingSince?: { checkIn: string; checkOut: string; at: number }
  /** Annonces du même bien écartées par la fusion des doublons. */
  dups?: { src: string; total: number }[]
  /**
   * Fiabilité du montant affiché, telle que le connecteur l'a qualifiée.
   *
   * - `total_confirmed` : prix du séjour pour les dates demandées
   * - `partial` : « à partir de » / tarif indicatif
   * - `unknown` : montant absent ou non qualifié (carte-redirection)
   *
   * Absent sur les imports manuels anciens.
   */
  priceConfidence?: 'total_confirmed' | 'partial' | 'unknown'
  /**
   * Tarif **par nuit** quand la source le publie ainsi (CozyCozy :
   * « À partir de N €/nuit »). Absent si le montant est un total de séjour.
   * On ne multiplie jamais `nightly` × nuits pour fabriquer `total`.
   */
  nightly?: number
  /**
   * Tarif d'appel **à la semaine** (Gîtes de France :
   * « À partir de N € par semaine »). Absent si le montant est un total daté.
   * On ne le convertit jamais en séjour.
   */
  weekly?: number
  /** Hash d'identité du bien (URL canonique), posé à l'import par URL. */
  listingHash?: string
  offerHash?: string
  /** Prix d'appel (« à partir de ») — jamais un total comparable. */
  priceIsFrom?: boolean
  priceFlags?: string[]
  geoPrecision?: 'exact' | 'approximate' | 'none'
  feesBreakdown?: {
    cleaning?: number
    touristTax?: number
    service?: number
    utilities?: number
    deposit?: number
    depositRefundable?: boolean
    isComplete: boolean
  }
}

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
 * Montant à afficher et son unité.
 *
 * Gîtes publie un tarif d'appel à la semaine : `weekly` est rempli, `total`
 * reste 0 tant que le widget ITEA n'a pas calculé le séjour.
 * On n'invente pas un séjour (nightly × nuits, weekly × semaines).
 */
export function priceShown(lg: Pick<Lodging, 'total' | 'nightly' | 'weekly'>): {
  amount: number
  unit: 'stay' | 'night' | 'week' | 'none'
} {
  if (lg.total > 0) return { amount: lg.total, unit: 'stay' }
  if (lg.nightly != null && lg.nightly > 0) return { amount: lg.nightly, unit: 'night' }
  if (lg.weekly != null && lg.weekly > 0) return { amount: lg.weekly, unit: 'week' }
  return { amount: 0, unit: 'none' }
}

export function hasPricedOffer(lg: Pick<Lodging, 'total' | 'nightly' | 'weekly'>): boolean {
  return priceShown(lg).unit !== 'none'
}

/** URL http(s) publiée par l'annonce. Relatif, data: et le nom du logement ne passent pas. */
export function publishedPhotoUrl(lg: Pick<Lodging, 'image' | 'photo'>): string | null {
  if (typeof lg.image === 'string' && /^https?:\/\//i.test(lg.image)) return lg.image
  if (typeof lg.photo === 'string' && /^https?:\/\//i.test(lg.photo)) return lg.photo
  return null
}

/**
 * Paramètres de séjour / tracking : ils changent l'URL, pas le logement.
 * Dump Gîtes : `?adults=8&children=0&infants=0` vs la même fiche datée.
 * Dump Abritel : `startDate` / `adults` posés par `abritelCanonicalUrl`.
 */
const LISTING_URL_NOISE =
  /^(adults?|children|child|infants?|travelers?|guests?|personnes|adultes|enfants|nb_personnes|date-start|date-end|datedeb|datefin|duree|checkin|checkout|startDate|endDate|chkin|chkout|group_adults|group_children|no_rooms|selected_currency|lang|label|mp[abdeq]|camref|clickedRef|dest_id|dest_type|sb_travel_purpose|cid|action|type_date|type_prestataire|criteres(\[\])?|search|offset|page|rows|startIndex|sb|nflt|order|aid|sid|from|to|utm_.*)$/i

function foldListingName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Identité d'une fiche, hors dates et voyageurs.
 *
 * Sans ça, le même Gîte (38G253122) ou le même Abritel (p6410325a) entre
 * deux fois : une URL avec `adults=8`, une avec les dates. La liste les
 * montrait comme deux appartements.
 */
export function listingKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const gites = url.match(/(\d{2}g\d{3,})/i)
  if (gites) return `gites:${gites[1].toUpperCase()}`
  const airbnb = url.match(/airbnb\.[^/]+\/rooms\/(\d+)/i)
  if (airbnb) return `airbnb:${airbnb[1]}`
  const abritel = url.match(/(?:abritel\.fr|vrbo\.com)\/(?:location-vacances\/)?(p\d+[a-z]?|\d{6,})/i)
  if (abritel) return `abritel:${abritel[1].toLowerCase()}`
  const booking = url.match(/booking\.com\/hotel\/([^?#]+)/i)
  if (booking) return `booking:${booking[1].replace(/\/+$/, '').toLowerCase()}`
  try {
    const u = new URL(url)
    let host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (host === 'vrbo.com') host = 'abritel.fr'
    for (const key of [...u.searchParams.keys()]) {
      if (LISTING_URL_NOISE.test(key)) u.searchParams.delete(key)
    }
    const path = (u.pathname.replace(/\/+$/, '') || '/')
      .replace(/-?\d+-personnes?/gi, '')
      .replace(/\/{2,}/g, '/')
    const qs = u.searchParams.toString()
    return `url:${host}${path}${qs ? `?${qs}` : ''}`
  } catch {
    const stripped = url.split('#')[0]?.split('?')[0]?.replace(/\/+$/, '')
    return stripped ? `url:${stripped.toLowerCase()}` : null
  }
}

export function listingKey(
  lg: Pick<Lodging, 'url' | 'id' | 'name' | 'src' | 'pers' | 'ch'> & {
    srcConnector?: string
    lat?: number
    lon?: number
  }
): string {
  const fromUrl = listingKeyFromUrl(lg.url)
  if (fromUrl && !fromUrl.startsWith('url:')) return fromUrl
  const name = foldListingName(lg.name ?? '')
  const geo =
    lg.lat != null && lg.lon != null ? `${lg.lat.toFixed(4)},${lg.lon.toFixed(4)}` : ''
  // Nom distinctif + GPS : même appart Booking / centrale, URLs différentes.
  // On exige un identifiant dans le nom (n° 12), pas « studio 4 personnes ».
  if (name.length >= 16 && geo && /\bn(?:o|°)?\s*\d+\b|\bapt\.?\s*\d+\b/.test(name)) {
    return `geo:${name}:${geo}`
  }
  if (fromUrl) return fromUrl
  const src = foldListingName(srcOf(lg))
  if (name.length >= 16 && src) {
    return `name:${src}:${name}${geo ? `:${geo}` : ''}`
  }
  return `u${lg.id}`
}

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
    if (source !== MANUAL_SOURCE && !out.includes(source) && !/cozycozy|tourinsoft/i.test(source)) {
      out.push(source)
    }
  }
  for (const source of queried) add(source)
  for (const lodging of list) add(srcOf(lodging))
  return out
}

/** Étiquette portée par les annonces ajoutées par l'utilisateur. */
export const MANUAL_SOURCE = 'Import manuel'

/**
 * Libellé unique des centrales de réservation de station.
 *
 * Une centrale n'est pas une marque que l'utilisateur choisit : c'est *le*
 * circuit de réservation en direct de la station qu'il regarde, quel que soit
 * le prestataire qui l'opère — Ingénie, Orchestra/Ceto, Ublo/MSEM, Open
 * System. Les afficher séparément revenait à demander de cocher un fournisseur
 * de logiciel : sept lignes de filtre dont six restaient vides sur une station
 * donnée, parce qu'une station n'a qu'une centrale. Elles n'ont donc qu'un
 * libellé, et le connecteur exact reste lisible dans `srcConnector`.
 */
export const CENTRALE_SOURCE = 'Centrale de réservation'

/**
 * Libellés de centrales d'avant le regroupement.
 *
 * Les offres relevées sont enregistrées (`imported`) : celles d'hier portent
 * encore l'ancien libellé. Sans cette table, elles ouvriraient chacune leur
 * propre puce de filtre à côté de « Centrale de réservation » — exactement les
 * lignes que ce regroupement supprime. On les ramène donc au libellé commun à
 * la lecture, sans réécrire ce qui est sur le disque.
 */
const LEGACY_CENTRALE_SOURCES = new Set([
  'Site officiel de la station',
  'Chamonix Réservation',
  'Méribel Réservation',
  'La Plagne Resort',
  'Megève Réservation',
  'Centrale Ublo',
  'Centrale Open System'
])

/** Au-delà de 48 h, un relevé n'est plus une information de prix fiable. */
export const STALE_MIN = 2880

/**
 * Source **affichée** d'une offre.
 *
 * Deux normalisations, et elles ont la même raison d'être : ce qui est écrit
 * dans `src` est ce qu'un relevé y a laissé, pas ce que l'utilisateur doit
 * lire. Les imports portent un suffixe de provenance, les centrales portaient
 * le nom de leur prestataire. L'écran de filtres compare des libellés — il faut
 * donc qu'un même circuit de réservation en produise toujours un seul.
 */
export function srcOf(lodging: Pick<Lodging, 'src'>): string {
  if (lodging.src.indexOf('Import') === 0) return MANUAL_SOURCE
  if (LEGACY_CENTRALE_SOURCES.has(lodging.src)) return CENTRALE_SOURCE
  if (lodging.src === 'VRBO' || lodging.src === 'vrbo' || lodging.src === 'vrbo-web') return 'Abritel'
  return lodging.src
}

/**
 * Logement vraiment retenu pour ce domaine : un identifiant posé par
 * « Retenir », encore présent dans la liste. Pas le moins cher, pas un
 * reliquat d'une session précédente dont l'annonce a disparu.
 */
export function keptLodgingId(
  selLodgings: Record<number, number> | undefined,
  domainId: number,
  list: readonly { id: number }[]
): number | null {
  if (!selLodgings) return null
  const id = selLodgings[domainId]
  if (typeof id !== 'number' || !Number.isFinite(id) || id <= 0) return null
  return list.some((lg) => lg.id === id) ? id : null
}

/**
 * Taille du logement, dans l'unité que la source a publiée.
 *
 * Chambres si elle les annonce, pièces sinon — jamais les deux, jamais l'une
 * traduite en l'autre. Les centrales françaises ne publient que des pièces :
 * sur les 924 logements du catalogue de l'Alpe d'Huez, aucun n'annonce de
 * chambre et 683 annoncent des pièces. Écrire « 1 ch » devant un deux-pièces
 * serait une convention d'annonce présentée comme une mesure.
 *
 * `null` quand la source se tait — la vignette n'affiche alors rien plutôt
 * qu'un zéro.
 */
export function sizeLabel(
  lodging: Pick<Lodging, 'ch' | 'rooms'>,
  t: (key: 'lodg_rooms_count' | 'lodg_rooms_count_one') => string
): string | null {
  if (lodging.ch) return `${lodging.ch} ch`
  const rooms = lodging.rooms
  if (!rooms) return null
  return t(rooms > 1 ? 'lodg_rooms_count' : 'lodg_rooms_count_one').replace('{n}', String(rooms))
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
}

/**
 * Depuis quand le prix affiché est-il connu.
 *
 * Quatre cas, et aucun n'invente de durée. Une annonce ajoutée à l'instant le
 * dit ; une annonce saisie à la main n'a pas de relevé derrière elle ; une
 * annonce rapportée par un relevé porte l'horodatage de **ce** relevé ; et
 * quand cet horodatage manque — offres relues du disque au lancement, avant
 * tout nouveau relevé — la fonction l'écrit au lieu de fabriquer un âge.
 *
 * Il en existait un cinquième, et c'était le seul faux. Une table d'âges en
 * dur — Airbnb 38 min, Booking.com 47 min — à laquelle s'ajoutait `id % 7`
 * pour varier d'une vignette à l'autre : la pastille annonçait « ↻ 41 min »
 * sous des prix relevés l'avant-veille, ou jamais relevés du tout. C'est la
 * donnée la plus périssable de l'application, et c'était la seule dont
 * l'ancienneté était inventée.
 *
 * `lastScan` est l'horodatage du dernier relevé de logements (`state.lastScan`,
 * écrit par `LodgingsPage`). Il n'est pas persisté, et c'est voulu : au
 * lancement suivant, les offres relues du disque n'ont plus de relevé daté
 * derrière elles, et il vaut mieux le dire.
 */
export function freshnessOf(lodging: Lodging, lang: Language, lastScan: number | null): Freshness {
  // L'horodatage de l'annonce prime sur celui du dernier relevé, quel qu'il
  // soit : c'est le seul qui parle de cette annonce-là.
  const propre = lodging.scannedAt ?? lastScan
  // Une annonce collée à l'instant (import Airbnb/OSM par l'utilisateur) ne
  // provient pas d'un relevé automatique planifié. On la reconnaît à l'absence
  // de métrique d'accès — le moteur ne l'a pas traitée.
  const justAdded = lodging.dist === 0 && lodging.den === 0 && lodging.liftDist === 0 && !lodging.skiIn
  if (justAdded && lodging.url) {
    const txt = translate('fresh_just_added', lang)
    return { txt, short: txt, stale: false }
  }
  if (srcOf(lodging) === MANUAL_SOURCE) {
    const txt = translate('fresh_manual', lang)
    return { txt, short: txt, stale: false }
  }
  if (propre == null) {
    return {
      txt: translate('fresh_no_date', lang),
      short: translate('fresh_no_date_short', lang),
      stale: false
    }
  }
  const m = Math.max(0, Math.round((Date.now() - propre) / 60000))
  return {
    txt: `${translate('fresh_recorded', lang)} ${agoTxt(m, lang)}`,
    short: `↻ ${agoCore(m, lang)}`,
    stale: m > STALE_MIN
  }
}

/**
 * Une annonce appartient-elle au domaine consulté ?
 *
 * Définition unique, parce qu'elle a deux lecteurs qui ne doivent pas diverger :
 * le sélecteur qui construit la liste affichée, et l'enrichissement qui calcule
 * l'accès aux pistes. Quand les deux règles différaient, des annonces étaient
 * affichées sans jamais être mesurées — « distance non calculée » à vie.
 *
 * Deux tolérances, toutes deux nécessaires : `importDomainId` absent (annonces
 * antérieures à ce champ), et identifiant d'une entrée **absorbée** depuis dans
 * le domaine courant, listée par `members`.
 *
 * Typage structurel plutôt qu'un import de `Domain` : ce module est en amont du
 * référentiel, et l'y rattacher créerait un cycle.
 */
export function belongsToDomain(
  lodging: Pick<Lodging, 'importDomainId'>,
  domain: { id: number; members?: number[] }
): boolean {
  if (lodging.importDomainId == null) return true
  if (lodging.importDomainId === domain.id) return true
  return (domain.members ?? []).includes(lodging.importDomainId)
}

/**
 * Écart d'occupation entre l'annonce et la demande.
 *
 * 0 = correspondance exacte (4 pers demandées, tarif 4 pers). Un 6 pers pour
 * une recherche à 4 est plus loin : taxe de séjour et total ne sont pas ceux
 * du groupe. Trop petit (2 pour 4) est encore plus loin — on ne le choisit
 * que s'il n'y a rien d'autre.
 */
export function occupancyMatchScore(pers: number, demand: number): number {
  if (!(demand > 0)) return 0
  if (!(pers > 0)) return 10_000
  if (pers === demand) return 0
  if (pers > demand) return pers - demand
  return 1_000 + (demand - pers)
}

/** Total du séjour pour le groupe demandé, lu dans le barème s'il existe. */
export function stayTotalForGuests(
  lodging: Pick<Lodging, 'total' | 'priceOptions'>,
  demand: number
): number {
  if (demand > 0 && lodging.priceOptions && lodging.priceOptions.length > 0) {
    const exact = lodging.priceOptions.find((o) => o.guests === demand && o.total > 0)
    if (exact) return exact.total
    const above = lodging.priceOptions
      .filter((o) => o.guests >= demand && o.total > 0)
      .sort((a, b) => a.guests - b.guests)[0]
    if (above) return above.total
  }
  return lodging.total
}

/**
 * Fusion des annonces du même bien publiées sur plusieurs sources.
 * À occupancy égale, l'offre la moins chère est conservée. Si deux cartes
 * du même appartement portent 4 et 6 personnes, on garde celle du groupe
 * demandé — taxe de séjour comprise.
 */
export function mergeDupes(list: Lodging[], enabled: boolean, demand = 0): Lodging[] {
  const by: Record<string, Lodging> = {}
  const out: Lodging[] = []
  for (const l of list) {
    const k = listingKey(l) || (enabled && l.dup ? l.dup : `u${l.id}`)
    const kept = by[k]
    if (!kept) {
      const copy: Lodging = {
        ...l,
        total: stayTotalForGuests(l, demand) || l.total,
        dups: []
      }
      by[k] = copy
      out.push(copy)
      continue
    }
    const incomingTotal = stayTotalForGuests(l, demand)
    const keptTotal = stayTotalForGuests(kept, demand)
    const incomingFit = occupancyMatchScore(l.pers, demand)
    const keptFit = occupancyMatchScore(kept.pers, demand)
    const betterFit = incomingFit < keptFit
    const sameFitCheaper =
      incomingFit === keptFit && incomingTotal > 0 && (keptTotal <= 0 || incomingTotal < keptTotal)
    if (betterFit || sameFitCheaper) {
      const dups = (kept.dups ?? []).concat([{ src: kept.src, total: kept.total }])
      Object.assign(kept, l, {
        id: kept.id,
        dups,
        total: incomingTotal > 0 ? incomingTotal : l.total
      })
    } else {
      kept.dups = (kept.dups ?? []).concat([{ src: l.src, total: l.total }])
      if (!publishedPhotoUrl(kept) && publishedPhotoUrl(l)) {
        kept.image = l.image
        kept.photo = l.photo
      }
    }
  }
  return out
}

/**
 * Médiane du marché du domaine — **sur les offres tarifées uniquement**.
 *
 * Un `total` à zéro n'est pas un prix : c'est une carte-redirection, une
 * annonce vue sans tarif, une porte d'entrée OpenStreetMap. Les compter tirait
 * la médiane vers le bas d'autant de rangs qu'il y en avait, et `dealOf` juge
 * chaque offre contre elle : sur dix-huit annonces dont huit sans prix, une
 * offre à 1 200 € — pourtant sous la vraie médiane de 1 650 € — ressortait
 * « Au-dessus du marché · +20 % ». Le verdict s'inversait.
 *
 * Zéro reste rendu quand rien n'est tarifé, et `dealOf` s'abstient alors : sans
 * marché observé, il n'y a pas de marché à comparer.
 */
export function medianTotal(list: Lodging[]): number {
  const v = list
    .map((l) => l.total)
    .filter((total) => total > 0)
    .sort((a, b) => a - b)
  if (v.length === 0) return 0
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2)
}

/*
 * `dealOf` et son type `Deal` ont été retirés.
 *
 * La vignette portait un verdict de prix — « Bon plan », puis « Au-dessus du
 * marché · +x % vs médiane ». Les deux ont disparu de l'écran : sur une liste
 * restreinte aux prix vérifiés, la médiane décrit surtout la taille de la
 * liste, et le montant se compare déjà tout seul aux vignettes voisines.
 *
 * `medianTotal` reste, elle : c'est une mesure, pas un jugement.
 */

export function siteOf(url: string): string {
  if (/airbnb/i.test(url)) return 'Airbnb'
  if (/gites/i.test(url)) return 'Gîtes de France'
  if (/booking/i.test(url)) return 'Booking.com'
  return 'Web'
}
