/**
 * Pile d'annulation de l'interface : ouvrir une fiche, retenir un logement.
 *
 * Hors persistance, volontairement. Un Ctrl+Z décrit un geste de l'écran, pas
 * un séjour, et il ne doit pas revenir au redémarrage. Trois fonctions, une
 * pile bornée — pas un historique de document.
 */

export interface UiUndoSnapshot {
  ficheId?: number | null
  selLodgings?: Record<number, number>
}

const MAX = 16
const stack: UiUndoSnapshot[] = []

export function pushUiUndo(snapshot: UiUndoSnapshot): void {
  stack.push(snapshot)
  if (stack.length > MAX) stack.shift()
}

export function popUiUndo(): UiUndoSnapshot | undefined {
  return stack.pop()
}

export function clearUiUndo(): void {
  stack.length = 0
}
