/**
 * Crédits des photos de stations.
 *
 * Le fichier JSON est écrit par `tools/import-station-photos.mjs` et empaqueté
 * avec l'application. Il n'est pas décoratif : CC-BY et CC-BY-SA **exigent**
 * que l'auteur et la licence accompagnent l'image. Une photo affichée sans son
 * crédit n'est pas une photo utilisable, c'est une photo empruntée.
 *
 * Le fichier peut être vide — il l'est tant que l'import n'a pas tourné — et
 * une station peut n'y avoir aucune entrée. Les deux cas se lisent pareil :
 * `creditPhoto()` rend `null`, l'écran affiche « aucune photo » et retombe sur
 * la photo du massif en le disant. Rien n'est deviné.
 */

import brut from './stationPhotos.json'

export interface CreditPhoto {
  /** Nom de la station tel que le catalogue l'écrit. */
  station: string
  massif: string
  /** Titre du fichier sur Commons, préfixe `File:` compris. */
  titre: string
  /** Auteur déclaré. `null` quand Commons n'en publie pas. */
  auteur: string | null
  /** Licence, telle que Commons la nomme : « CC BY-SA 4.0 », « CC0 »… */
  licence: string
  /** Page de description du fichier, à citer avec le crédit. */
  page: string
  largeur: number
  hauteur: number
  /** Nom du fichier écrit, extension réelle comprise. Absent des vieux imports. */
  fichier?: string
  /**
   * Description publiée sur la page Commons — le texte du photographe.
   *
   * C'est elle que la fiche affiche en légende. `null` : la page n'en publie
   * pas, et la légende retombe sur le titre du fichier, qui reste un texte
   * d'auteur. Jamais une phrase générée : une description inventée sous une
   * photo relevée serait le mensonge exact que ce projet s'interdit.
   */
  description?: string | null
  /** Distance prise de vue → front de neige, en mètres. `null` : non relevée. */
  distanceM: number | null
  /** La neige est-elle dite par le titre ou la description ? */
  neigeDite?: boolean
  /** Mois de prise de vue lu dans l'EXIF, quand il y en a un. */
  moisPriseDeVue?: number | null
}

/**
 * Le fichier est généré, mais il vit dans `src/` et s'édite à la main : une
 * entrée sans titre ou sans licence ferait planter l'écran de revue entier
 * (`titre.replace` sur `undefined`). On ne garde que les entrées complètes —
 * une entrée écartée se lit « photo sans crédit enregistré », ce qui est
 * exactement son état.
 */
const TABLE: Record<string, CreditPhoto> = {}
for (const [cle, e] of Object.entries(brut as Record<string, Partial<CreditPhoto>>)) {
  if (typeof e?.titre === 'string' && typeof e?.licence === 'string' && typeof e?.page === 'string') {
    TABLE[cle] = e as CreditPhoto
  }
}

/** Même rapprochement dégradé que `stationPhoto` : la ponctuation est ignorée. */
const TABLE_SQUASH: Record<string, CreditPhoto> = {}
for (const [cle, e] of Object.entries(TABLE)) {
  TABLE_SQUASH[cle.replace(/[^a-z0-9]/g, '')] ??= e
}

/** Même repli que l'import : accents et ponctuation retirés. */
export function slugStation(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Légende d'une photo : la description du photographe, sinon le titre du
 * fichier débarrassé de son préfixe et de son extension. Les deux sont des
 * textes d'auteur venus de Commons — jamais un texte produit ici.
 */
export function legendePhoto(credit: CreditPhoto): string {
  const desc = credit.description?.trim()
  if (desc) return desc
  return credit.titre.replace(/^File:/, '').replace(/\.(jpe?g|png|webp)$/i, '')
}

export function creditPhoto(nom: string | null | undefined): CreditPhoto | null {
  if (!nom) return null
  const cle = slugStation(nom)
  return TABLE[cle] ?? TABLE_SQUASH[cle.replace(/[^a-z0-9]/g, '')] ?? null
}

/** Nombre de stations pourvues. Sert à annoncer la couverture, pas à l'estimer. */
export function nombreCredits(): number {
  return Object.keys(TABLE).length
}
