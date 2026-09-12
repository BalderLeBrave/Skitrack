// Fichier généré depuis design/v6, ne pas éditer à la main.
//
// Source : design/v6/SKITRACK - App v6 (parcours complet).html, bloc `:root`
// (ligne 13). Contrat : docs/design/v6-contrat.md, § 1.
//
//   git hash-object  c9d9775640408a5348a8579c91de07cabb768511  (HTML)
//   git hash-object  e30189ba5b84fb5b9578f15081b5ce6ccf393ce4  (image-slot.js)
//
// Toute modification de la maquette invalide ce fichier : il doit être
// régénéré depuis le bloc `:root`, jamais complété à la main. Une valeur
// ajoutée ici sans exister dans la maquette sort le fichier du contrat.

/** Noms des variables CSS, tels qu'écrits dans le bloc `:root`. */
export const v6CssVar = {
  bg: '--bg',
  glacier: '--glacier',
  ink: '--ink',
  cta: '--cta',
  texte2: '--texte-2',
  texte3: '--texte-3',
  bordure: '--bordure',
  bordureDouce: '--bordure-douce',
  marque: '--marque',
  marqueTenue: '--marque-tenue',
  marqueTexte: '--marque-texte',
  neige: '--neige',
  neigeTexte: '--neige-texte',
  ok: '--ok',
  okTexte: '--ok-texte',
  mono: '--mono',
  side: '--side',
  shadow: '--shadow',
} as const

/** Valeurs littérales du bloc `:root`, dans l'ordre du source. */
export const v6Token = {
  bg: '#f7fbfe',
  glacier: '#e8f3fa',
  ink: '#0b1f33',
  cta: '#ff5a3c',
  texte2: '#63717d',
  texte3: '#768593',
  bordure: '#c9d3dc',
  bordureDouce: '#e9eef2',
  marque: '#0b6fc2',
  marqueTenue: '#eef6fd',
  marqueTexte: '#0959a0',
  neige: '#bfe0f7',
  neigeTexte: '#133f63',
  ok: '#d3efe3',
  okTexte: '#0a6b4a',
  mono: 'inherit',
  side: '440px',
  shadow: '0 1px 2px rgba(17,24,32,.04),0 4px 12px rgba(17,24,32,.07)',
} as const

export type V6TokenName = keyof typeof v6Token

/** Référence `var(--x)` à utiliser dans les composants, jamais la valeur brute. */
export const v6 = Object.fromEntries(
  (Object.keys(v6CssVar) as V6TokenName[]).map((k) => [k, `var(${v6CssVar[k]})`]),
) as { readonly [K in V6TokenName]: `var(${(typeof v6CssVar)[K]})` }

/**
 * Bloc `:root` recopié à l'identique, à injecter une seule fois dans la
 * feuille de style globale. C'est la seule source des variables CSS.
 */
export const v6RootCss = `:root { --bg:#f7fbfe; --glacier:#e8f3fa; --ink:#0b1f33; --cta:#ff5a3c; --texte-2:#63717d; --texte-3:#768593; --bordure:#c9d3dc; --bordure-douce:#e9eef2; --marque:#0b6fc2; --marque-tenue:#eef6fd; --marque-texte:#0959a0; --neige:#bfe0f7; --neige-texte:#133f63; --ok:#d3efe3; --ok-texte:#0a6b4a; --mono:inherit; --side:440px; --shadow:0 1px 2px rgba(17,24,32,.04),0 4px 12px rgba(17,24,32,.07); }`
