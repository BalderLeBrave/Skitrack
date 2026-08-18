/**
 * Stations et domaines skiables : le rangement, pas une seconde base.
 *
 * ## Ce que le diagnostic a établi
 *
 * Le fichier que le projet nomme « domaines » **est déjà une liste de
 * stations** : chaque entrée porte un nom de station, ses coordonnées propres
 * et l'altitude de son front de neige. Méribel, Courchevel, Orelle et Brides-
 * les-Bains y sont chacune une entrée. Ce qui joue le rôle de domaine, c'est le
 * champ `pass` — le forfait relié. Voir `docs/diagnostics/stations-modele.md`.
 *
 * Ce module ne crée donc aucun enregistrement : il **nomme** ce qui existe et
 * il **groupe**. `Station` est un alias de `Domain`, délibérément — deux types
 * parallèles décrivant la même ligne finiraient par diverger, et c'est
 * exactement ce qu'on veut éviter quand la donnée est déjà en place.
 *
 * ## La clé de regroupement, et pourquoi elle est normalisée
 *
 * Grouper sur `pass` brut produirait deux défauts que la donnée porte
 * réellement :
 *
 * * **Treize entrées** n'ont pas de `pass` alors que leur nom *est* un nom de
 *   forfait — « Les 2 Alpes », « Alpe d'Huez Grand Domaine », « Les 7 Laux ».
 *   Elles sont la station principale de leur domaine, et un regroupement naïf
 *   les laisserait à côté du groupe qu'elles devraient mener.
 * * **« Mont Blanc Unlimited » et « Mont-Blanc Unlimited »** coexistent comme
 *   forfaits, à un trait d'union près : deux domaines pour un seul.
 *
 * La clé est donc `squash(pass ?? nom)` — la même normalisation que la
 * recherche, ce qui garantit qu'un domaine trouvable est un domaine groupé.
 *
 * ## Ce qui n'est pas agrégé, et pourquoi
 *
 * Le point culminant d'un domaine est le maximum de ceux de ses stations : un
 * maximum est un vrai agrégat, il ne fabrique rien.
 *
 * Le **kilométrage de pistes, lui, n'est pas totalisable**. Le référentiel
 * donne 150 km à Méribel, 160 aux Menuires, 150 à Courchevel : les additionner
 * donnerait 1 060 km pour Les 3 Vallées, parce que les secteurs se recouvrent
 * et que chaque entrée décrit déjà une part du même domaine. `kmMax` est donc
 * exposé pour ce qu'il est — le plus grand chiffre déclaré par une station —
 * et jamais présenté comme un total.
 */

import type { Domain } from './referentiel'
import { squash } from './places'
import { slug } from '@/domain/format'

/**
 * Une station de ski : ce que le référentiel appelle « domaine ».
 *
 * Alias et non copie. Tout ce qu'une station porte — nom, commune (`region`),
 * coordonnées, altitude du village (`village`), massif — est déjà là.
 */
export type Station = Domain

export interface SkiArea {
  /** Clé stable, normalisée : `squash(pass ?? nom)`. */
  id: string
  /** Libellé d'affichage : le forfait relié quand il existe, la station sinon. */
  name: string
  /** Stations du domaine, la plus haute d'abord. */
  stations: Station[]
  /** Point culminant du domaine : un maximum, donc un agrégat licite. */
  summit: number
  /** Le plus grand kilométrage **déclaré par une station**. Jamais un total. */
  kmMax: number
  glacier: boolean
  massif: string
  /** Vrai quand le domaine ne compte qu'une station : le badge est superflu. */
  single: boolean
}

/** Clé de domaine d'une station. Publique : la recherche s'en sert aussi. */
export function areaKeyOf(station: Station): string {
  return squash(station.pass || station.name) || slug(station.name)
}

/** Libellé retenu quand plusieurs orthographes coexistent : la plus fréquente. */
function pickName(labels: string[]): string {
  const tally = new Map<string, number>()
  for (const label of labels) tally.set(label, (tally.get(label) ?? 0) + 1)
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))[0][0]
}

export interface SkiAreaIndex {
  areas: SkiArea[]
  /** Domaine d'une station, par identifiant de station. */
  byStation: Map<number, SkiArea>
  areaOf: (station: Station) => SkiArea | undefined
}

const CACHE = new WeakMap<Station[], SkiAreaIndex>()

/**
 * Groupe les stations chargées en domaines skiables.
 *
 * Mémoïsé sur la référence du tableau, comme `placeIndex` : la liste ne change
 * qu'au chargement ou à l'import d'un référentiel, alors que le regroupement
 * est consulté à chaque rendu de vignette.
 */
export function skiAreaIndex(stations: Station[]): SkiAreaIndex {
  const cached = CACHE.get(stations)
  if (cached) return cached

  const groups = new Map<string, Station[]>()
  for (const station of stations) {
    const key = areaKeyOf(station)
    const list = groups.get(key)
    if (list) list.push(station)
    else groups.set(key, [station])
  }

  const byStation = new Map<number, SkiArea>()
  const areas: SkiArea[] = []

  for (const [id, members] of groups) {
    // Le libellé vient d'abord des `pass` du groupe — c'est le nom commercial
    // du domaine. À défaut (groupe d'une seule station sans forfait relié),
    // c'est le nom de la station elle-même.
    const passes = members.map((s) => s.pass).filter((p): p is string => Boolean(p))
    const name = passes.length > 0 ? pickName(passes) : members[0].name

    const area: SkiArea = {
      id,
      name,
      // La plus haute d'abord : c'est celle qu'on cite quand on nomme le
      // domaine, et celle dont l'enneigement décide de la saison.
      stations: [...members].sort((a, b) => b.village - a.village || a.name.localeCompare(b.name, 'fr')),
      summit: Math.max(...members.map((s) => s.max)),
      kmMax: Math.max(...members.map((s) => s.km)),
      glacier: members.some((s) => s.glacier),
      massif: pickName(members.map((s) => s.massif).filter(Boolean)),
      single: members.length === 1
    }
    areas.push(area)
    for (const station of members) byStation.set(station.id, area)
  }

  areas.sort((a, b) => b.stations.length - a.stations.length || a.name.localeCompare(b.name, 'fr'))

  const index: SkiAreaIndex = {
    areas,
    byStation,
    areaOf: (station) => byStation.get(station.id)
  }
  CACHE.set(stations, index)
  return index
}
