/**
 * Une teinte par massif.
 *
 * Le massif est la seule catégorie que l'œil peut trier sans lire : sur une
 * mosaïque de quarante vignettes, une pastille teintée dit d'un coup si on
 * regarde des Alpes du Nord ou des Pyrénées, là où le mot noyé dans une ligne
 * de sous-titre demandait de lire chaque carte.
 *
 * La table est **fermée** et partagée : la même couleur doit désigner le même
 * massif sur la vignette, sur la tuile d'accueil et partout ailleurs. Une
 * teinte dérivée du nom par hachage serait stable elle aussi, mais elle
 * donnerait des couleurs arbitraires — et rien n'empêcherait deux massifs
 * voisins de se ressembler.
 *
 * Vosges et Jura partagent la surface neutre : ils comptent peu de domaines et
 * leur donner deux couleurs de plus diluerait les quatre autres.
 */

export interface MassifTint {
  /** Fond de la pastille. */
  soft: string
  /** Texte et bord gauche des tuiles. */
  ink: string
}

const MASSIF_TINTS: Record<string, MassifTint> = {
  'Alpes du Nord': { soft: 'var(--brand-soft)', ink: 'var(--brand)' },
  'Alpes du Sud': { soft: 'var(--warn-soft)', ink: 'var(--warn)' },
  Pyrénées: { soft: 'var(--ok-soft)', ink: 'var(--ok)' },
  'Massif central': { soft: 'var(--violet-soft)', ink: 'var(--violet)' },
  Vosges: { soft: 'var(--surface)', ink: 'var(--text)' },
  Jura: { soft: 'var(--surface)', ink: 'var(--text)' }
}

/** Massif inconnu (référentiel maison) : surface neutre plutôt qu'une couleur
 *  prise au hasard, qui prétendrait le ranger dans une famille. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const MASSIF_TINTS_FOLD: Record<string, MassifTint> = Object.fromEntries(
  Object.entries(MASSIF_TINTS).map(([k, v]) => [fold(k), v])
)

export function massifColor(name: string | null | undefined): MassifTint {
  if (!name) return { soft: 'var(--surface)', ink: 'var(--muted)' }
  return MASSIF_TINTS_FOLD[fold(name)] ?? MASSIF_TINTS[name] ?? { soft: 'var(--surface)', ink: 'var(--muted)' }
}
