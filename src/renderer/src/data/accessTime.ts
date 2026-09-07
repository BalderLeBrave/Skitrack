/**
 * Temps pour rejoindre le bas des pistes, et par quel moyen.
 *
 * Une distance seule ne dit pas grand-chose : 300 m se marchent, 1 400 m se
 * conduisent, et le même « 28 min » affiché pour les deux serait faux dans un
 * cas sur deux. On choisit donc le moyen, on calcule le temps sur cette base,
 * et **on nomme le moyen** — un temps sans son moyen est illisible, c'est
 * exactement ce qui rendait « 7 min · +23 m » incompréhensible.
 *
 * ## Ce qui décide
 *
 * Le moteur local classe déjà l'accès (`slope_access_type`) : `skis_aux_pieds`,
 * `navette` ou `voiture`. Sa classification prime, parce qu'elle connaît le
 * terrain — un logement à 200 m d'une piste peut être séparé d'elle par une
 * falaise. La distance ne sert qu'à trancher quand il ne dit rien.
 *
 * ## Ce que ces minutes valent
 *
 * Une estimation, et rien de plus. La distance est mesurée à vol d'oiseau ; on
 * lui applique un facteur de détour, puis une vitesse. Aucune de ces trois
 * grandeurs n'est un relevé. L'interface doit le dire — voir
 * `access_time_note` — plutôt que de laisser croire à un itinéraire calculé.
 */

/** Marche en station, chaussures aux pieds et matériel sur l'épaule. */
const WALK_M_PER_MIN = 50

/**
 * Au-delà, personne ne marche avec des skis, et le moteur ne dit rien : on
 * bascule en voiture. Vingt-quatre minutes de marche, c'est déjà beaucoup.
 */
const WALK_MAX_M = 1200

/** En deçà, on est au pied des pistes : il n'y a pas de trajet à chiffrer. */
const SKI_IN_MAX_M = 100

/** Vitesse sur les routes d'une station en hiver : lentes, étroites, enneigées. */
const DRIVE_KMH = 25

/** Sortir la voiture, se garer, revenir : incompressible et souvent sous-estimé. */
const DRIVE_OVERHEAD_MIN = 5

/** Rapport entre trajet réel et distance à vol d'oiseau, en station. */
const DETOUR_FACTOR = 1.3

export type AccessMode = 'skis_aux_pieds' | 'a_pied' | 'navette' | 'voiture'

export interface AccessTime {
  mode: AccessMode
  /** Minutes estimées. `null` quand il n'y a pas de trajet — skis aux pieds. */
  minutes: number | null
}

/** Ce que le moteur local a classé, quand il l'a fait. */
export type EngineAccessType = 'skis_aux_pieds' | 'navette' | 'voiture' | undefined

function walkMinutes(distanceM: number): number {
  return Math.max(1, Math.round(distanceM / WALK_M_PER_MIN))
}

function driveMinutes(distanceM: number): number {
  const km = (distanceM * DETOUR_FACTOR) / 1000
  return Math.max(1, Math.round((km / DRIVE_KMH) * 60) + DRIVE_OVERHEAD_MIN)
}

/**
 * Moyen et durée pour rejoindre le point skiable le plus proche.
 *
 * `null` quand la distance n'a pas été calculée : on ne devine pas un trajet
 * depuis une distance absente.
 */
export function accessTimeOf(distanceM: number, engineType: EngineAccessType): AccessTime | null {
  if (!Number.isFinite(distanceM) || distanceM < 0) return null

  // Le moteur d'abord : il sait ce que la distance ignore.
  if (engineType === 'skis_aux_pieds') return { mode: 'skis_aux_pieds', minutes: null }
  if (engineType === 'voiture') return { mode: 'voiture', minutes: driveMinutes(distanceM) }
  // La navette roule : c'est bien une vitesse de route. L'attente, elle, ne se
  // devine pas — la note d'interface le précise plutôt que de l'inventer.
  if (engineType === 'navette') return { mode: 'navette', minutes: driveMinutes(distanceM) }

  // Sans classification, la distance tranche.
  if (distanceM <= SKI_IN_MAX_M) return { mode: 'skis_aux_pieds', minutes: null }
  if (distanceM <= WALK_MAX_M) return { mode: 'a_pied', minutes: walkMinutes(distanceM) }
  return { mode: 'voiture', minutes: driveMinutes(distanceM) }
}
