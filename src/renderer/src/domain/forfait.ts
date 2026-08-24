/**
 * Prix du forfait pour une durée de séjour et une composition de groupe.
 *
 * ## Ce que la source dit, et ce qu'elle ne dit pas
 *
 * Les grilles relevées à la main portent quatre nombres : `j1` (une journée),
 * `j6` (six jours), `enf6` (six jours, tarif enfant) et `saison`. Les durées de
 * deux à cinq jours, et au-delà de six, **ne sont pas publiées**. Elles sont
 * donc estimées ici, et le résultat le dit : `confiance: 'estime'`.
 *
 * C'est tout l'objet de ce module. Jusqu'ici le coût d'un séjour multipliait
 * `j6` par le nombre de skieurs quelle que soit la durée : un week-end de deux
 * jours était facturé six, et le chiffre passait pour un tarif relevé.
 *
 * ## La convention de durée
 *
 * Le séjour se saisit en dates ; le forfait se vend en **jours de ski**. Un
 * séjour de N nuits donne N jours de ski : on arrive la veille au soir et l'on
 * skie jusqu'au départ. C'est la convention des centrales — « 7 nuits / 6 jours
 * de ski » n'existe que pour les séjours du samedi au samedi, où la journée
 * d'arrivée et celle de départ sont perdues en trajet. Prendre les nuits pour
 * des jours surestime donc légèrement les séjours en semaine complète, et
 * l'appelant qui sait mieux passe le nombre de jours qu'il veut.
 *
 * ## Les règles d'estimation
 *
 * * 1 jour → `j1`, **officiel** ;
 * * 6 jours → `j6`, **officiel** ;
 * * 2 à 5 jours → interpolation linéaire de `j1` à `j6`, **estimé** ;
 * * plus de 6 jours → `j6` puis un septième de semaine par jour supplémentaire,
 *   **plafonné au forfait saison** quand il est connu, **estimé** ;
 * * enfants → au prorata `enf6 / j6`, exact à six jours, **estimé** ailleurs ;
 * * grille absente ou incomplète → `null`. Pas de valeur de repli : une
 *   estimation déguisée en mesure est précisément ce que le projet interdit.
 */

import type { Forfait } from '@/data/referentiel'

export type ForfaitConfiance = 'officiel' | 'estime'

export interface ForfaitDuree {
  /** Coût total des forfaits du groupe, en euros. */
  total: number
  /** Coût par jour de ski et par personne, arrondi au centime. */
  parJour: number
  confiance: ForfaitConfiance
  detail: {
    jours: number
    adultes: number
    enfants: number
    /** Prix d'un forfait adulte pour cette durée. */
    adulte: number
    /** Prix d'un forfait enfant pour cette durée, `null` sans enfant. */
    enfant: number | null
    /** Vrai quand le plafond « forfait saison » a mordu. */
    plafonneSaison: boolean
  }
}

export interface Composition {
  adultes: number
  enfants: number
}

/** Jours de ski d'un séjour de N nuits. Voir la convention en tête de module. */
export function joursDeSki(nuits: number): number {
  return Math.max(1, Math.round(nuits))
}

/**
 * Prix d'un forfait adulte pour `jours` jours, ou `null` si la grille se tait.
 *
 * Exporté pour que l'interface puisse afficher un tarif unitaire sans
 * reconstruire une composition de groupe.
 */
export function forfaitAdulte(
  grille: Partial<Forfait> | null | undefined,
  jours: number
): { prix: number; officiel: boolean; plafonneSaison: boolean } | null {
  const j1 = grille?.j1
  const j6 = grille?.j6
  if (j1 == null || j6 == null || !(j1 > 0) || !(j6 > 0)) return null
  const d = Math.max(1, Math.round(jours))

  if (d === 1) return { prix: j1, officiel: true, plafonneSaison: false }
  if (d === 6) return { prix: j6, officiel: true, plafonneSaison: false }

  if (d < 6) {
    // Droite passant par (1, j1) et (6, j6).
    return { prix: (j1 + ((d - 1) * (j6 - j1)) / 5), officiel: false, plafonneSaison: false }
  }

  const brut = j6 + (d - 6) * (j6 / 6)
  const saison = grille?.saison
  // Le forfait saison est un plafond réel : aucune centrale ne vend douze jours
  // plus cher que l'hiver entier.
  if (saison != null && saison > 0 && brut > saison) {
    return { prix: saison, officiel: false, plafonneSaison: true }
  }
  return { prix: brut, officiel: false, plafonneSaison: false }
}

/**
 * Coût des forfaits d'un groupe pour une durée donnée.
 *
 * `null` quand la grille manque : l'appelant affiche « non renseigné », il
 * n'invente pas de tarif.
 */
export function forfaitPourDuree(
  grille: Partial<Forfait> | null | undefined,
  jours: number,
  { adultes, enfants }: Composition
): ForfaitDuree | null {
  const adulte = forfaitAdulte(grille, jours)
  if (!adulte) return null

  const d = Math.max(1, Math.round(jours))
  const a = Math.max(0, Math.round(adultes))
  const e = Math.max(0, Math.round(enfants))
  if (a + e === 0) return null

  // Ratio enfant : relevé à six jours, appliqué tel quel aux autres durées.
  // Une remise enfant ne varie pas avec la durée sur les grilles relevées.
  const j6 = grille?.j6
  const ratio = grille?.enf6 != null && j6 != null && j6 > 0 ? grille.enf6 / j6 : null
  const enfant = e > 0 ? (ratio != null ? adulte.prix * ratio : adulte.prix) : null

  const total = adulte.prix * a + (enfant ?? 0) * e
  // Officiel seulement si toutes les parts du total le sont : le prix enfant
  // n'est relevé qu'à six jours, et le ratio ne vaut que faute de mieux.
  const officiel = adulte.officiel && (e === 0 || (d === 6 && ratio != null))

  return {
    total: Math.round(total),
    parJour: Math.round((total / d / (a + e)) * 100) / 100,
    confiance: officiel ? 'officiel' : 'estime',
    detail: {
      jours: d,
      adultes: a,
      enfants: e,
      adulte: Math.round(adulte.prix),
      enfant: enfant != null ? Math.round(enfant) : null,
      plafonneSaison: adulte.plafonneSaison
    }
  }
}
