/**
 * Libellé d'origine d'un tarif de forfait.
 *
 * Séparé de `forfait.ts` parce que celui-ci ne doit dépendre de rien : il est
 * couvert par `npm run forfait:test`, qui tourne hors de React et sans
 * catalogue de traduction. Ici on assemble seulement la phrase.
 *
 * Quatre écrans affichent un montant de forfait — la vignette d'un domaine, sa
 * fiche, la fiche d'un logement, le tiroir des voyageurs. Aucun ne doit décrire
 * l'origine à sa façon : c'est ainsi qu'un tarif interpolé finit annoncé
 * « relevé » sur un écran et « estimé » sur le voisin.
 */

import type { TranslationKey } from '@/i18n'
import type { ForfaitPourDuree } from './forfait'
import { forfaitIncertain } from './forfait'

/**
 * Le `t` des composants, tel qu'ils le portent.
 *
 * Typé sur les clés réelles plutôt que sur `string` : c'est le seul moyen
 * qu'une clé mal orthographiée échoue au typecheck plutôt qu'à l'écran. Le
 * module de domaine n'importe qu'un **type**, jamais le catalogue lui-même.
 */
type Traduire = (key: TranslationKey) => string

/** Phrase d'origine, prête pour un `title=`. */
export function passOriginText(pass: ForfaitPourDuree, t: Traduire): string {
  const base = ((): string => {
    switch (pass.origine) {
      case 'saisi':
        return t('pass_origin_saisi').replace('{d}', pass.releveLe ?? '—')
      case 'relevé':
        return t('pass_origin_releve').replace('{n}', String(pass.jours))
      case 'estimé':
        return t('pass_origin_estime')
      case 'interpolé': {
        const [a, b] = pass.bornes ?? [pass.jours, pass.jours]
        // Bornes égales : la durée sort de la grille et on a repris la ligne la
        // plus proche. Ce n'est pas la même chose qu'une interpolation entre
        // deux relevés, et le dire pareil masquerait le cas le plus fragile.
        return a === b
          ? t('pass_origin_borne').replace('{a}', String(a))
          : t('pass_origin_interpole').replace('{a}', String(a)).replace('{b}', String(b))
      }
    }
  })()
  return pass.enfantReleve ? base : `${base} · ${t('pass_child_derived')}`
}

/** Un montant incertain se met en italique, partout de la même façon. */
export function passStyle(pass: ForfaitPourDuree | null): { fontStyle?: 'italic' } {
  return pass && forfaitIncertain(pass.origine) ? { fontStyle: 'italic' } : {}
}

/** Préfixe « ≈ » des montants non relevés, aligné sur `passStyle`. */
export function passPrefix(pass: ForfaitPourDuree | null): string {
  return pass && forfaitIncertain(pass.origine) ? '≈ ' : ''
}
