/**
 * Reconnaissance des centrales de réservation.
 *
 *   node tools/recon-centrales.mjs            (tout, ~4 minutes)
 *   node tools/recon-centrales.mjs --limit 5  (les cinq premières)
 *   npm run centrales:recon
 *
 * Écrit `docs/diagnostics/centrales-reconnaissance.md`.
 *
 * ## Pourquoi cette étape existe
 *
 * Le relevé versionné (`station/centrals.ts`) dit comment **lancer** une
 * recherche sur chaque centrale ; il ne dit pas comment en **lire** les
 * résultats, et surtout pas où est le prix. Écrire un connecteur par station
 * sans savoir sur quelle plateforme chacune tourne reviendrait à écrire
 * cinquante fois le même code — ou à en écrire un qui échoue en silence.
 *
 * Ce script va donc regarder. Pour chaque centrale, une requête sur
 * `robots.txt`, une sur la page d'accueil, et trois questions :
 *
 * * **le relevé est-il autorisé ?** `robots.txt` fait autorité. Une centrale
 *   qui interdit le chemin des résultats est marquée « relevé interdit », et le
 *   connecteur ne l'interrogera jamais — l'application proposera d'ouvrir la
 *   page à la main.
 * * **sur quelle plateforme tourne-t-elle ?** Ingénie, Open System, Ceto,
 *   Elloha, Eliberty, Ublo… Une trentaine de centrales partagent la même : c'est
 *   ce qui rend le chantier fini plutôt qu'infini.
 * * **que publie la page ?** Un bloc `application/ld+json` est de la donnée
 *   structurée destinée aux machines : quand il est là, l'extraction est stable
 *   et ne dépend pas d'une classe CSS qui changera.
 *
 * ## Ce que ce script ne fait pas
 *
 * Il ne lance aucune recherche, ne remplit aucun formulaire et ne lit aucune
 * page de résultats : deux requêtes par hôte, espacées, sur des pages
 * publiques. C'est une reconnaissance, pas un relevé.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from 'playwright'
import { CENTRALS } from '../src/main/providers/station/centrals.ts'
import { parseRobots, robotsAllows } from '../src/main/providers/station/robots.ts'

const OUT = 'docs/diagnostics/centrales-reconnaissance.md'

/** Entre deux hôtes. Une reconnaissance n'a aucune raison d'être rapide. */
const DELAY_MS = 2000
const TIMEOUT_MS = 20_000
const MAX_BYTES = 800_000

/** Une identité lisible vaut mieux qu'un navigateur déguisé : l'exploitant qui
 *  lit ses journaux doit pouvoir comprendre ce qui l'a visité. */
const USER_AGENT = 'SkitrackRecon/1.0 (reconnaissance ponctuelle, 2 requêtes par hôte)'

/**
 * Marqueurs de plateforme, du plus spécifique au plus général.
 *
 * Chaque entrée est un couple `[nom, motif]` cherché dans le HTML de la page
 * d'accueil. L'ordre compte : un site Ingénie contient un `<form>`, mais un
 * site à `<form>` n'est pas Ingénie.
 */
const PLATFORMS = [
  ['Ingénie', /ingenie|MoteurRecherche|form-recherche|datedleb_resa/i],
  ['Open System', /open-?system|opensystem\.fr/i],
  ['Ceto / Orchestra', /ceto\.fr|orchestra-?platform|cetonline/i],
  ['Eliberty', /eliberty/i],
  ['Ublo', /ublo\.|valraiso|msem\.fr/i],
  ['Elloha', /elloha/i],
  ['Reservit', /reservit/i],
  ['Availpro / Amenitiz', /availpro|amenitiz/i],
  ['Yoplanning', /yoplanning/i],
  ['Secutix', /secutix/i],
  ['WooCommerce', /woocommerce/i],
  ['WordPress (moteur non identifié)', /wp-content|wp-json/i],
  ['React (moteur embarqué)', /react-select|__NEXT_DATA__|data-reactroot/i]
]

function fingerprint(html) {
  const found = PLATFORMS.filter(([, pattern]) => pattern.test(html)).map(([name]) => name)
  return found.length > 0 ? found : ['non identifiée']
}

/**
 * Repli navigateur.
 *
 * Huit centrales refusent une requête `fetch` — délai de connexion épuisé, ou
 * 403 — alors qu'elles répondent normalement à un navigateur : elles filtrent
 * sur l'empreinte TLS ou sur l'agent, pas sur l'intention. Les déclarer
 * « injoignables » serait faux, et ferait renoncer à des centrales que le
 * connecteur atteint parfaitement, lui qui pilote un vrai Chromium.
 *
 * Le navigateur n'est lancé que si une requête a échoué, et une seule fois pour
 * toute la reconnaissance.
 */
let browser = null
async function getViaBrowser(url) {
  browser ??= await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
    return { status: res?.status() ?? 0, url: page.url(), text: await page.content(), via: 'navigateur' }
  } catch (err) {
    // Playwright raconte l'échec sur plusieurs lignes ; le rapport n'en veut
    // que la première, celle qui nomme la cause.
    const detail = err instanceof Error ? err.message.split(/\r?\n/)[0] : String(err)
    return { status: 0, url, text: '', via: 'navigateur', error: detail }
  } finally {
    await page.close()
  }
}

async function get(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain,*/*' }
    })
    const buffer = await res.arrayBuffer()
    const text = new TextDecoder('utf-8').decode(buffer.slice(0, MAX_BYTES))
    return { status: res.status, url: res.url, text, via: 'fetch' }
  } catch (err) {
    return { status: 0, url, text: '', via: 'fetch', error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Une centrale par hôte : les six stations du Val d'Arly partagent un site, et
// le sonder six fois n'apprendrait rien de plus.
const byHost = new Map()
for (const central of CENTRALS) {
  const seen = byHost.get(central.host)
  if (seen) seen.stations.push(central.station)
  else byHost.set(central.host, { ...central, stations: [central.station] })
}

const limitArg = process.argv.indexOf('--limit')
const hosts = [...byHost.values()].slice(0, limitArg === -1 ? undefined : Number(process.argv[limitArg + 1]))

const findings = []
for (const [index, central] of hosts.entries()) {
  const origin = new URL(central.url).origin
  const path = new URL(central.url).pathname

  const robotsRes = await get(`${origin}/robots.txt`)
  const rules = robotsRes.status === 200 && /disallow|allow|user-agent/i.test(robotsRes.text)
    ? parseRobots(robotsRes.text)
    : []
  const home = robotsAllows(rules, path)
  // Les chemins de résultats des plateformes rencontrées. On ne les visite
  // pas : on demande seulement lesquels `robots.txt` autoriserait. C'est ce qui
  // distingue une centrale relevable d'une centrale qu'on ne fera qu'ouvrir.
  const paths = ['/booking', '/serp', '/recherche', '/reservation', '/hebergements', '/location']
  const verdicts = paths.map((p) => ({ path: p, ...robotsAllows(rules, p) }))
  const booking = verdicts[0]

  await sleep(DELAY_MS)
  let page = { status: 0, url: central.url, text: '', via: 'aucun', error: 'relevé interdit par robots.txt' }
  if (home.allowed) {
    page = await get(central.url)
    // Un refus qui ressemble à un filtrage d'agent, pas à une absence : on
    // redemande une fois, avec un navigateur.
    if (page.status === 0 || page.status === 403) {
      await sleep(DELAY_MS)
      page = await getViaBrowser(central.url)
    }
  }

  findings.push({
    host: central.host,
    stations: central.stations,
    url: central.url,
    status: page.status,
    finalUrl: page.url,
    error: page.error ?? null,
    via: page.via,
    robots: {
      present: robotsRes.status === 200,
      rules: rules.length,
      home,
      booking,
      verdicts
    },
    platforms: page.text ? fingerprint(page.text) : [],
    ldJson: /application\/ld\+json/i.test(page.text),
    cid: /name="cid"\s+value="(\d+)"|value="(\d+)"\s+name="cid"/i.exec(page.text)?.slice(1).find(Boolean) ?? null,
    getForm: /<form[^>]+method=["']?get["']?[^>]*>/i.test(page.text)
  })

  console.log(
    `${String(index + 1).padStart(2)}/${hosts.length} ${central.host.padEnd(34)} ` +
      `${page.status || 'ERR'} ${(page.text ? fingerprint(page.text) : ['—']).join(', ')}` +
      `${page.via === 'navigateur' ? ' [navigateur]' : ''}` +
      `${home.allowed ? '' : '  [robots: interdit]'}`
  )
  await sleep(DELAY_MS)
}

// --- Rapport ----------------------------------------------------------------

const lines = []
const w = (s = '') => void lines.push(s)

const reachable = findings.filter((f) => f.status >= 200 && f.status < 400)
const forbidden = findings.filter((f) => !f.robots.home.allowed)
const ingenie = findings.filter((f) => f.platforms.includes('Ingénie'))
const unknown = findings.filter((f) => f.platforms.length > 0 && f.platforms.every((p) => p === 'non identifiée'))

w('# Reconnaissance des centrales de réservation')
w()
w('*Généré par `npm run centrales:recon` — ne pas éditer à la main.*')
w('*Source des adresses : `docs/sources/centrales-selecteurs.xlsx`, relevé à la main.*')
w('*Deux requêtes par hôte — `robots.txt` puis la page d’accueil —, espacées de 2 s.*')
w('*Aucune recherche n’est lancée : ce rapport dit ce qui est lisible, pas ce qui a été relevé.*')
w()
w('## Chiffres')
w()
w('| | |')
w('| --- | --- |')
w(`| Centrales sondées | **${findings.length}** |`)
w(`| Stations desservies | ${findings.reduce((n, f) => n + f.stations.length, 0)} |`)
w(`| Joignables | ${reachable.length} |`)
w(`| dont joignables seulement en navigateur | ${findings.filter((f) => f.via === 'navigateur' && f.status >= 200 && f.status < 400).length} |`)
w(`| Relevé interdit par robots.txt | **${forbidden.length}** |`)
w(`| Sur Ingénie — déjà couvertes par le connecteur | **${ingenie.length}** |`)
w(`| Plateforme non identifiée | ${unknown.length} |`)
w(`| Publient un bloc ld+json | ${findings.filter((f) => f.ldJson).length} |`)
w()

if (forbidden.length > 0) {
  w('## Centrales dont le relevé est interdit')
  w()
  w('Leur `robots.txt` interdit le chemin. Elles ne sont jamais interrogées ; l’écran')
  w('proposera d’ouvrir la page à la main, dates pré-remplies.')
  w()
  for (const f of forbidden) w(`- **${f.host}** — \`${f.robots.home.rule}\` — ${f.stations.join(', ')}`)
  w()
}

w('## Par plateforme')
w()
const families = new Map()
for (const f of findings) {
  const key = f.platforms.length > 0 ? f.platforms[0] : 'injoignable'
  families.set(key, [...(families.get(key) ?? []), f])
}
for (const [family, members] of [...families].sort((a, b) => b[1].length - a[1].length)) {
  w(`### ${family} — ${members.length} centrale(s), ${members.reduce((n, f) => n + f.stations.length, 0)} station(s)`)
  w()
  for (const f of members) {
    const marks = [
      f.ldJson ? 'ld+json' : null,
      f.cid ? `cid=${f.cid}` : null,
      f.getForm ? 'formulaire GET' : null,
      f.via === 'navigateur' && f.status >= 200 ? 'refuse fetch, répond au navigateur' : null,
      f.robots.home.allowed ? null : 'robots: interdit',
      f.status >= 400 || f.status === 0 ? `HTTP ${f.status || 'échec'}` : null
    ].filter(Boolean)
    w(`- \`${f.host}\`${marks.length ? ` — ${marks.join(' · ')}` : ''} — ${f.stations.join(', ')}`)
  }
  w()
}

w('## Détail')
w()
w('| Centrale | HTTP | Plateformes | ld+json | chemins interdits | Stations |')
w('| --- | ---: | --- | :-: | --- | --- |')
for (const f of findings) {
  const blocked = (f.robots.verdicts ?? []).filter((v) => !v.allowed).map((v) => `\`${v.path}\``)
  const robots = !f.robots.present ? 'pas de robots.txt' : blocked.length === 0 ? 'aucun' : blocked.join(' ')
  w(
    `| \`${f.host}\` | ${f.status || 'échec'} | ${f.platforms.join(', ') || (f.error ?? '—')} | ` +
      `${f.ldJson ? '✓' : '—'} | ${robots} | ${f.stations.length} |`
  )
}
w()
w('Les chemins testés sont ceux des plateformes rencontrées — `/booking` pour')
w('Ingénie, `/serp` pour Ceto, puis `/recherche`, `/reservation`, `/hebergements`')
w('et `/location`. Aucun n’a été visité : seule la règle a été lue.')
w()
w('## Ce que ce rapport ne dit pas')
w()
w('Il ne dit rien des **pages de résultats** : ni la forme des cartes, ni où se')
w('trouve le prix. C’est le manque que le relevé versionné laisse ouvert — zéro')
w('sélecteur de prix sur 73 lignes — et il se comble plateforme par plateforme,')
w('en lisant une page de résultats réelle, pas en la devinant.')

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8')
console.log(`\n${OUT} — ${findings.length} centrales, ${ingenie.length} Ingénie, ${forbidden.length} interdites`)
