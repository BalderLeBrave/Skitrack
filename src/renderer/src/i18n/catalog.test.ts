/**
 * Complétude du catalogue de traduction.
 *
 * Une relecture ne tient pas à l'échelle : le catalogue dépasse les deux cents
 * entrées et sept langues, soit près de mille cinq cents chaînes. Une entrée
 * courte d'une valeur passe inaperçue et se traduit, à l'exécution, par un mot
 * français au milieu d'une interface allemande — le repli sur l'index 0 étant
 * silencieux par construction.
 *
 * Ce test échoue donc sur toute entrée qui n'a pas exactement sept valeurs, ou
 * qui en a une vide. Il ne juge pas la qualité d'une traduction, seulement sa
 * présence : c'est ce qu'une machine peut vérifier.
 *
 *   npx tsx src/renderer/src/i18n/catalog.test.ts
 */

import { LANGUAGES, CATALOG_FOR_TEST } from './index'

const EXPECTED = LANGUAGES.length

let failures = 0
const report = (key: string, problem: string): void => {
  failures++
  console.error(`FAIL  ${key} — ${problem}`)
}

for (const [key, values] of Object.entries(CATALOG_FOR_TEST)) {
  const list = values as readonly string[]
  if (list.length !== EXPECTED) {
    report(key, `${list.length} valeur(s) au lieu de ${EXPECTED}`)
    continue
  }
  const empty = list
    .map((v, i) => (v.trim() === '' ? LANGUAGES[i] : null))
    .filter((l): l is (typeof LANGUAGES)[number] => l !== null)
  if (empty.length > 0) report(key, `valeur vide en ${empty.join(', ')}`)
}

const total = Object.keys(CATALOG_FOR_TEST).length
if (failures > 0) {
  console.error(`\n${failures} entrée(s) incomplète(s) sur ${total}.`)
  process.exit(1)
}
console.log(`Catalogue complet : ${total} entrées × ${EXPECTED} langues.`)
