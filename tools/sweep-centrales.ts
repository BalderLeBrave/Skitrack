/**
 * Balayage des centrales : est-ce que ça marche vraiment, partout ?
 *
 *   npm run centrales:sweep
 *   npm run centrales:sweep -- --du 2027-02-13 --nuits 7 --personnes 4
 *   npm run centrales:sweep -- --limit 5        (les cinq premières)
 *
 * Écrit `docs/diagnostics/centrales-releve.md`.
 *
 * ## Ce que cet outil répond, et que rien d'autre ne répond
 *
 * Le connecteur a été prouvé sur quatre centrales. Quatre n'est pas cinquante :
 * une plateforme partagée ne garantit pas que chaque site en expose la même
 * version, et un relevé qui marche à Courchevel peut échouer aux Karellis pour
 * une raison qu'aucune lecture de code ne prédira.
 *
 * Ce script interroge donc **chaque centrale connue**, une fois, avec les mêmes
 * dates, et publie deux choses :
 *
 * * **ce qui répond** — combien d'offres, en combien de temps, ou l'erreur
 *   exacte quand il n'y en a pas ;
 * * **ce qui est renseigné** — prix, personnes, pièces, surface, coordonnées,
 *   photo, avis, équipements. Un connecteur qui ramène cinquante logements sans
 *   prix ne sert à rien, et seul un décompte le dit.
 *
 * ## Ce qu'il ne fait pas
 *
 * Une seule recherche par centrale, jamais par station : six stations du Val
 * d'Arly partagent un site, et l'interroger six fois n'apprendrait rien de plus
 * tout en le sollicitant six fois. Une seule tentative est faite — un balayage
 * n'a pas à insister.
 *
 * Trois centrales sont interrogées de front, jamais deux fois la même : la
 * politesse se mesure par hôte, et un balayage séquentiel de soixante-dix-sept
 * sites dont chacun peut mettre une minute à répondre ne se termine pas dans la
 * soirée. Chaque hôte ne voit donc qu'une recherche, et rien ne change pour lui.
 *
 * ## La seconde passe, et pourquoi elle existe
 *
 * Une bonne moitié des centrales Ingénie est hébergée sur la même
 * infrastructure. Interrogées trois de front, quatorze d'entre elles ont rendu
 * `ERR_CONNECTION_TIMED_OUT` — alors qu'elles répondent parfaitement une par
 * une. Conclure « injoignable » aurait été accuser le site d'un défaut qui
 * venait du balayage.
 *
 * Les échecs qui ressemblent à un étranglement — délai de connexion, clic qui
 * expire — sont donc rejoués **une centrale à la fois**, avec une pause. Le
 * rapport dit lesquels ont été rattrapés : c'est la différence entre un site
 * qui refuse et un outil trop pressé.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Accommodation } from '@main/providers/types'
import { createStationProvider } from '@main/providers/station/station'
import { closeWebscrapeBrowser } from '@main/providers/webscrape/shared'
import { BUNDLED_REFERENTIAL } from '@/data/referentiel'
import { catalogueStations } from '@/data/catalogue'
import { bookingCentralOf } from '@/data/stations'

const OUT = 'docs/diagnostics/centrales-releve.md'
/** Centrales interrogées de front — trois hôtes distincts, jamais le même. */
const LANES = 3

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback)
}

const from = arg('du', '2027-02-13')
const nights = Number(arg('nuits', '7'))
const adults = Number(arg('personnes', '4'))
const limit = Number(arg('limit', '0'))

const to = new Date(Date.parse(from) + nights * 86_400_000).toISOString().slice(0, 10)

// Une entrée par centrale, avec les stations qu'elle dessert.
const byUrl = new Map<string, string[]>()
for (const station of catalogueStations(BUNDLED_REFERENTIAL)) {
  const url = bookingCentralOf(station.name)
  if (!url) continue
  byUrl.set(url, [...(byUrl.get(url) ?? []), station.name])
}
const centrals = [...byUrl].slice(0, limit > 0 ? limit : undefined)

/**
 * Un échec qui ressemble à un étranglement, pas à un refus.
 *
 * Chaque moteur a son dialecte pour la même panne :
 * `net::ERR_*` (Chromium), « Protocol error (Page.navigate): Network error »
 * (Obscura), `NS_ERROR_NET_TIMEOUT` (Firefox). Même cause probable — trois
 * hôtes de front sur l'infra Ingénie partagée — même remède : rejouer seul.
 *
 * Les « Timeout AJAX formulaire / résultats » sont du même bois : un widget
 * qui ne monte pas en 30 s sur une infra sollicitée est exactement le « clic
 * qui expire » que la seconde passe existe pour départager. Au sweep du
 * 2026-08-24 (Firefox), six centrales sont sorties sur ces motifs sans être
 * rejouées — la passe n'a départagé personne.
 */
function looksThrottled(error: string | null): boolean {
  return (
    error != null &&
    /ERR_CONNECTION|ERR_TIMED|Timeout \d+ms exceeded|net::ERR_|Page\.navigate\): Network error|NS_ERROR_NET|Timeout AJAX/.test(
      error
    )
  )
}

interface Result {
  url: string
  host: string
  stations: string[]
  offers: number
  seconds: number
  error: string | null
  /** Rattrapée par la seconde passe, une centrale à la fois. */
  retried: boolean
  /** Nombre d'offres qui renseignent chaque champ. */
  filled: Record<string, number>
}

const FIELDS: [string, (a: Accommodation) => boolean][] = [
  ['prix', (a) => (a.totalPrice ?? 0) > 0],
  ['prix ferme', (a) => a.priceConfidence === 'total_confirmed'],
  ['personnes', (a) => (a.guests ?? 0) > 0],
  ['pièces', (a) => (a.rooms ?? 0) > 0],
  ['chambres', (a) => (a.bedrooms ?? 0) > 0],
  ['surface', (a) => (a.areaSqm ?? 0) > 0],
  ['coordonnées', (a) => a.latitude != null && a.longitude != null],
  ['ville', (a) => Boolean(a.city)],
  ['photo', (a) => (a.images?.length ?? 0) > 0],
  ['avis', (a) => (a.reviewCount ?? 0) > 0],
  ['équipements', (a) => (a.amenities?.length ?? 0) > 0],
  ['lien', (a) => Boolean(a.url)]
]

const provider = createStationProvider({ timeoutMs: 40_000, headless: true, maxRetries: 1 })
const results: Result[] = []
const queue = [...centrals.entries()]

async function runOne([index, [url, stations]]: [number, [string, string[]]], retry = false): Promise<void> {
  const host = new URL(url).host
  const started = Date.now()
  const filled: Record<string, number> = {}
  let offers: Accommodation[] = []
  let error: string | null = null

  try {
    offers = await provider.search({
      destination: stations[0],
      officialUrl: url,
      checkIn: from,
      checkOut: to,
      adults,
      children: 0
    } as never)
    for (const [name, has] of FIELDS) filled[name] = offers.filter(has).length
  } catch (err) {
    error = (err instanceof Error ? err.message : String(err)).split(/\r?\n/)[0]
  }

  const seconds = Math.round((Date.now() - started) / 1000)
  const previous = results.findIndex((r) => r.url === url)
  const result: Result = { url, host, stations, offers: offers.length, seconds, error, filled, retried: retry }
  if (previous === -1) results.push(result)
  else results[previous] = result
  console.log(
    `${String(results.length).padStart(2)}/${centrals.length} ${host.padEnd(38)} ` +
      `${error ? `échec — ${error.slice(0, 70)}` : `${offers.length} offres en ${seconds} s`}`
  )
}

await Promise.all(
  Array.from({ length: LANES }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await runOne(next)
  })
)

// Seconde passe : ce qui ressemble à un étranglement est rejoué seul.
const throttled = results.filter((r) => looksThrottled(r.error)).map((r) => r.url)
if (throttled.length > 0) {
  console.log(`
Seconde passe, une centrale à la fois — ${throttled.length} à rejouer`)
  for (const url of throttled) {
    const stations = byUrl.get(url) ?? []
    await new Promise((resolve) => setTimeout(resolve, 4_000))
    await runOne([0, [url, stations]], true)
  }
}

// L'ordre d'arrivée n'est pas celui de la liste : on remet les centrales dans
// l'ordre où elles ont été demandées, pour que le rapport soit relisible.
results.sort((a, b) => a.host.localeCompare(b.host, 'fr'))

await closeWebscrapeBrowser()

// --- Rapport ----------------------------------------------------------------

const lines: string[] = []
const w = (s = ''): void => void lines.push(s)

const served = results.filter((r) => r.offers > 0)
const empty = results.filter((r) => !r.error && r.offers === 0)
const failed = results.filter((r) => r.error)
const stationsServed = served.reduce((n, r) => n + r.stations.length, 0)
const stationsAll = results.reduce((n, r) => n + r.stations.length, 0)
const total = served.reduce((n, r) => n + r.offers, 0)
const share = (field: string): string => {
  const got = served.reduce((n, r) => n + (r.filled[field] ?? 0), 0)
  return total > 0 ? `${Math.round((got / total) * 100)} %` : '—'
}

w('# Relevé des centrales — ce qui répond et ce qui est renseigné')
w()
w('*Généré par `npm run centrales:sweep` — ne pas éditer à la main.*')
w(`*Une recherche par centrale : arrivée le ${from}, ${nights} nuits, ${adults} personnes.*`)
w('*Une seule tentative, trois centrales interrogées de front.*')
w()
w('## Chiffres')
w()
w('| | |')
w('| --- | --- |')
w(`| Centrales interrogées | **${results.length}** |`)
w(`| Qui rendent des offres | **${served.length}** |`)
w(`| Qui répondent sans offre | ${empty.length} |`)
w(`| En échec | ${failed.length} |`)
w(`| Rattrapées en seconde passe | ${results.filter((r) => r.retried && r.offers > 0).length} |`)
w(`| Stations couvertes | **${stationsServed}** / ${stationsAll} |`)
w(`| Offres relevées | ${total} |`)
w()
w('## Champs renseignés, sur l’ensemble des offres relevées')
w()
w('| Champ | Part des offres |')
w('| --- | ---: |')
for (const [name] of FIELDS) w(`| ${name} | ${share(name)} |`)
w()
w('Le **prix ferme** se distingue du prix : une fiche qui affiche « à partir de »')
w('donne un tarif d’appel, pas le prix du séjour demandé. Il est relevé, marqué')
w('comme partiel, et n’entre pas tel quel dans le coût du séjour.')
w()
w('Les **chambres** ne sont pas publiées par ces centrales : elles comptent des')
w('**pièces** — « 2 pièces 4 personnes ». Les deux colonnes disent donc la même')
w('chose sur la donnée disponible, pas sur le connecteur.')
w()
w('## Par centrale')
w()
w('| Centrale | Stations | Offres | Durée | Prix | Personnes | Pièces | Surface | Position | État |')
w('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |')
for (const r of results) {
  const cell = (field: string): string => (r.offers > 0 ? String(r.filled[field] ?? 0) : '—')
  w(
    `| \`${r.host}\` | ${r.stations.length} | ${r.offers || '—'} | ${r.seconds} s | ` +
      `${cell('prix')} | ${cell('personnes')} | ${cell('pièces')} | ${cell('surface')} | ${cell('coordonnées')} | ` +
      `${r.error ? `échec : ${r.error.slice(0, 90)}` : r.offers > 0 ? (r.retried ? 'ok (seconde passe)' : 'ok') : 'aucune offre'} |`
  )
}
w()

if (failed.length > 0) {
  w('## Les échecs, un par un')
  w()
  for (const r of failed) {
    w(`### \`${r.host}\` — ${r.stations.join(', ')}`)
    w()
    w(`> ${r.error}`)
    w()
  }
}

if (empty.length > 0) {
  w('## Répondent sans offre')
  w()
  w('Ni erreur ni logement : la centrale a accepté la recherche et n’a rien à')
  w('proposer pour ces dates, ou sa page de résultats ne se lit pas comme celle')
  w('d’Ingénie. Les deux se distinguent en ouvrant le lien.')
  w()
  for (const r of empty) w(`- \`${r.host}\` — ${r.stations.join(', ')}`)
  w()
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8')
console.log(
  `\n${OUT} — ${served.length}/${results.length} centrales servent des offres, ` +
    `${stationsServed}/${stationsAll} stations couvertes, ${total} offres`
)
