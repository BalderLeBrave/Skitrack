/**
 * Référentiel des domaines skiables.
 *
 * Le fichier livré est empaqueté avec l'application : au premier lancement il
 * n'y a rien à télécharger, et l'écran de recherche est utilisable tout de
 * suite. L'utilisateur peut le remplacer par le sien — un JSON validé, stocké
 * tel quel dans `localStorage` — l'exporter pour le corriger à la main, ou
 * revenir au fichier livré.
 *
 * Le format est volontairement plat : les altitudes et les tarifs de forfaits
 * sont ce que l'application interroge le plus, et les imbriquer coûterait un
 * niveau d'indirection à chaque calcul de score.
 */

import bundled from './referentiel.json'

/**
 * Un domaine skiable, tel que l'application le manipule.
 *
 * Les domaines viennent normalement de la base OpenSkiMap du moteur local
 * (277 domaines français) ; le fichier livré ne sert que de secours et de
 * porteur des tarifs de forfaits relevés à la main. Le `slug` est la clé de
 * rapprochement entre les deux : les identifiants numériques changent à chaque
 * réimport du référentiel.
 */
export interface Domain {
  id: number
  slug: string
  name: string
  massif: string
  region: string
  /** Altitude du point skiable le plus bas, en mètres. Pas le village. */
  min: number
  max: number
  /** Altitude du front de neige. */
  village: number
  km: number
  lifts: number
  glacier: boolean
  /** Nom du forfait relié, `null` si le domaine n'est pas relié. */
  pass: string | null
  /** Domaine dont les altitudes ont été vérifiées à la main. */
  curated: boolean
  lat: number
  lon: number
  /** Amplitude de saisonnalité des prix : 1 = moyenne du panel. */
  sais: number
  /** Site officiel du domaine, source de repli du logo affiché. */
  website: string | null
  /**
   * Page de réservation du domaine, quand le moteur local la connaît.
   *
   * Distincte de `website` : une station renvoie souvent sa centrale de
   * réservation sur un autre hôte que son site institutionnel. Sert la
   * recherche de logement, pas le logo. Voir `data/stations.ts`, qui tient une
   * table vérifiée pour les domaines du fichier livré — celui-ci n'en porte
   * aucune.
   */
  booking: string | null
  /** URL de logo fournie par le référentiel, prioritaire sur l'icône du site. */
  logo: string | null
  /**
   * Entrées du référentiel repliées dans cette station.
   *
   * Le fichier livré mélange stations, domaines et secteurs : « Val Thorens »
   * et « Val Thorens – Orelle » y sont deux lignes. La liste de l'application
   * les replie en une station (voir `data/stationList.ts`) et garde ici les
   * identifiants absorbés — sans quoi un logement importé sous l'une
   * disparaîtrait quand l'autre devient le représentant.
   */
  members?: number[]
}

/** Forme brute d'un domaine dans le fichier JSON livré. */
interface RawDomain {
  id: number
  name: string
  massif: string
  region: string
  min: number
  max: number
  village: number
  km: number
  lifts: number
  glacier: boolean
  pass: string | null
  curated: boolean
  lat: number
  lon: number
  sais?: number
  /** URL d'image, renseignée à la main dans le fichier. */
  logo?: string
  /**
   * Exploitation du domaine : `ouvert` pour un domaine en activité.
   *
   * Un domaine fermé n'a pas sa place dans une recherche de séjour — mais il
   * reste dans le fichier, parce que le supprimer effacerait aussi son
   * historique de tarifs et ses coordonnées.
   */
  statut?: string
  /**
   * Neige au sol et chutes du fichier livré — **délibérément non lue**.
   *
   * C'est un jeu de démonstration : 95 cm au pied des pistes à la mi-août,
   * huit libellés de chutes pour cent soixante-treize domaines, et une
   * provenance « bulletins Météo-France » alors qu'aucun bulletin n'est publié
   * hors saison. La neige affichée vient d'Open-Meteo, ou de rien.
   *
   * Le champ reste décrit ici pour que sa présence dans le JSON ne surprenne
   * pas, et que personne ne le rebranche en croyant combler un manque.
   */
  neige?: unknown
}

/** Un domaine absent de cette liste est considéré en activité. */
const CLOSED_STATUS = new Set(['ferme', 'fermé', 'closed', 'inactif'])

/** `true` si le domaine est exploité cette saison. */
export function isOperating(d: Pick<RawDomain, 'statut'>): boolean {
  return !d.statut || !CLOSED_STATUS.has(d.statut.toLowerCase())
}

/**
 * Position exploitable ?
 *
 * Une partie des domaines du référentiel n'a pas de coordonnées : ils gardent
 * leur place dans la liste — leurs altitudes, leurs kilomètres et leurs tarifs
 * sont connus et suffisent à les comparer — mais tout ce qui suppose un point
 * sur le globe doit les écarter. Les laisser passer produirait un marqueur au
 * large de l'Afrique et, pire, corromprait le lot de requêtes météo dans
 * lequel ils se glissent.
 */
export function hasCoords(d: Pick<Domain, 'lat' | 'lon'>): boolean {
  return (
    d.lat != null && d.lon != null && Number.isFinite(d.lat) && Number.isFinite(d.lon)
  )
}

/**
 * Position cohérente avec le massif annoncé.
 *
 * Le référentiel porte l'emprise de chaque massif ; une coordonnée qui en sort
 * vient d'un géocodage qui a attrapé un homonyme, cas assez fréquent avec les
 * noms de villages de montagne. Sans emprise connue, on accorde le bénéfice du
 * doute.
 */
export function coordOk(d: Pick<Domain, 'lat' | 'lon' | 'massif'>, ref: Referential): boolean {
  if (!hasCoords(d)) return false
  const box = ref.massifBox?.[d.massif]
  if (!box) return true
  const [south, north, west, east] = box
  return d.lat >= south && d.lat <= north && d.lon >= west && d.lon <= east
}

export interface Forfait {
  j1: number
  j6: number
  enf6: number
  saison: number
  zone: string
  maj: string
}

export interface ReferentialSource {
  nom: string
  licence?: string
  maj: string | null
}

export interface Referential {
  format?: string
  version?: number
  genere?: string
  sources?: Record<string, ReferentialSource>
  domaines: RawDomain[]
  forfaits: Record<string, Forfait>
  /** Emprise de chaque massif : `[sud, nord, ouest, est]`. */
  massifBox?: Record<string, [number, number, number, number]>
}

/**
 * Domaines du fichier livré, portés à la forme manipulée par l'application.
 *
 * Les domaines qui ne sont plus exploités sont écartés : ils resteraient dans
 * les résultats avec des tarifs et des remontées qui n'existent plus, ce qui
 * est pire qu'une absence.
 */
export function domainsFromReferential(ref: Referential, slugify: (name: string) => string): Domain[] {
  return ref.domaines.filter(isOperating).map((d) => ({
    id: d.id,
    slug: slugify(d.name),
    name: d.name,
    massif: d.massif,
    region: d.region,
    min: d.min,
    max: d.max,
    village: d.village,
    km: d.km,
    lifts: d.lifts,
    glacier: d.glacier,
    pass: d.pass,
    curated: d.curated,
    lat: d.lat,
    lon: d.lon,
    sais: d.sais ?? 1,
    website: null,
    booking: null,
    logo: d.logo ?? null,
    neige: d.neige ?? null
  }))
}

export const BUNDLED_REFERENTIAL = bundled as unknown as Referential

export const REF_STORAGE_KEY = 'skitrack-v3-ref'

/**
 * Validation minimale et volontairement permissive : on vérifie ce dont
 * l'application a besoin pour ne pas planter à l'affichage, pas la conformité
 * exhaustive au format. Un référentiel maison amputé d'un champ optionnel doit
 * pouvoir être chargé.
 */
export function isValidReferential(value: unknown): value is Referential {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Partial<Referential>
  return Array.isArray(r.domaines) && r.domaines.length > 0 && typeof r.forfaits === 'object' && r.forfaits !== null
}

export interface LoadedReferential {
  ref: Referential
  origin: string
}

/** Le fichier importé prime sur le fichier livré tant qu'il n'est pas retiré. */
export function loadReferential(): LoadedReferential {
  try {
    const raw = localStorage.getItem(REF_STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isValidReferential(parsed)) return { ref: parsed, origin: 'fichier importé' }
    }
  } catch {
    /* stockage illisible : on retombe sur le fichier livré */
  }
  return { ref: BUNDLED_REFERENTIAL, origin: 'référentiel livré' }
}

export async function readReferentialFile(file: File): Promise<Referential> {
  const parsed: unknown = JSON.parse(await file.text())
  if (!isValidReferential(parsed)) throw new Error('format non reconnu')
  localStorage.setItem(REF_STORAGE_KEY, JSON.stringify(parsed))
  return parsed
}

export function clearStoredReferential(): void {
  try {
    localStorage.removeItem(REF_STORAGE_KEY)
  } catch {
    /* rien à faire : le référentiel livré reste utilisable */
  }
}

export function exportReferential(ref: Referential): void {
  const blob = new Blob([JSON.stringify(ref, null, 1)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'skitrack-referentiel.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function forfaitOf(ref: Referential, domainId: number): Partial<Forfait> {
  return ref.forfaits[String(domainId)] ?? {}
}

/** Tarif enfant : relevé quand il existe, sinon 80 % du tarif adulte — le
 *  ratio est remarquablement stable d'un domaine à l'autre sur les tarifs
 *  relevés (0,799 à 0,849). */
export function enfantPrice(f: Partial<Forfait>): number {
  return f.enf6 != null ? f.enf6 : Math.round((f.j6 ?? 0) * 0.8)
}

/**
 * Grille de forfaits indexée par slug de domaine.
 *
 * Les tarifs sont relevés à la main sur les sites officiels : il n'y en a
 * qu'une poignée, et ils sont rattachés au domaine par son slug plutôt que par
 * un identifiant, parce que l'identifiant dépend de l'ordre d'import du
 * référentiel OpenSkiMap et change d'un import à l'autre.
 */
export interface ForfaitEntry extends Forfait {
  /** `false` = tarif relevé sur le site officiel ; `true` = dérivé. */
  estimated: boolean
}

/** Logos déclarés dans le référentiel, indexés par slug. */
export function logoIndexBySlug(ref: Referential, slugify: (name: string) => string): Map<string, string> {
  const out = new Map<string, string>()
  for (const d of ref.domaines) {
    if (d.logo) out.set(slugify(d.name), d.logo)
  }
  return out
}

export function forfaitIndexBySlug(ref: Referential, slugify: (name: string) => string): Map<string, ForfaitEntry> {
  const out = new Map<string, ForfaitEntry>()
  for (const d of ref.domaines) {
    const f = ref.forfaits[String(d.id)]
    if (f) out.set(slugify(d.name), { ...f, estimated: false })
  }
  return out
}

/**
 * Prix d'un forfait 6 jours quand il n'a pas été relevé.
 *
 * Courbe saturante sur les kilomètres de pistes, plus une prime d'altitude. Les
 * points d'ancrage sont calés à la fois sur les tarifs relevés et sur ce que
 * coûte réellement un téléski de village : une régression linéaire sur les
 * seuls grands domaines extrapolait 175 € pour trois kilomètres de pistes.
 *
 * L'écart moyen aux tarifs relevés reste de l'ordre de 15 % — c'est pourquoi
 * ces valeurs sont marquées « estimé » partout où elles s'affichent, et
 * pourquoi elles n'entrent pas dans le score de pertinence.
 */
const FORFAIT_ANCHORS: [number, number][] = [
  [0, 105],
  [10, 125],
  [25, 150],
  [50, 185],
  [90, 225],
  [130, 265],
  [180, 300],
  [250, 330]
]

function interpolate(anchors: [number, number][], v: number): number {
  if (v <= anchors[0][0]) return anchors[0][1]
  const last = anchors[anchors.length - 1]
  if (v >= last[0]) return last[1]
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1]
    const [x1, y1] = anchors[i]
    if (v <= x1) return y0 + ((v - x0) / (x1 - x0)) * (y1 - y0)
  }
  return last[1]
}

export function estimateForfait(slopesKm: number, altitudeMax: number): ForfaitEntry {
  const altitudeBonus = Math.max(0, Math.min(45, (altitudeMax - 2200) * 0.02))
  const j6 = Math.round((interpolate(FORFAIT_ANCHORS, slopesKm) + altitudeBonus) / 5) * 5
  return {
    j6,
    // Ratios constatés sur les tarifs relevés : journée ≈ 0,20 × 6 jours,
    // enfant ≈ 0,80, saison ≈ 3,05.
    j1: Math.round(j6 * 0.2),
    enf6: Math.round(j6 * 0.8),
    saison: Math.round((j6 * 3.05) / 5) * 5,
    zone: 'tarif non relevé',
    maj: '—',
    estimated: true
  }
}
