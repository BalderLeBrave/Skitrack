/**
 * Pont entre l'écran « Ma sélection » et la base du processus principal.
 *
 * Deux responsabilités, et rien d'autre.
 *
 * **Charger au démarrage.** `selection.db` fait foi dès que l'application
 * s'ouvre : les notes et les votes qu'elle contient écrasent ce que le
 * `localStorage` avait restauré. C'est voulu — la base est la source, les
 * préférences n'en sont plus qu'un vestige.
 *
 * **Reprendre l'ancien une fois.** Les notes écrites avant la bascule vivent
 * encore dans les préférences. Elles sont poussées en base au premier
 * lancement, puis le drapeau `legacyImported` empêche toute reprise ultérieure.
 * `selNotes` reste donc dans `PERSISTED_KEYS` le temps d'une version : le
 * retirer maintenant priverait la reprise de sa source. À enlever ensuite.
 *
 * ## La conversion des votes, qui n'est pas cosmétique
 *
 * L'écran indexe les votes **par rang de votant** dans `state.people` ;
 * la base les indexe par identifiant de personne. Ce hook fait la traduction
 * dans les deux sens. C'est précisément l'intérêt de la bascule : retirer un
 * voyageur décalait les rangs et réattribuait silencieusement les votes des
 * suivants, ce qu'un identifiant ne permet plus.
 */

import { useCallback, useEffect, useRef } from 'react'
import type { SelectionKind, SelectionSnapshot } from '@shared/ipc-contract'
import { selectionVoteKey, useApp } from '@/state/appState'

/** Les votes de la base, retraduits en tableaux indexés par rang de votant. */
function votesParRang(
  snapshot: SelectionSnapshot,
  people: { id: number }[],
  anciens: Record<string, number[]>
): Record<string, number[]> {
  // On repart des votes non liés à la sélection : `state.votes` sert aussi
  // ailleurs, et la base ne connaît que les clés `sel:`.
  const out: Record<string, number[]> = {}
  for (const [cle, tableau] of Object.entries(anciens)) {
    if (!cle.startsWith('sel:')) out[cle] = tableau
  }
  for (const v of snapshot.votes) {
    const rang = people.findIndex((p) => p.id === v.voterId)
    // Un vote dont le votant a quitté le groupe reste en base mais ne
    // s'affiche plus. Il n'est pas effacé : la personne peut revenir.
    if (rang < 0) continue
    const cle = selectionVoteKey(v.kind, v.targetId)
    const tableau = out[cle] ?? []
    tableau[rang] = v.value
    out[cle] = tableau
  }
  return out
}

export interface SelectionActions {
  addNote: (kind: SelectionKind, targetId: number, body: string) => void
  removeNote: (id: number) => void
  setVote: (kind: SelectionKind, targetId: number, value: 1 | -1 | 0) => void
}

/**
 * Recopie un instantané de la base dans l'état de l'écran.
 *
 * Partagé par la synchronisation et par les verbes d'écriture : la base rend
 * l'état complet après chaque mutation, et c'est toujours par ici qu'il entre.
 */
function useAppliquer(): (snapshot: SelectionSnapshot) => void {
  const { state, patch } = useApp()
  const dernier = useRef({ state, patch })
  dernier.current = { state, patch }
  return useCallback((snapshot: SelectionSnapshot): void => {
    const { state: s, patch: p } = dernier.current
    p({
      selNotes: snapshot.notes.map((n) => ({
        id: n.id,
        kind: n.kind,
        targetId: n.targetId,
        authorId: n.authorId,
        createdAt: n.createdAt,
        body: n.body
      })),
      votes: votesParRang(snapshot, s.people, s.votes)
    })
  }, [])
}

/**
 * Charge la base et reprend l'ancien, une seule fois.
 *
 * À appeler haut dans l'arbre, pas dans un composant de liste : deux appels
 * lanceraient deux reprises concurrentes.
 */
export function useSelectionSync(): void {
  const { state, patch } = useApp()
  const appliquer = useAppliquer()

  // L'état au moment du montage suffit à la reprise : elle lit ce que les
  // préférences ont restauré, qui ne bougera plus.
  const dernier = useRef({ state, patch })
  dernier.current = { state, patch }

  useEffect(() => {
    let annule = false
    const { state: s } = dernier.current

    void (async () => {
      try {
        let snapshot = await window.skitrack.selection.load()
        if (annule) return

        if (!snapshot.legacyImported) {
          // Ce que les préférences portaient encore. Les votes y sont indexés
          // par rang : on les rattache à l'identifiant de la personne du rang
          // correspondant, et on abandonne ceux dont le rang ne désigne
          // personne — ils n'étaient déjà attribuables à personne.
          const votes = Object.entries(s.votes)
            .filter(([cle]) => cle.startsWith('sel:'))
            .flatMap(([cle, tableau]) => {
              const [, kind, id] = cle.split(':')
              return tableau.flatMap((valeur, rang) => {
                const personne = s.people[rang]
                if (!personne || valeur === 0) return []
                return [
                  {
                    kind: kind as SelectionKind,
                    targetId: Number(id),
                    voterId: personne.id,
                    value: valeur > 0 ? (1 as const) : (-1 as const)
                  }
                ]
              })
            })
          snapshot = await window.skitrack.selection.apply({
            type: 'import-legacy',
            notes: s.selNotes.map((n) => ({
              kind: n.kind,
              targetId: n.targetId,
              authorId: n.authorId,
              createdAt: n.createdAt,
              body: n.body
            })),
            votes
          })
          if (annule) return
        }

        appliquer(snapshot)
      } catch {
        // Base injoignable : l'écran garde ce que les préférences ont restauré.
        // Une sélection en lecture seule vaut mieux qu'un écran vide, et le
        // prochain démarrage retentera.
      }
    })()

    return () => {
      annule = true
    }
  }, [appliquer])
}

/**
 * Les trois écritures. Chacune passe par la base et rend l'état résultant :
 * l'écran ne construit jamais son propre identifiant de note ni son propre
 * compte de votes.
 */
export function useSelectionActions(): SelectionActions {
  const { state, patch } = useApp()
  const appliquer = useAppliquer()
  const dernier = useRef({ state, patch })
  dernier.current = { state, patch }

  const addNote = useCallback(
    (kind: SelectionKind, targetId: number, body: string): void => {
      const { state: s } = dernier.current
      void window.skitrack.selection
        .apply({
          type: 'note-add',
          kind,
          targetId,
          // `-1` quand le groupe n'est pas renseigné : la note existe quand
          // même, elle n'est simplement attribuée à personne.
          authorId: s.people[s.voter]?.id ?? -1,
          body
        })
        .then(appliquer)
        .catch(() => undefined)
    },
    [appliquer]
  )

  const removeNote = useCallback(
    (id: number): void => {
      void window.skitrack.selection
        .apply({ type: 'note-remove', id })
        .then(appliquer)
        .catch(() => undefined)
    },
    [appliquer]
  )

  const setVote = useCallback(
    (kind: SelectionKind, targetId: number, value: 1 | -1 | 0): void => {
      const { state: s } = dernier.current
      const voterId = s.people[s.voter]?.id
      // Sans voyageur renseigné, il n'y a pas de votant : le vote n'est pas
      // enregistré plutôt que d'être attribué à un identifiant inventé.
      if (voterId == null) return
      void window.skitrack.selection
        .apply({ type: 'vote-set', kind, targetId, voterId, value })
        .then(appliquer)
        .catch(() => undefined)
    },
    [appliquer]
  )

  return { addNote, removeNote, setVote }
}
