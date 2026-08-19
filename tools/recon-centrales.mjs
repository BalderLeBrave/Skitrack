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
import { CENTRALS } from '../src/main/providers/station/centrals.ts'

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
 * Règles `robots.txt` qui s'appliquent à nous.
 *
 * Le groupe `User-agent: *` fait foi faute de groupe nommé. Les motifs sont
 * gardés tels quels : c'est ce qui permet de citer la règle exacte dans le
 * rapport plutôt qu'un verdict sans preuve.
 */
function parseRobots(text) {
  const groups = []
  let current = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim()
    if (!line) continue
    const [rawKey, ...rest] = line.split(':')
    const key = rawKey.trim().toLowerCase()
    const value = rest.join(':').trim()
    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      continue
    }
    if (!current) continue
    if (key === 'disallow' || key === 'allow') current.rules.push({ allow: key === 'allow', path: value })
  }
  const mine = groups.find((g) => g.agents.some((a) => a.includes('skitrack')))
  const star = groups.find((g) => g.agents.includes('*'))
  return (mine ?? star)?.rules ?? []
}

/** Un chemin est-il permis ? Règle la plus longue d'abord, comme le veut la
 *  convention `robots.txt` ; `Disallow:` vide n'interdit rien. */
function allows(rules, path) {
  let verdict = { allowed: true, rule: null }
  let best = -1
  for (const rule of rules) {
    if (!rule.path) continue
    const pattern = rule.path.replace(/\*/g, '')
    if (!path.startsWith(pattern.split('$')[0])) continue
    if (pattern.length <= best) continue
    best = pattern.length
    verdict = { allowed: rule.allow, rule: `${rule.allow ? 'Allow' : 'Disallow'}: ${rule.path}` }
  }
  return verdict
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
    return { status: res.status, url: res.url, text }
  } catch (err) {
    return { status: 0, url, text: '', error: err instanceof Error ? err.message : String(err) }
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
  const home = allows(rules, path)
  // Les chemins de résultats les plus courants sur ces plateformes. On ne les
  // visite pas ; on demande seulement si `robots.txt` les autoriserait.
  const booking = allows(rules, '/booking')

  await sleep(DELAY_MS)
  const page = home.allowed ? await get(central.url) : { status: 0, url: central.url, text: '', error: 'relevé interdit par robots.txt' }

  findings.push({
    host: central.host,
    stations: central.stations,
    url: central.url,
    status: page.status,
    finalUrl: page.url,
    error: page.error ?? null,
    robots: {
      present: robotsRes.status === 200,
      rules: rules.length,
      home,
      booking
    },
    platforms: page.text ? fingerprint(page.text) : [],
    ldJson: /application\/ld\+json/i.test(page.text),
    cid: /name="cid"\s+value="(\d+)"|value="(\d+)"\s+name="cid"/i.exec(page.text)?.slice(1).find(Boolean) ?? null,
    getForm: /<form[^>]+method=["']?get["']?[^>]*>/i.test(page.text)
  })

  console.log(
    `${String(index + 1).padStart(2)}/${hosts.length} ${central.host.padEnd(34)} ` +
      `${page.status || 'ERR'} ${(page.text ? fingerprint(page.text) : ['—']).join(', ')}` +
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
      f.robots.home.allowed ? null : 'robots: interdit',
      f.status >= 400 || f.status === 0 ? `HTTP ${f.status || 'échec'}` : null
    ].filter(Boolean)
    w(`- \`${f.host}\`${marks.length ? ` — ${marks.join(' · ')}` : ''} — ${f.stations.join(', ')}`)
  }
  w()
}

w('## Détail')
w()
w('| Centrale | HTTP | Plateformes | ld+json | robots `/booking` | Stations |')
w('| --- | ---: | --- | :-: | --- | --- |')
for (const f of findings) {
  const robots = f.robots.present ? (f.robots.booking.allowed ? 'permis' : `interdit (\`${f.robots.booking.rule}\`)`) : 'absent'
  w(
    `| \`${f.host}\` | ${f.status || 'échec'} | ${f.platforms.join(', ') || (f.error ?? '—')} | ` +
      `${f.ldJson ? '✓' : '—'} | ${robots} | ${f.stations.length} |`
  )
}
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
