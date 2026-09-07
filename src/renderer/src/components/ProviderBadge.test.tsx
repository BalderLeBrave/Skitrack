/**
 * Vérification isolée de la pastille de source.
 *
 * `ProviderBadge` est présentationnelle : elle se rend hors application, avec
 * le moteur de rendu serveur de React, comme `ResultCard`.
 *
 * Ce qui est vérifié est précisément ce qu'une relecture ne garantit pas :
 * que la pastille se résout par **libellé** — la clé réellement utilisée par
 * les puces de filtre et par `srcOf()` — et pas seulement par identifiant. Une
 * table indexée par `'booking'` compilerait sans broncher et n'habillerait
 * jamais une seule puce.
 *
 * Et qu'une source inconnue reste affichée : les sources MCP portent le nom que
 * l'utilisateur leur a donné, qu'aucune table ne peut prévoir.
 *
 *   npm run provbadge:test
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { ProviderBadge } from './ProviderBadge'
import { PROVIDERS, activeProviders, getProvider } from '@/data/providers'
import { CENTRALE_SOURCE, MANUAL_SOURCE } from '@/data/lodgings'
import { sourceLabelOf } from '@/data/runProviderSearch'

let failures = 0
const check = (label: string, condition: boolean): void => {
  if (condition) return
  failures++
  console.error(`FAIL  ${label}`)
}

// --- La résolution, le vrai piège -----------------------------------------

const bookingLabel = sourceLabelOf('booking-web')
check(
  'le libellé regroupé résout vers la configuration',
  getProvider(bookingLabel)?.id === 'booking'
)
check('l’identifiant résout aussi', getProvider('booking')?.id === 'booking')
check('la centrale résout par son libellé unique', getProvider(CENTRALE_SOURCE)?.id === 'centrale')
check('l’import manuel résout', getProvider(MANUAL_SOURCE)?.id === 'manual')
check('une source inconnue ne résout pas', getProvider('Ma source MCP') === undefined)

check(
  'chaque libellé de la table est unique',
  new Set(PROVIDERS.map((p) => p.label)).size === PROVIDERS.length
)
check(
  'chaque connecteur déclaré porte bien le libellé de sa configuration',
  PROVIDERS.every((p) => p.connectors.every((c) => sourceLabelOf(c) === p.label))
)

// --- Le rendu ---------------------------------------------------------------

const booking = renderToStaticMarkup(<ProviderBadge provider={bookingLabel} />)
check('le nom est rendu', booking.includes(bookingLabel))
check('la teinte de la marque est posée', booking.includes('provbadge--booking'))
check('la pastille de couleur est décorative', booking.includes('aria-hidden="true"'))
check('le nom visible ne double pas l’étiquette', !booking.includes('aria-label'))

const unknown = renderToStaticMarkup(<ProviderBadge provider="Ma source MCP" />)
check('une source inconnue reste affichée', unknown.includes('Ma source MCP'))
check('avec une teinte neutre', unknown.includes('provbadge--unknown'))

const dotOnly = renderToStaticMarkup(<ProviderBadge provider="Airbnb" showName={false} />)
check('sans nom, l’étiquette porte la source', dotOnly.includes('aria-label="Airbnb"'))
check('sans nom, aucun texte n’est rendu', !dotOnly.includes('provbadge__name'))

const small = renderToStaticMarkup(<ProviderBadge provider="Airbnb" size="sm" />)
check('la taille est une classe, jamais un style en ligne', small.includes('provbadge--sm') && !small.includes('style='))

// --- activeProviders --------------------------------------------------------

const active = activeProviders([bookingLabel, 'Airbnb', 'Ma source MCP', bookingLabel])
check('les libellés connus sont retenus, dans l’ordre', active.map((p) => p.id).join(',') === 'booking,airbnb')
check('les inconnus sont écartés, sans doublon', active.length === 2)

if (failures > 0) {
  console.error(`\n${failures} échec(s).`)
  process.exit(1)
}
console.log('Pastille de source : tous les cas passent.')
