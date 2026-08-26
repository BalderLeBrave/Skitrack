/**
 * Ce que fait `robots.ts` **depuis qu'il n'applique plus `robots.txt`**.
 *
 * ## Lis ceci avant de lire un « ✓ »
 *
 * Ce fichier ne protège plus rien. Le 26 août 2026, `robots.ts` a été réécrit
 * en version permissive : il n'analyse plus les règles, ne lit plus le fichier,
 * et rend `allowed: true` pour tout chemin, sur tout hôte. Les tests
 * ci-dessous **constatent** ce comportement, ils ne le garantissent pas au sens
 * où l'entendait la version précédente.
 *
 * Un run vert ici ne dit donc pas « le connecteur respecte les règles des
 * centrales ». Il dit exactement l'inverse : « le connecteur ne les consulte
 * plus, et c'est délibéré ». C'est aussi ce qu'il faut retenir avant de lire
 * l'invariant « `robots.txt` fait autorité » du CLAUDE.md — il ne décrit plus
 * le code.
 *
 * La version qui appliquait la règle — groupes `User-agent`, préfixe le plus
 * long, `Allow` prioritaire à longueur égale, jokers et ancre `$`, cache par
 * hôte — est dans l'historique Git, avec ses vingt-trois cas. La rétablir,
 * c'est `git revert` du commit qui l'a retirée, puis rétablir ce fichier-ci.
 *
 * Ce qui reste vérifié ici a donc une seule utilité : que le module tienne son
 * nouveau contrat sans exploser, et que **personne ne croie** qu'il en tient un
 * autre.
 *
 *   npm run robots:test
 */

import { allowsPath, forgetRobots, parseRobots, robotsAllows, ROBOTS_AGENT } from './robots'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!condition) failures++
}

console.log('\nrobots.txt — le connecteur ne l’applique plus\n')

console.log('1. L’analyse des règles est neutralisée')
const interdits = `
User-agent: *
Disallow: /booking
Disallow: /espace-client
`
check('un fichier pourtant lisible ne produit aucune règle', parseRobots(interdits).length === 0, parseRobots(interdits))
check('un groupe nommé n’en produit pas davantage', parseRobots(`User-agent: ${ROBOTS_AGENT}\nDisallow: /stats`).length === 0)
check('un fichier vide non plus', parseRobots('').length === 0)
check('le jeton d’agent reste annoncé', ROBOTS_AGENT === 'SkitrackRecon', ROBOTS_AGENT)

console.log('\n2. Le verdict est « autorisé », quoi qu’on lui passe')
// Les chemins ci-dessous sont ceux que les centrales interdisent explicitement
// dans leur `robots.txt`. Ils sont cités pour que la portée du choix soit
// lisible ici, et pas seulement dans un en-tête.
for (const chemin of ['/booking', '/espace-client', '/stats', '/carnet-voyage', '/booking?action=result&cid=42', '/']) {
  const verdict = robotsAllows(parseRobots(interdits), chemin)
  check(`« ${chemin} » est autorisé`, verdict.allowed && verdict.rule === null, verdict)
}

console.log('\n3. Le fichier n’est plus demandé du tout')
forgetRobots()
let lectures = 0
const fetcher = async (): Promise<{ status: number; text: string }> => {
  lectures++
  return { status: 200, text: 'User-agent: *\nDisallow: /booking\n' }
}
const verdict = await allowsPath('https://exemple.test', '/booking', fetcher)
check('le chemin est autorisé', verdict.allowed && verdict.rule === null, verdict)
check('et aucune requête n’a été émise vers /robots.txt', lectures === 0, { lectures })

const enPanne = await allowsPath('https://panne.test', '/booking', async () => {
  throw new Error('ECONNREFUSED')
})
check('un hôte injoignable ne change rien — il n’est pas contacté', enPanne.allowed, enPanne)
check('vider le cache reste sans effet et sans erreur', (forgetRobots(), true))

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec.`)
  process.exit(1)
}
console.log('\nComportement permissif constaté — aucune règle n’est appliquée.')
