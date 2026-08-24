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
 * Le séjour se saisit en dates ; le forfait se vend en **jours de ski**. La
 * conversion suit ce que vendent les centrales, pas une règle d'arithmétique :
 *
 * * moins de sept nuits → autant de jours que de nuits. Un week-end du vendredi
 *   soir au dimanche compte deux nuits et se skie bien deux jours ;
 * * sept nuits ou plus → une nuit de moins. La semaine du samedi au samedi est
 *   vendue « 7 nuits / 6 jours de ski » : on arrive le samedi soir, on repart
 *   le samedi matin, et le forfait court du dimanche au vendredi.
 *
 * La règle a donc une discontinuité entre six et sept nuits, qui donnent toutes
 * deux six jours. C'est la réalité commerciale, pas une approximation : elle
 * fait tomber le séjour par défaut de l'application sur `j6`, un tarif
 * **relevé**, là où compter sept jours l'aurait fait basculer vers une
 * estimation 17 % plus chère.
 *
 * L'appelant qui sait mieux passe directement son nombre de jours.
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
  const n = Math.max(1, Math.round(nuits))
  return n >= 7 ? n - 1 : n
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

export interface ForfaitUnitaires {
  /** Prix d'un forfait adulte pour cette durée, arrondi à l'euro. */
  adulte: number
  /** Prix d'un forfait enfant pour cette durée, arrondi à l'euro. */
  enfant: number
  /** Vrai quand le tarif enfant vient du relevé et non du ratio. */
  enfantReleve: boolean
  officiel: boolean
  plafonneSaison: boolean
}

/**
 * Prix unitaires **arrondis à l'euro**, adulte et enfant, pour une durée.
 *
 * L'arrondi se fait ici et une seule fois : le coût du groupe additionne ces
 * mêmes entiers. Arrondir le total après coup l'aurait fait diverger du
 * partage par foyer, qui somme personne par personne — un écart d'un ou deux
 * euros entre deux écrans qui affichent la même chose.
 */
export function forfaitUnitaires(
  grille: Partial<Forfait> | null | undefined,
  jours: number
): ForfaitUnitaires | null {
  const adulte = forfaitAdulte(grille, jours)
  if (!adulte) return null
  const d = Math.max(1, Math.round(jours))
  const j6 = grille?.j6

  // Ratio enfant : relevé à six jours, appliqué tel quel aux autres durées.
  // Une remise enfant ne varie pas avec la durée sur les grilles relevées.
  const ratio = grille?.enf6 != null && j6 != null && j6 > 0 ? grille.enf6 / j6 : null
  return {
    adulte: Math.round(adulte.prix),
    enfant: Math.round(ratio != null ? adulte.prix * ratio : adulte.prix),
    enfantReleve: d === 6 && ratio != null,
    officiel: adulte.officiel,
    plafonneSaison: adulte.plafonneSaison
  }
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
  const unit = forfaitUnitaires(grille, jours)
  if (!unit) return null

  const d = Math.max(1, Math.round(jours))
  const a = Math.max(0, Math.round(adultes))
  const e = Math.max(0, Math.round(enfants))
  if (a + e === 0) return null

  const total = unit.adulte * a + unit.enfant * e
  // Officiel seulement si toutes les parts du total le sont : le prix enfant
  // n'est relevé qu'à six jours, et le ratio ne vaut que faute de mieux.
  const officiel = unit.officiel && (e === 0 || unit.enfantReleve)

  return {
    total,
    parJour: Math.round((total / d / (a + e)) * 100) / 100,
    confiance: officiel ? 'officiel' : 'estime',
    detail: {
      jours: d,
      adultes: a,
      enfants: e,
      adulte: unit.adulte,
      enfant: e > 0 ? unit.enfant : null,
      plafonneSaison: unit.plafonneSaison
    }
  }
}
