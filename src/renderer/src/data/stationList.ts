/**
 * La liste de l'application est une liste de **stations**.
 *
 * ## Ce que le référentiel donne, et pourquoi ça ne suffisait pas
 *
 * Le fichier livré mélange trois natures sous le même toit :
 *
 * * des stations — « Méribel », « Orelle », « Brides-les-Bains » ;
 * * des **domaines** — « Val Thorens – Orelle », « Tignes – Val d'Isère »,
 *   « Vars – Risoul, La Forêt Blanche » ;
 * * des **secteurs** — « Chamonix – Le Brévent Flégère », « Courchevel 1550 –
 *   Le Praz », « Méribel-Mottaret ».
 *
 * Affichés à égalité, ils donnaient une liste où Val Thorens apparaissait deux
 * fois — une fois sous son nom, une fois dans « Val Thorens – Orelle » — et où
 * Serre Chevalier occupait cinq lignes. Ce n'était pas une liste de stations,
 * c'était le référentiel tel quel.
 *
 * ## La clé de regroupement existait déjà
 *
 * `data/stations.ts` tient, pour chaque entrée, **le nom de sa station** :
 * table vérifiée à la main, alignée sur `tools/skitrack_v25.py`, écrite
 * précisément parce qu'« un domaine skiable et une station ne portent pas le
 * même nom ». C'est elle qui sert à interroger les moteurs de réservation.
 *
 * Grouper les entrées par `stationNameOf` ramène 173 lignes à 134 stations, et
 * le fait avec une table que quelqu'un a relue — pas avec une heuristique qui
 * découperait les noms au tiret et se tromperait sur « Montchavin – Les
 * Coches » comme sur « Val Thorens – Orelle ».
 *
 * ## Ce qu'une station retient de son groupe
 *
 * Un **représentant** porte l'identité : son `id` et son `slug` sont conservés,
 * parce que les itinéraires calculés, les tarifs de forfaits et les logements
 * importés s'y réfèrent. Le représentant est l'entrée la mieux renseignée — on
 * ne choisit pas une ligne sans coordonnées quand une autre en a.
 *
 * Les chiffres, eux, décrivent la station entière :
 *
 * * `min` le point skiable le plus bas du groupe, `max` le plus haut — deux
 *   vrais extrema ;
 * * `km` le **maximum** déclaré, jamais la somme : les secteurs d'une même
 *   station décrivent les mêmes pistes, et additionner Chantemerle, Villeneuve
 *   et Le Monêtier compterait trois fois Serre Chevalier ;
 * * `village` celui du représentant : c'est le front de neige de la station,
 *   pas une moyenne de ses hameaux.
 *
 * `members` garde les identifiants absorbés. Sans lui, un logement importé sous
 * « Val Thorens » disparaîtrait le jour où le représentant devient « Val
 * Thorens – Orelle ».
 */

import type { Domain } from './referentiel'
import { hasCoords } from './referentiel'
import { stationNameOf } from './stations'
import { isFranceMontagnes } from './franceMontagnes'
import { slug } from '@/domain/format'

/**
 * Entrée la mieux renseignée d'un groupe.
 *
 * L'ordre des critères n'est pas indifférent : une position manquante retire la
 * station de la carte, du tri par distance et du calcul de trajet, alors qu'un
 * kilométrage manquant ne fait qu'appauvrir une tuile. Les coordonnées passent
 * donc avant tout le reste.
 */
function representativeOf(group: Domain[]): Domain {
  return [...group].sort((a, b) => {
    const coords = Number(hasCoords(b)) - Number(hasCoords(a))
    if (coords !== 0) return coords
    const curated = Number(b.curated) - Number(a.curated)
    if (curated !== 0) return curated
    if (b.km !== a.km) return b.km - a.km
    return a.id - b.id
  })[0]
}

/** Première valeur non vide du groupe, en commençant par le représentant. */
function firstOf<T>(ordered: Domain[], read: (d: Domain) => T | null | undefined): T | null {
  for (const d of ordered) {
    const value = read(d)
    if (value != null && value !== '') return value
  }
  return null
}

/**
 * Replie les entrées du référentiel en stations.
 *
 * L'ordre d'entrée est conservé : la première apparition d'une station fixe sa
 * place, ce qui évite que la liste se réordonne d'un chargement à l'autre.
 */
export function collapseToStations(entries: Domain[]): Domain[] {
  const groups = new Map<string, Domain[]>()
  for (const entry of entries) {
    // Le nom de station fait la clé ; à défaut de table, `stationNameOf`
    // retombe sur le nom dérivé, jamais sur une chaîne vide.
    const key = slug(stationNameOf(entry.name)) || entry.slug
    const list = groups.get(key)
    if (list) list.push(entry)
    else groups.set(key, [entry])
  }

  const stations: Domain[] = []
  for (const group of groups.values()) {
    const head = representativeOf(group)
    // Le représentant d'abord : c'est lui qui décide en cas d'égalité.
    const ordered = [head, ...group.filter((d) => d !== head)]

    const name = stationNameOf(head.name) || head.name
    // Le catalogue est celui de France Montagnes : une entrée du référentiel
    // qui n'y figure pas décrit autre chose qu'une station de ski alpin — une
    // ville, un site nordique, un secteur. Voir `data/franceMontagnes.ts`.
    if (!isFranceMontagnes(name)) continue

    stations.push({
      ...head,
      // Le nom affiché est celui de la station, pas le libellé de domaine :
      // « Val Thorens », pas « Val Thorens – Orelle ».
      name,
      min: Math.min(...group.map((d) => d.min)),
      max: Math.max(...group.map((d) => d.max)),
      km: Math.max(...group.map((d) => d.km)),
      lifts: Math.max(...group.map((d) => d.lifts)),
      glacier: group.some((d) => d.glacier),
      // Un forfait relié déclaré par une seule entrée du groupe vaut pour la
      // station : c'est le même forfait qu'on achète.
      pass: firstOf(ordered, (d) => d.pass),
      website: firstOf(ordered, (d) => d.website),
      booking: firstOf(ordered, (d) => d.booking),
      logo: firstOf(ordered, (d) => d.logo),
      members: group.map((d) => d.id)
    })
  }
  return stations
}

/** La station qui a absorbé cet identifiant d'entrée, s'il en existe une. */
export function stationOwning(stations: Domain[], entryId: number | null | undefined): Domain | undefined {
  if (entryId == null) return undefined
  return stations.find((s) => s.id === entryId || (s.members ?? []).includes(entryId))
}
