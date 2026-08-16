/**
 * Vérification isolée de la vignette de résultat.
 *
 * `ResultCard` ne lit ni état global, ni données, ni contexte : elle se rend
 * donc hors application, avec le moteur de rendu serveur de React — déjà
 * présent dans le projet, aucune dépendance ajoutée. Ce qui est vérifié est ce
 * qu'une relecture ne garantit pas dans la durée : la présence des quatre
 * lignes, le repli sur le placeholder, l'étiquette d'accessibilité, et surtout
 * que le squelette rend **le même gabarit** que la carte pleine — c'est ce qui
 * empêche la grille de tressauter quand les résultats arrivent.
 *
 *   npm run cards:test
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { ResultCard, ResultCardSkeleton } from './ResultCard'

let failures = 0
const check = (label: string, condition: boolean): void => {
  if (condition) return
  failures++
  console.error(`FAIL  ${label}`)
}

const full = renderToStaticMarkup(
  <ResultCard
    title="Résidence Cheval Blanc"
    place="Val Thorens · Alpes du Nord"
    factLeft="domaine 1800–3230 m"
    factRight="5 h 40 de route"
    price={{ amount: '1 290 €', unit: 'la semaine' }}
    image="https://exemple.test/photo.jpg"
    ariaLabel="Résidence Cheval Blanc à Val Thorens, 1 290 € la semaine"
    onOpen={() => undefined}
  />
)

check('le titre est rendu', full.includes('Résidence Cheval Blanc'))
check('le lieu est rendu', full.includes('Val Thorens · Alpes du Nord'))
check('les deux faits sont rendus', full.includes('1800–3230 m') && full.includes('5 h 40 de route'))
check('le montant est en gras et l’unité en regular', full.includes('resultcard__amount') && full.includes('resultcard__unit'))
check('l’image est en 4/3 par défaut', full.includes('resultcard__media--wide'))
check('la carte est atteignable au clavier', full.includes('tabindex="0"') && full.includes('role="link"'))
check('l’étiquette d’accessibilité est posée', full.includes('aria-label="Résidence Cheval Blanc à Val Thorens, 1 290 € la semaine"'))

const square = renderToStaticMarkup(
  <ResultCard title="A" ratio="square" ariaLabel="A" price={null} />
)
check('le ratio carré est appliqué', square.includes('resultcard__media--square'))
check('sans onOpen, la carte n’est pas focusable', !square.includes('tabindex'))

const noImage = renderToStaticMarkup(
  <ResultCard title="Sans photo" ariaLabel="Sans photo" placeholder="offre simulée" />
)
check('le placeholder remplace l’image absente', noImage.includes('offre simulée') && !noImage.includes('<img'))

const skeleton = renderToStaticMarkup(<ResultCardSkeleton />)
const loading = renderToStaticMarkup(<ResultCard title="X" ariaLabel="X" loading />)
check('loading rend le squelette', loading === skeleton)
check('le squelette garde le média au même ratio', skeleton.includes('resultcard__media--wide'))
check('le squelette garde le bloc texte', skeleton.includes('resultcard__body'))
check('le squelette a les quatre barres', (skeleton.match(/resultcard__bar /g) ?? []).length === 4)
check('le squelette est ignoré des lecteurs d’écran', skeleton.includes('aria-hidden="true"'))

if (failures > 0) {
  console.error(`\n${failures} vérification(s) en échec.`)
  process.exit(1)
}
console.log('ResultCard : 15 vérifications passées (rendu, ratio, placeholder, accessibilité, squelette).')
