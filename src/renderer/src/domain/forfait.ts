/**
 * Tarif de forfait pour une durée donnée.
 *
 * ## Le défaut que ce module corrige
 *
 * Le coût du séjour facturait `forfait.j6` quelle que soit la durée : un
 * week-end de deux nuits était chiffré au forfait 6 jours, et un séjour de
 * quinze jours aussi. C'était la seule grandeur du calcul qui ne regardait pas
 * les dates saisies.
 *
 * ## Trois niveaux, jamais confondus
 *
 * 1. **Saisi** — l'utilisateur a relevé la grille sur le site de la station et
 *    l'a entrée. Il prime sur tout, y compris sur le référentiel livré : c'est
 *    lui qui a regardé le tarif du jour.
 * 2. **Relevé** — le référentiel livré porte le tarif pour cette durée exacte.
 *    Il ne connaît que deux durées, `j1` et `j6`.
 * 3. **Interpolé** — la durée demandée n'a pas été relevée, mais elle tombe
 *    entre deux qui l'ont été. On interpole linéairement, et **on le dit**.
 *
 * `estimé` reste à part : c'est le tarif dérivé des kilomètres de pistes et de
 * l'altitude pour les domaines sans relevé (`estimateForfait`). Interpoler une
 * estimation ne la rend pas meilleure — l'origine reste `estimé`.
 *
 * ## Jours de ski, pas nuits
 *
 * Une semaine au ski, c'est sept nuits et six jours de forfait : on arrive le
 * dimanche soir et on repart le dimanche matin. `joursDeSki` applique cette
 * convention, qui est aussi celle qu'appliquait l'ancien code en facturant
 * `j6` sur un séjour de sept nuits.
 */

import type { Forfait } from '@/data/referentiel'

/** D'où vient le montant affiché. Jamais deviné, toujours porté. */
export type ForfaitOrigine = 'saisi' | 'relevé' | 'interpolé' | 'estimé'

/** D'où l'utilisateur a tiré le tarif qu'il saisit. */
export type ForfaitSource = 'officiel' | 'office' | 'autre'

/** Une ligne de la grille : une durée, un tarif adulte, un tarif enfant. */
export interface ForfaitTarif {
  /** Nombre de jours de ski vendus. */
  jours: number
  adulte: number
  /** `null` quand la grille ne publie pas de tarif enfant pour cette durée. */
  enfant: number | null
}

/**
 * Grille relevée à la main par l'utilisateur, pour un domaine.
 *
 * Volontairement partielle : deux durées valent mieux que rien, et
 * `forfaitPourDuree` interpole entre elles en l'annonçant. Exiger la grille
 * complète reviendrait à n'en obtenir aucune.
 */
export interface ForfaitSaisi {
  tarifs: ForfaitTarif[]
  /** Date du relevé, AAAA-MM-JJ. Obligatoire : un tarif sans date ne vaut rien. */
  releveLe: string
  source: ForfaitSource
  /** URL ou nom de la formule. Facultatif. */
  note?: string
}

export type ForfaitsSaisis = Record<number, ForfaitSaisi>

export interface ForfaitPourDuree {
  jours: number
  adulte: number
  /** Dérivé du tarif adulte quand la grille se tait — voir `RATIO_ENFANT`. */
  enfant: number
  /** Le tarif enfant a-t-il été relevé, ou dérivé du tarif adulte ? */
  enfantReleve: boolean
  origine: ForfaitOrigine
  /** Durées encadrant l'interpolation. `null` hors interpolation. */
  bornes: [number, number] | null
  /** Date du relevé saisi. `null` pour le référentiel livré et l'estimation. */
  releveLe: string | null
}

/**
 * Tarif enfant à défaut de relevé : 80 % de l'adulte.
 *
 * Le ratio est celui de `enfantPrice`, et il est stable sur les tarifs relevés
 * (0,799 à 0,849). Il reste une dérivation : `enfantReleve` le dit.
 */
const RATIO_ENFANT = 0.8

/** Sept nuits font six jours de ski. Au moins un : un séjour d'une nuit skie. */
export function joursDeSki(nuits: number): number {
  return Math.max(1, nuits - 1)
}

interface Resolution {
  adulte: number
  enfant: number
  enfantReleve: boolean
  exact: boolean
  bornes: [number, number] | null
}

/**
 * Résout une grille — saisie ou livrée — pour une durée.
 *
 * Trois cas seulement, dans cet ordre : la durée est dans la grille, elle est
 * encadrée par deux durées de la grille, elle sort de la grille. Le dernier cas
 * ne fabrique rien de neuf : il reprend le tarif de la borne la plus proche et
 * se déclare interpolé, plutôt que d'extrapoler une pente sur laquelle rien n'a
 * été observé — une semaine de ski ne coûte pas sept fois la journée.
 */
function resoudre(tarifs: ForfaitTarif[], jours: number): Resolution | null {
  const grille = [...tarifs]
    .filter((t) => t.jours > 0 && t.adulte > 0)
    .sort((a, b) => a.jours - b.jours)
  if (grille.length === 0) return null

  const derive = (t: ForfaitTarif): number => t.enfant ?? Math.round(t.adulte * RATIO_ENFANT)

  const exact = grille.find((t) => t.jours === jours)
  if (exact) {
    return {
      adulte: exact.adulte,
      enfant: derive(exact),
      enfantReleve: exact.enfant != null,
      exact: true,
      bornes: null
    }
  }

  const bas = [...grille].reverse().find((t) => t.jours < jours)
  const haut = grille.find((t) => t.jours > jours)

  // Hors grille : la borne la plus proche, sans extrapoler.
  const proche = bas && haut ? null : (bas ?? haut)
  if (proche) {
    return {
      adulte: proche.adulte,
      enfant: derive(proche),
      enfantReleve: proche.enfant != null,
      exact: false,
      bornes: [proche.jours, proche.jours]
    }
  }
  if (!bas || !haut) return null

  const part = (jours - bas.jours) / (haut.jours - bas.jours)
  const adulte = Math.round(bas.adulte + part * (haut.adulte - bas.adulte))
  // Le tarif enfant s'interpole quand les deux bornes le publient ; sinon il se
  // dérive de l'adulte interpolé, et se déclare dérivé.
  const basEnf = bas.enfant
  const hautEnf = haut.enfant
  const enfantReleve = basEnf != null && hautEnf != null
  const enfant =
    basEnf != null && hautEnf != null
      ? Math.round(basEnf + part * (hautEnf - basEnf))
      : Math.round(adulte * RATIO_ENFANT)

  return { adulte, enfant, enfantReleve, exact: false, bornes: [bas.jours, haut.jours] }
}

/** La grille que porte le référentiel livré : deux durées, pas une de plus. */
export function forfaitUnitaires(f: Partial<Forfait>): ForfaitTarif[] {
  const out: ForfaitTarif[] = []
  if (f.j1 != null && f.j1 > 0) out.push({ jours: 1, adulte: f.j1, enfant: null })
  if (f.j6 != null && f.j6 > 0) out.push({ jours: 6, adulte: f.j6, enfant: f.enf6 ?? null })
  return out
}

/**
 * Tarif adulte et enfant pour une durée, avec son origine.
 *
 * `saisi` prime : c'est le relevé le plus récent, et le seul daté. À défaut, le
 * référentiel livré. `estime` marque les domaines dont le tarif est dérivé des
 * kilomètres de pistes — l'origine reste `estimé` même après interpolation,
 * parce qu'interpoler entre deux estimations donne une estimation.
 */
export function forfaitPourDuree(
  livre: Partial<Forfait>,
  estime: boolean,
  saisi: ForfaitSaisi | undefined,
  jours: number
): ForfaitPourDuree | null {
  const j = Math.max(1, Math.round(jours))

  if (saisi) {
    const r = resoudre(saisi.tarifs, j)
    if (r) {
      return {
        jours: j,
        adulte: r.adulte,
        enfant: r.enfant,
        enfantReleve: r.enfantReleve,
        origine: r.exact ? 'saisi' : 'interpolé',
        bornes: r.bornes,
        releveLe: saisi.releveLe
      }
    }
  }

  const r = resoudre(forfaitUnitaires(livre), j)
  if (!r) return null
  return {
    jours: j,
    adulte: r.adulte,
    enfant: r.enfant,
    enfantReleve: r.enfantReleve,
    origine: estime ? 'estimé' : r.exact ? 'relevé' : 'interpolé',
    bornes: r.bornes,
    releveLe: null
  }
}

/** Un montant dont l'origine n'est pas un relevé s'affiche en italique. */
export function forfaitIncertain(origine: ForfaitOrigine): boolean {
  return origine === 'interpolé' || origine === 'estimé'
}
