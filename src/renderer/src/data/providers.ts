/**
 * Les sources de logement, telles que l'interface les nomme et les colore.
 *
 * ## Pourquoi la clé est le libellé, et non l'identifiant
 *
 * L'application ne filtre pas par connecteur mais par **libellé affiché** :
 * `srcOf()` rend « Booking.com », `lodgingSources()` dédoublonne là-dessus et
 * `state.lodgSrcOff` retient ces mêmes chaînes. C'est délibéré — Booking a une
 * API *et* un scraper web, sept implémentations servent la seule « centrale de
 * réservation », et l'utilisateur n'a pas à choisir entre deux chemins vers le
 * même inventaire (voir `SOURCE_LABEL` dans `runProviderSearch.ts`).
 *
 * Une table indexée par `'booking'` ne rencontrerait donc jamais les puces, qui
 * portent `'Booking.com'`. `getProvider()` accepte les deux, et c'est le
 * libellé qui fait foi.
 *
 * ## Pourquoi les libellés ne sont pas réécrits ici
 *
 * Ils sont dérivés de `sourceLabelOf()`, seule table de vérité. Recopier
 * « Gîtes de France » en dur créerait un second endroit à corriger le jour où
 * un libellé change — et le silence quand on oublie le second.
 *
 * ## Pourquoi aucune classe Tailwind
 *
 * Le projet n'a pas Tailwind : les teintes vivent dans `styles.css`, sous
 * `.provbadge--<id>`. `id` est donc à la fois l'identifiant technique et le
 * suffixe de la classe — rien à synchroniser à la main.
 *
 * ## Ce que cette table ne décide pas
 *
 * Quelles sources sont *affichées*. Cela reste le travail de
 * `lodgingSources()`, qui n'annonce que les connecteurs réellement interrogés
 * et les sources réellement présentes. Une entrée ici ne fait apparaître aucune
 * puce ; elle habille celles qui apparaissent.
 */

import { CENTRALE_SOURCE, MANUAL_SOURCE } from '@/data/lodgings'
import { sourceLabelOf } from '@/data/runProviderSearch'

/**
 * Nature du lien avec la source — information de maintenance, pas un choix
 * offert à l'utilisateur. Elle sert à trier les puces, jamais à les étiqueter.
 */
export type ProviderKind = 'scraping' | 'redirect' | 'api' | 'centrale' | 'manual'

export interface ProviderConfig {
  /** Identifiant technique stable, et suffixe de la classe CSS de teinte. */
  id: string
  /** Libellé affiché — **la** clé des puces et de `lodgSrcOff`. */
  label: string
  kind: ProviderKind
  /**
   * Connecteurs regroupés sous ce libellé, tels que le moteur les nomme.
   * Vide quand la source ne vient d'aucun connecteur (import manuel).
   */
  connectors: string[]
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'airbnb',
    label: sourceLabelOf('airbnb'),
    // Relevé parallèle (Omkar / Playwright), hors SearchEngine — voir runAirbnbSearch.
    kind: 'redirect',
    connectors: ['airbnb']
  },
  {
    id: 'booking',
    label: sourceLabelOf('booking'),
    kind: 'scraping',
    connectors: ['booking', 'booking-web']
  },
  {
    id: 'expedia',
    label: sourceLabelOf('expedia'),
    kind: 'scraping',
    connectors: ['expedia', 'expedia-web']
  },
  {
    id: 'vrbo',
    // Abritel = même plateforme. Le connecteur reste `vrbo-web`.
    label: sourceLabelOf('vrbo-web'),
    kind: 'scraping',
    connectors: ['vrbo-web']
  },
  {
    id: 'gites',
    label: sourceLabelOf('gites-de-france'),
    kind: 'scraping',
    connectors: ['gites-de-france', 'gites-web']
  },
  {
    id: 'liteapi',
    label: sourceLabelOf('liteapi'),
    kind: 'api',
    connectors: ['liteapi']
  },
  {
    id: 'centrale',
    label: CENTRALE_SOURCE,
    kind: 'centrale',
    connectors: [
      'station-web',
      'ceto-chamonix',
      'ceto-meribel',
      'ceto-plagne',
      'ceto-megeve',
      'ublo-msem',
      'opensystem',
      'deskline',
      'locvacances',
      'diffusio'
    ]
  },
  {
    id: 'manual',
    label: MANUAL_SOURCE,
    kind: 'manual',
    connectors: []
  }
]

const BY_LABEL = new Map(PROVIDERS.map((p) => [p.label, p]))
const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]))

/**
 * La configuration d'une source, par libellé (`'Booking.com'`) ou par
 * identifiant (`'booking'`).
 *
 * Rend `undefined` pour tout ce que cette table ne connaît pas — une source MCP
 * déclarée par l'utilisateur porte le nom qu'il lui a donné. L'appelant doit
 * alors afficher ce nom tel quel : mieux vaut une source au nom technique
 * visible qu'une source silencieusement effacée.
 */
export function getProvider(idOrLabel: string): ProviderConfig | undefined {
  return BY_LABEL.get(idOrLabel) ?? BY_ID.get(idOrLabel)
}

/**
 * Les configurations correspondant aux libellés effectivement à l'écran, dans
 * l'ordre où ils arrivent. Les libellés inconnus sont écartés — l'appelant les
 * a déjà, et c'est lui qui décide de les afficher bruts.
 */
export function activeProviders(queried: string[]): ProviderConfig[] {
  const out: ProviderConfig[] = []
  for (const label of queried) {
    const found = getProvider(label)
    if (found && !out.includes(found)) out.push(found)
  }
  return out
}
