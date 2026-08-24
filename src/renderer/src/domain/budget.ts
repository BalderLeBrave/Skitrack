/**
 * Le plafond de budget écarte-t-il cette station ?
 *
 * La règle tient en une phrase : **seule une station dont on sait qu'elle
 * dépasse est écartée**. Un coût partiellement connu ne conclut que dans un
 * sens, un coût inconnu ne conclut pas du tout — et une station qu'on ne sait
 * pas chiffrer reste affichée, budget « n.c. », plutôt que de disparaître sans
 * que rien ne le dise.
 *
 * C'est la différence entre un filtre et une trappe. Masquer par défaut ce
 * qu'on ne sait pas mesurer donnerait une liste courte et fausse, où l'absence
 * de relevé se lirait comme un prix trop élevé.
 */

export type BudgetVerdict = 'dans' | 'au-dessus' | 'inconnu'

export interface BudgetParts {
  /** Coût complet du séjour, `null` dès qu'un poste manque. */
  total: number | null
  /** Part des forfaits seule, connue même quand le logement ne l'est pas. */
  forfaits: number | null
}

export function budgetVerdict(parts: BudgetParts, plafond: number | null): BudgetVerdict {
  if (plafond == null || !(plafond > 0)) return 'dans'
  if (parts.total != null) return parts.total <= plafond ? 'dans' : 'au-dessus'
  // Le logement manque. Les forfaits suffisent à trancher s'ils crèvent déjà le
  // plafond à eux seuls : rien de ce qu'on ignore ne peut faire redescendre le
  // total. Dans l'autre sens ils ne prouvent rien.
  if (parts.forfaits != null && parts.forfaits > plafond) return 'au-dessus'
  return 'inconnu'
}

/** Un verdict « inconnu » laisse passer : il ne masque jamais. */
export function budgetHides(parts: BudgetParts, plafond: number | null): boolean {
  return budgetVerdict(parts, plafond) === 'au-dessus'
}
