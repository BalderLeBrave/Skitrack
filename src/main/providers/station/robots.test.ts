/**
 * La règle `robots.txt` du connecteur des centrales.
 *
 * Ce test porte sur la seule décision qui engage le projet vis-à-vis des sites
 * relevés : interroger, ou s'abstenir. Une erreur d'analyse ici ne se voit pas
 * — elle produit un relevé qui ne devrait pas avoir lieu, ou un silence qui
 * n'a pas lieu d'être.
 *
 *   npm run robots:test
 */

import { allowsPath, forgetRobots, parseRobots, robotsAllows } from './robots'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

console.log('\nrobots.txt — ce que la centrale autorise\n')

console.log('1. Lecture des groupes')
const simple = parseRobots(`
User-agent: *
Disallow: /booking
Disallow: /espace-client
`)
check('les règles du groupe « * » sont lues', simple.length === 2, simple)
check('un chemin interdit l’est', !robotsAllows(simple, '/booking').allowed)
check('la règle qui tranche est citée', robotsAllows(simple, '/booking').rule === 'Disallow: /booking')
check('un chemin voisin reste permis', robotsAllows(simple, '/location').allowed)

const named = parseRobots(`
User-agent: *
Disallow: /

User-agent: SkitrackRecon
Disallow: /stats
`)
check('un groupe nommé l’emporte sur « * »', robotsAllows(named, '/booking').allowed, named)
check('et ses propres interdits s’appliquent', !robotsAllows(named, '/stats').allowed)

const shared = parseRobots(`
User-agent: Googlebot
User-agent: *
Disallow: /prive
`)
check('deux agents consécutifs déclarent un seul groupe', !robotsAllows(shared, '/prive').allowed, shared)

const orphan = parseRobots('Disallow:/')
check(
  'une règle sans en-tête `User-agent` compte quand même',
  !robotsAllows(orphan, '/booking').allowed,
  { regles: orphan, verdict: robotsAllows(orphan, '/booking') }
)

console.log('\n2. Priorité des règles')
const mixed = parseRobots(`
User-agent: *
Disallow: /booking
Allow: /booking/resultats
`)
check('la règle la plus longue gagne', robotsAllows(mixed, '/booking/resultats').allowed, robotsAllows(mixed, '/booking/resultats'))
check('et la plus courte s’applique ailleurs', !robotsAllows(mixed, '/booking/panier').allowed)

const equal = parseRobots(`
User-agent: *
Disallow: /x
Allow: /x
`)
check('à longueur égale, Allow l’emporte', robotsAllows(equal, '/x').allowed, robotsAllows(equal, '/x'))

// Le motif réellement publié par les centrales Ingénie.
const wildcard = parseRobots(`
User-agent: *
Disallow: /*?liste=*
Disallow: /*?action=*
Disallow: /*?cid=*
Disallow: /stats
`)
check(
  'un joker vise ce qu’il décrit',
  !robotsAllows(wildcard, '/booking?liste=1').allowed,
  robotsAllows(wildcard, '/booking?liste=1')
)
check(
  'et rien d’autre : le même chemin sans le paramètre reste permis',
  robotsAllows(wildcard, '/booking').allowed,
  robotsAllows(wildcard, '/booking')
)
check(
  'la page de résultats Ingénie, elle, porte `action` et `cid` — donc interdite',
  !robotsAllows(wildcard, '/booking?action=result&reload=1&cid=5').allowed,
  robotsAllows(wildcard, '/booking?action=result&reload=1&cid=5')
)
check('un chemin sans joker s’applique par préfixe', !robotsAllows(wildcard, '/stats/2026').allowed)

const anchored = parseRobots(`
User-agent: *
Disallow: /*.php$
`)
check('l’ancre `$` ne vise que la fin', !robotsAllows(anchored, '/index.php').allowed)
check('et laisse passer ce qui la dépasse', robotsAllows(anchored, '/index.php?x=1').allowed)

const permissive = parseRobots(`
User-agent: *
Disallow:
`)
check('« Disallow: » vide n’interdit rien', robotsAllows(permissive, '/booking').allowed)

console.log('\n3. Lecture réseau, cache et pannes')
forgetRobots()
let calls = 0
const fetcher = async (url: string): Promise<{ status: number; text: string }> => {
  calls++
  check(`la lecture vise bien /robots.txt (${url})`, url.endsWith('/robots.txt'))
  return { status: 200, text: 'User-agent: *\nDisallow: /booking\n' }
}
const first = await allowsPath('https://exemple.test', '/booking', fetcher)
check('le fichier lu interdit le chemin', !first.allowed, first)
await allowsPath('https://exemple.test', '/autre', fetcher)
check('la deuxième demande ne relit pas le fichier', calls === 1, { lectures: calls })

forgetRobots()
const missing = await allowsPath('https://muet.test', '/booking', async () => ({ status: 404, text: '' }))
check('un robots.txt absent vaut autorisation', missing.allowed, missing)

forgetRobots()
const broken = await allowsPath('https://panne.test', '/booking', async () => {
  throw new Error('ECONNREFUSED')
})
check('un hôte injoignable n’interdit pas non plus', broken.allowed, broken)

forgetRobots()
const html = await allowsPath('https://html.test', '/booking', async () => ({
  status: 200,
  text: '<!doctype html><html><body>page introuvable</body></html>'
}))
check('une page HTML servie à la place du fichier n’est pas prise pour des règles', html.allowed, html)

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log('\nRègle robots.txt vérifiée.')
