/**
 * Le catalogue France Montagnes, rendu dans la monnaie de l'application.
 *
 * ## Ce que ce module fait, et ce qu'il ne fait pas
 *
 * `data/franceMontagnesStations.ts` est un fichier généré : 285 stations avec
 * leurs coordonnées, l'altitude de leur village et le domaine skiable auquel
 * elles appartiennent. Ce module les convertit en `Domain` — le type que tout
 * l'aval manipule — et **pose dessus ce que le classeur ne connaît pas** : le
 * tarif de forfait, la saisonnalité, le glacier, le site officiel, le logo.
 *
 * Il n'arbitre rien d'autre. Les altitudes, les kilomètres, les remontées et le
 * rattachement au domaine viennent du classeur et de lui seul : c'est la source
 * mesurée (IGN pour le village, OpenSkiMap pour les pistes), et la seule qui
 * couvre les 285 stations. Le référentiel livré n'en décrivait que 115.
 *
 * ## Les trois choses qui se rapprochent, et comment
 *
 * **1. La graphie du nom.** France Montagnes publie « Meribel », « Alpe
 * D'Huez », « Samoens ». Le référentiel écrit « Méribel », la table de
 * `data/stations.ts` écrit « Alpe d'Huez », le fichier communal écrit
 * « Samoëns ». On adopte la graphie accentuée **à condition que ce soit le même
 * nom, lettre pour lettre** une fois les accents, la casse et la ponctuation
 * mis de côté (`sameLetters`). Sans ce garde-fou, « Les Bottières » deviendrait
 * « Bottières » et « Méribel-Mottaret » deviendrait « Méribel » — le rapproche-
 * ment de recherche, qui ignore les articles, n'est pas une preuve d'identité.
 *
 * **2. Le libellé du domaine.** Le classeur nomme « Les Trois Vallées », le
 * référentiel nomme le forfait « Les 3 Vallées » : c'est le même domaine, et
 * c'est le second qui porte le tarif. Le rapprochement se fait ici sur la clé
 * de recherche (`squash`, qui convertit les nombres en lettres), puis sur les
 * segments du libellé — « Paradiski (Les Arcs – La Plagne) » → « Paradiski » —,
 * puis en dernier recours par les stations : si Val Cenis est rattachée au
 * forfait « Haute Maurienne Vanoise » dans le référentiel, tout l'« Espace
 * Haute Maurienne Vanoise » du classeur l'est aussi. À défaut de tout cela, le
 * libellé du classeur est conservé tel quel.
 *
 * **3. Le glacier et la saisonnalité.** Deux attributs de domaine, absents du
 * classeur. Ils sont hérités du référentiel par le domaine, jamais devinés : un
 * domaine dont le référentiel ne dit rien n'a pas de glacier déclaré.
 *
 * ## Ce qui reste absent
 *
 * Une station dont le classeur ne connaît pas le domaine — aucune piste alpine
 * cartographiée à proximité — n'a ni altitude de pistes, ni kilométrage, ni
 * remontées. Elle est **écartée de la liste** plutôt que remplie de zéros, et
 * `excludedStations()` la nomme pour que l'audit la publie.
 */

import type { Domain, Referential } from './referentiel'
import { domainsFromReferential } from './referentiel'
import { FM_STATIONS } from './franceMontagnesStations'
import type { FmStation } from './franceMontagnesStations'
import { squash, villagesOfName } from './places'
import { officialSiteOf, stationNameOf } from './stations'
import { slug } from '@/domain/format'

/**
 * Saisonnalité par défaut.
 *
 * Un grand domaine d'altitude vit des vacances scolaires et voit ses prix
 * s'effondrer en dehors ; une station de proximité, fréquentée le week-end
 * toute la saison, bouge beaucoup moins. À défaut d'une donnée relevée, la
 * taille du domaine skiable en est le meilleur indice disponible.
 */
export function defaultSeasonality(km: number): number {
  return Math.round(Math.max(0.55, Math.min(1.4, 0.55 + km / 220)) * 100) / 100
}

/** Lettres du nom, sans accents, sans casse, sans ponctuation ni espaces. */
function letters(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Deux libellés sont-ils le même nom, à la graphie près ?
 *
 * Plus strict que `squash` : ni article ni nombre en lettres n'est neutralisé.
 * « Meribel » et « Méribel » passent, « Les Bottières » et « Bottières » non.
 */
function sameLetters(a: string, b: string): boolean {
  return letters(a) === letters(b)
}

/** Ce que le référentiel chargé sait poser sur une station du catalogue. */
interface Overlay {
  /** Graphies connues, indexées par clé de recherche. */
  spelling: Map<string, string>
  /** Libellés de forfait relié, indexés par clé de recherche. */
  passes: Map<string, string>
  /** Forfait relié d'une station du référentiel, par clé de recherche. */
  passOfStation: Map<string, string>
  /** Identifiants des entrées du référentiel, par clé de recherche. */
  entryIds: Map<string, number[]>
  /** Saisonnalité relevée, par clé de station puis de forfait. */
  sais: Map<string, number>
  /** Logos renseignés à la main, par clé de station. */
  logos: Map<string, string>
  /** Clés — de station comme de forfait — dont le référentiel déclare un glacier. */
  glacier: Set<string>
}

function remember(map: Map<string, string>, key: string, label: string): void {
  if (key && !map.has(key)) map.set(key, label)
}

/**
 * Dépouille le référentiel chargé : graphies, forfaits reliés, saisonnalité,
 * glaciers, identifiants.
 *
 * Le référentiel est celui de l'utilisateur s'il en a importé un ; rien n'est
 * figé à la génération du catalogue, et une entrée qui disparaît de son fichier
 * disparaît d'ici.
 */
function overlayOf(ref: Referential): Overlay {
  const overlay: Overlay = {
    spelling: new Map(),
    passes: new Map(),
    passOfStation: new Map(),
    entryIds: new Map(),
    sais: new Map(),
    logos: new Map(),
    glacier: new Set()
  }

  for (const entry of domainsFromReferential(ref, slug)) {
    const entryKey = squash(entry.name)
    const station = stationNameOf(entry.name) || entry.name
    const stationKey = squash(station)

    remember(overlay.spelling, entryKey, entry.name)
    remember(overlay.spelling, stationKey, station)

    for (const key of new Set([entryKey, stationKey])) {
      const ids = overlay.entryIds.get(key)
      if (ids) ids.push(entry.id)
      else overlay.entryIds.set(key, [entry.id])
      if (entry.sais != null && !overlay.sais.has(key)) overlay.sais.set(key, entry.sais)
      if (entry.logo && !overlay.logos.has(key)) overlay.logos.set(key, entry.logo)
      if (entry.glacier) overlay.glacier.add(key)
      if (entry.pass) remember(overlay.passOfStation, key, entry.pass)
    }

    if (entry.pass) {
      const passKey = squash(entry.pass)
      remember(overlay.passes, passKey, entry.pass)
      remember(overlay.spelling, passKey, entry.pass)
      if (entry.sais != null && !overlay.sais.has(passKey)) overlay.sais.set(passKey, entry.sais)
      if (entry.glacier) overlay.glacier.add(passKey)
    }
  }
  return overlay
}

/**
 * Graphie retenue pour une station.
 *
 * Le classeur d'abord — c'est lui qui fait foi sur l'existence de la station —
 * puis la plus belle graphie du même nom, prise au référentiel, à la table des
 * stations ou au fichier communal. Le nom lui-même ne change jamais.
 */
function displayName(station: FmStation, overlay: Overlay): string {
  const usable = (candidate: string): boolean =>
    sameLetters(candidate, station.fmName) &&
    // Un tiret cadratin sépare deux lieux dans le référentiel — « Tignes – Les
    // Brévières », « Besse – Super Besse ». Les mêmes lettres ne suffisent donc
    // pas : emprunter cette graphie réintroduirait dans la liste les libellés
    // composites dont le modèle « stations d'abord » s'était débarrassé.
    (!/\s[–—-]\s/.test(candidate) || /\s[–—-]\s/.test(station.fmName))

  const known = overlay.spelling.get(squash(station.fmName))
  if (known && usable(known)) return known
  if (usable(station.commune)) return station.commune
  return station.fmName
}

/**
 * Libellé du domaine skiable, dans la graphie qui porte le tarif.
 *
 * Trois passes, de la plus sûre à la plus large. La dernière — le forfait des
 * stations reconnues du même domaine — n'est retenue que si les stations
 * reconnues s'accordent : un domaine du classeur dont deux stations relèvent de
 * deux forfaits différents garde le libellé du classeur, et son tarif restera
 * estimé plutôt que faux.
 */
function domainLabel(label: string, members: FmStation[], overlay: Overlay): string {
  const direct = overlay.passes.get(squash(label))
  if (direct) return direct

  for (const segment of villagesOfName(label)) {
    const hit = overlay.passes.get(squash(segment))
    if (hit) return hit
  }

  const voters = members.filter((m) => overlay.passOfStation.has(squash(m.fmName)))
  const passes = new Set(voters.map((m) => overlay.passOfStation.get(squash(m.fmName)) as string))
  if (passes.size !== 1) return label

  // Une seule station reconnue ne renomme le domaine que si c'est **elle** qui
  // le nomme — « Les Houches » dans « Les Houches - Saint-Gervais », Vallorcine
  // dans « Balme - Vallorcine ». Sans cette réserve, Pra Loup, que le classeur
  // range avec Le Sauze, ferait porter le forfait Espace Lumière — qu'on
  // n'achète pas au Sauze — à tout le groupe.
  const key = squash(label)
  const eponymous = voters.some((m) => key.includes(squash(m.fmName)))
  if (voters.length * 2 >= members.length || eponymous) return [...passes][0]

  return label
}

/**
 * Rattachements corrigés à la main, et pourquoi.
 *
 * Le classeur rattache chaque station au domaine dont **les pistes sont les
 * plus proches de son village** — méthode robuste, qui se trompe là où le
 * village est loin de son propre domaine. Cinq stations sont concernées, toutes
 * repérées en confrontant le classeur au forfait relié que le référentiel livré
 * déclare pour la même station. Trois sont corrigées ici, deux ne le sont pas :
 *
 * * **Combloux** et **La Giettaz** — le référentiel les donne à « Evasion
 *   Mont-Blanc » et à « Espace Diamant », le classeur aux « Portes du
 *   Mont-Blanc ». C'est le classeur qui a raison : les Portes du Mont-Blanc
 *   sont le domaine relié de ces deux villages, et un secteur d'Evasion
 *   Mont-Blanc. Aucune correction.
 *
 * Une correction ne peut que **déplacer une station vers un autre domaine du
 * classeur** : les altitudes, les kilomètres et les remontées restent des
 * mesures de ce fichier-là, prises sur le domaine d'arrivée. Rien n'est saisi à
 * la main ici, sauf le rattachement lui-même.
 */
export const DOMAIN_FIXES: Record<string, { domain: string; why: string }> = {
  Orelle: {
    domain: 'Les Trois Vallées',
    why:
      "le funitel d'Orelle monte à la Cime Caron et le forfait vendu est celui des 3 Vallées ; " +
      'le classeur voit les pistes de Galibier-Thabor plus près du village'
  },
  'Auris en Oisans': {
    domain: "Alpe d'Huez Grand Domaine",
    why:
      "Auris est un secteur de l'Alpe d'Huez Grand Domaine — c'est ce que déclare le référentiel livré ; " +
      'le classeur la rattache aux 2 Alpes, dont les pistes passent plus près'
  },
  Samoens: {
    domain: 'Le Grand Massif',
    why:
      'Samoëns est une porte du Grand Massif, où le classeur range déjà « Samoëns 1600 » ; ' +
      'le village, en fond de vallée, est rattaché aux Portes du Soleil par proximité'
  }
}

/** Stations du catalogue écartées de la liste, avec le motif. */
export interface ExcludedStation {
  name: string
  reason: 'domaine inconnu' | 'doublon du catalogue'
}

export interface Catalogue {
  stations: Domain[]
  excluded: ExcludedStation[]
}

/**
 * Le catalogue converti en stations affichables.
 *
 * L'ordre du classeur est conservé — alphabétique — et chaque station garde
 * l'identifiant que l'importeur lui a donné : il ne dépend ni du référentiel
 * chargé, ni du moteur local, ce qui est la seule façon pour un logement
 * importé de retrouver sa station d'un lancement à l'autre.
 *
 * Deux motifs d'écart, tous deux publiés par l'audit :
 *
 * * **domaine inconnu** — le classeur n'a trouvé aucune piste alpine
 *   cartographiée près de la station, donc ni altitude de pistes, ni
 *   kilométrage, ni remontées ;
 * * **doublon** — France Montagnes publie deux fois la même station
 *   (« CHAMONIX-MONT-BLANC » et « Chamonix Mont-Blanc »), et le classeur a
 *   gardé les deux lignes. Même nom, même domaine : c'est la même station.
 */
export function buildCatalogue(ref: Referential): Catalogue {
  const overlay = overlayOf(ref)
  const excluded: ExcludedStation[] = []

  /** Corrections retrouvées par la clé de recherche : la table est écrite avec
 *  les libellés du classeur, pas avec leur forme normalisée. */
  const fixes = new Map(Object.entries(DOMAIN_FIXES).map(([name, fix]) => [squash(name), fix]))

  /** Domaine de rattachement, correction comprise. */
  const domainOf = (station: FmStation): string | null =>
    fixes.get(squash(station.fmName))?.domain ?? station.domain

  const byDomain = new Map<string, FmStation[]>()
  for (const station of FM_STATIONS) {
    const label = domainOf(station)
    if (!label) continue
    const list = byDomain.get(label)
    if (list) list.push(station)
    else byDomain.set(label, [station])
  }

  const labels = new Map<string, string>()
  for (const [label, members] of byDomain) labels.set(label, domainLabel(label, members, overlay))

  /**
   * Ligne qui porte les mesures d'un domaine.
   *
   * Les chiffres de domaine — altitudes des pistes, kilomètres, remontées —
   * sont répétés sur chaque ligne du classeur. Une station corrigée porte donc
   * ceux de son ancien domaine : elle emprunte ceux d'une ligne restée à sa
   * place, jamais une valeur saisie ici.
   */
  const measures = new Map<string, FmStation>()
  for (const [label, members] of byDomain) {
    const settled = members.find((m) => m.domain === label && m.min != null && m.max != null)
    if (settled) measures.set(label, settled)
  }

  const taken = new Set<string>()
  const stations: Domain[] = []

  for (const station of FM_STATIONS) {
    const domain = domainOf(station)
    // Les mesures viennent du domaine de rattachement : celles de la ligne
    // elle-même, sauf si la station a été recollée à un autre domaine.
    const measured = (domain && measures.get(domain)) || station
    // Sans domaine rattaché, le classeur n'a ni altitude de pistes, ni
    // kilométrage, ni remontées : la station ne peut être ni notée, ni filtrée,
    // ni comparée. Elle est nommée par l'audit, pas remplie de zéros.
    if (!domain || measured.min == null || measured.max == null) {
      excluded.push({ name: station.fmName, reason: 'domaine inconnu' })
      continue
    }

    const name = displayName(station, overlay)
    const key = squash(name)
    // Même nom, même domaine : la même station, publiée deux fois par la
    // source. La première ligne l'emporte, la seconde est nommée par l'audit.
    if (taken.has(key)) {
      excluded.push({ name: station.fmName, reason: 'doublon du catalogue' })
      continue
    }
    taken.add(key)

    const pass = labels.get(domain) ?? domain
    const passKey = squash(pass)
    const km = measured.km ?? 0

    stations.push({
      id: station.id,
      slug: slug(name),
      name,
      massif: station.massif,
      region: station.departement,
      min: measured.min,
      max: measured.max,
      village: station.village ?? measured.min,
      km,
      lifts: measured.lifts ?? 0,
      glacier: overlay.glacier.has(key) || overlay.glacier.has(passKey),
      pass,
      // Les altitudes ne sont pas estimées : le village est mesuré sur le
      // modèle de terrain de l'IGN, les pistes sur les tracés OpenSkiMap.
      curated: true,
      lat: station.lat,
      lon: station.lon,
      sais: overlay.sais.get(key) ?? overlay.sais.get(passKey) ?? defaultSeasonality(km),
      website: officialSiteOf(name)?.url ?? null,
      booking: station.booking,
      logo: overlay.logos.get(key) ?? overlay.logos.get(passKey) ?? null,
      // Les entrées du référentiel que cette station absorbe : un logement
      // importé sous l'une d'elles reste attaché à la station.
      members: overlay.entryIds.get(key) ?? []
    })
  }

  return { stations, excluded }
}

/**
 * Les stations affichables du catalogue.
 *
 * Mémoïsé sur le référentiel chargé : la conversion parcourt le classeur et le
 * référentiel entiers, et `loadDomains` comme `fallbackDomains` la demandent au
 * même rendu. Le cache est faible — un référentiel remplacé libère le sien.
 */
const CACHE = new WeakMap<Referential, Catalogue>()

export function catalogueOf(ref: Referential): Catalogue {
  const hit = CACHE.get(ref)
  if (hit) return hit
  const built = buildCatalogue(ref)
  CACHE.set(ref, built)
  return built
}

export function catalogueStations(ref: Referential): Domain[] {
  return catalogueOf(ref).stations
}

/** Stations du classeur qu'aucune liste ne peut afficher, et pourquoi. */
export function excludedStations(ref: Referential): ExcludedStation[] {
  return catalogueOf(ref).excluded
}

/** Le classeur, indexé par identifiant : ce que la fiche station peut montrer
 *  et que le type `Domain` ne porte pas — plan des pistes, fiche, médiane. */
export const FM_BY_ID = new Map<number, FmStation>(FM_STATIONS.map((s) => [s.id, s]))
